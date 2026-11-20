// -----------------------------------------------------------------------------
// The SL service: the watched stops (configuration actions, /data), their
// devices, the refresh timer (one departures request per created device, the
// traffic messages every five minutes), the states and the scene triggers.
//
// Triggers fire once per journey (and per threshold), never at the first read
// of a stop: what was already there when the integration started is not news.
// Cancellations and traffic messages already announced are kept in /data, so a
// restart does not announce them again; the "leave now" and delay thresholds
// are kept in memory only (a journey lives an hour or two, and /data is often
// an SD card).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { aged, applyFilters, clockTime, fold, messagesFor, parseDepartures } from './departures.js';
import { buildStopDevice, clip, stopStates, watchKey, watchName, STOP_TYPE } from './devices.js';
import { ActionFailure } from './errors.js';
import { TEXT, modeName, say, sayAll } from './messages.js';
import { MODES, Sl, parseSiteId } from './sl.js';

const logger = createLogger({ name: 'sl' });

export const TRIGGERS = {
  SOON: 'departure_soon',
  DELAYED: 'departure_delayed',
  CANCELLED: 'departure_cancelled',
  DISRUPTION: 'new_disruption',
};
// Options of the threshold filters of the triggers (manifest `scene_triggers`).
// Few values: every one reached is an event, and the core takes 300 a minute.
export const SOON_MINUTES = [1, 2, 3, 5, 7, 10, 12, 15, 20];
export const DELAY_MINUTES = [1, 2, 3, 5, 10, 15, 20, 30, 60];
// One request per watched stop and refresh: kept low, the API is shared.
export const MAX_WATCHES = 10;
// The traffic messages change slowly and weigh ~200 kB: read this often.
export const MESSAGES_EVERY_MS = 5 * 60 * 1000;
const SEARCH_RESULTS = 8;
// A value that does not change is published again this often, so that Gladys
// does not show it as stale ("no recent value" after 48 h).
const HEARTBEAT_MS = 6 * 3600 * 1000;
// Announced cancellations and messages are forgotten two days after they were
// last seen; their "last seen" is written at most hourly.
const MEMORY_MS = 48 * 3600 * 1000;
const SEEN_WRITE_MS = 3600 * 1000;
// "Time to leave" and delay thresholds of a journey, kept in memory this long
// after its aimed time.
const JOURNEY_MEMORY_MS = 2 * 3600 * 1000;
// Scene events sent per minute at most: the core refuses more than 300.
const EVENTS_PER_MINUTE = 200;

/** "18, 17 ; 43x" → ["17", "18", "43X"]: sorted, so the order typed does not matter. */
export function parseLines(text) {
  return [
    ...new Set(
      String(text ?? '')
        .split(/[\s,;]+/)
        .map((line) => line.trim().toUpperCase())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/** The SL line ids of a watch ("METRO:17" → 17), for the server-side filter. */
export function lineIdsOf(watch) {
  return [
    ...new Set(
      (watch.lineRefs ?? [])
        .map((ref) => Number(String(ref).split(':').pop()))
        .filter(Number.isInteger),
    ),
  ];
}

export class SlService {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the fake one)
   * @param {object} options.store Store (src/store.js)
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {boolean} [options.timers] false in the tests: refresh by hand
   */
  constructor({ gladys, store, fetch, now = Date.now, timers = true }) {
    this.gladys = gladys;
    this.store = store;
    this.sl = new Sl({ fetch, now });
    // The traffic messages of SL, read every MESSAGES_EVERY_MS.
    this.slMessages = { list: [], at: 0, failed: false };
    this.now = now;
    this.timers = timers;
    this.config = { language: 'fr', refreshSeconds: 60 };
    this.watches = [];
    this.removed = [];
    this.memory = { announced: {}, checked: [] };
    // watchKey → { departures, messages, at }
    this.boards = new Map();
    // watchKey → Map(journey key → Set of thresholds handled), in memory only.
    this.soonDone = new Map();
    this.delayDone = new Map();
    this.checkedNow = new Set();
    this.refreshedAt = 0;
    this.lastError = null;
    this.inflight = null;
    this.timer = null;
  }

  // --- Lifecycle ---------------------------------------------------------------

  async start(config) {
    this.config = config;
    const saved = await this.store.load();
    this.watches = Array.isArray(saved.watches)
      ? saved.watches.filter((w) => parseSiteId(w?.id) !== null)
      : [];
    this.memory = {
      announced: saved.announced && typeof saved.announced === 'object' ? saved.announced : {},
      checked: Array.isArray(saved.checked) ? saved.checked : [],
    };
    this.removed = Array.isArray(saved.removed) ? saved.removed : [];
    await this.restoreFromDevices();
    await this.publishDiscovered();
    await this.gladys.setConnectionStatus(true).catch(() => {});
    this.startTimer();
    await this.refresh();
  }

  async resync(config) {
    const previous = this.config;
    this.config = config;
    if (previous.refreshSeconds !== config.refreshSeconds) {
      this.startTimer();
    }
    await this.publishDiscovered();
    await this.refresh({ republish: true });
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    if (previous.refreshSeconds !== config.refreshSeconds) {
      this.startTimer();
    }
    if (previous.language !== config.language) {
      // The device names follow the language; the feature names stay as they
      // were created (frozen by the core).
      await this.publishDiscovered();
      await this.refresh({ republish: true });
    }
  }

  startTimer() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.timers) {
      this.timer = setInterval(() => {
        this.refresh().catch((err) => logger.error('Refresh failed', err));
      }, this.config.refreshSeconds * 1000);
      this.timer.unref?.();
    }
  }

  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    await this.inflight?.catch(() => {});
    await this.store.flush();
  }

  save() {
    return this.store.save({
      watches: this.watches,
      announced: this.memory.announced,
      checked: this.memory.checked,
      removed: this.removed,
    });
  }

  // --- Devices ----------------------------------------------------------------

  deviceId(watch) {
    return this.gladys.externalIds(STOP_TYPE, watchKey(watch)).device;
  }

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  watchOfDevice(externalId) {
    return this.watches.find((watch) => this.deviceId(watch) === externalId) ?? null;
  }

  createdWatches() {
    return this.watches.filter((watch) => this.isCreated(this.deviceId(watch)));
  }

  /** The watches of the devices created in Gladys but missing from /data. */
  async restoreFromDevices() {
    let devices;
    try {
      devices = await this.gladys.getDevices();
    } catch (err) {
      logger.warn(`Cannot read the devices of the integration: ${err.message}`);
      return;
    }
    const param = (device, name) => device.params?.find((p) => p.name === name)?.value ?? '';
    let changed = false;
    for (const device of devices ?? []) {
      const id = parseSiteId(param(device, 'stop_id'));
      if (id === null) {
        continue;
      }
      const list = (name) => String(param(device, name)).split(',').filter(Boolean);
      const watch = {
        id,
        name: param(device, 'stop_name') || String(id),
        lines: parseLines(param(device, 'lines')),
        lineRefs: list('line_refs'),
        stopAreas: list('stop_areas').map(Number).filter(Number.isInteger),
        direction: param(device, 'direction'),
        mode: param(device, 'mode'),
      };
      // A stop removed by the user keeps its device until deleted: not restored.
      if (
        !this.removed.includes(watchKey(watch)) &&
        !this.watches.some((known) => watchKey(known) === watchKey(watch))
      ) {
        this.watches.push(watch);
        changed = true;
      }
    }
    if (changed) {
      logger.info(`${this.watches.length} stop(s) restored from the Gladys devices`);
      await this.save();
    }
  }

  async publishDiscovered() {
    try {
      await this.gladys.publishDiscoveredDevices(
        this.watches.map((watch) => buildStopDevice(this.gladys, watch, this.config.language)),
      );
    } catch (err) {
      logger.warn(`Cannot publish the discovered devices: ${err.message}`);
    }
  }

  async onDeviceCreated(device) {
    const watch = this.watchOfDevice(device?.external_id);
    if (!watch) {
      return;
    }
    // A state published before the device existed was dropped by the core:
    // everything again, then the widgets showing it.
    await this.refresh({ republish: true });
    this.gladys.requestWidgetRefresh?.('departures');
  }

  // --- Refresh ----------------------------------------------------------------

  /** Polling fallback: Gladys does not poll these devices, but if it did. */
  async poll() {
    if (this.now() - this.refreshedAt >= (this.config.refreshSeconds * 1000) / 2) {
      await this.refresh();
    }
  }

  refresh(options = {}) {
    if (this.inflight) {
      // A read in progress may predate a device just created: read again after it.
      return this.inflight.then(() => this.refresh(options));
    }
    this.inflight = this.doRefresh(options).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  async doRefresh({ republish = false } = {}) {
    const watches = this.createdWatches();
    if (watches.length === 0) {
      return;
    }
    // One request per watch, one after the other: never a burst on the API.
    const results = [];
    let lastError = null;
    for (const watch of watches) {
      try {
        results.push(await this.sl.departures({ ...watch, lineIds: lineIdsOf(watch) }));
      } catch (err) {
        lastError = err;
        results.push(null);
        logger.debug(`Cannot read the departures of ${watch.id}: ${err.message}`);
      }
    }
    if (results.every((result) => result === null)) {
      if (!this.lastError) {
        logger.warn(`Cannot read the departures: ${lastError.message}`);
        await this.gladys
          .setConnectionStatus(false, sayAll(TEXT, 'serviceDown', { error: lastError.message }))
          .catch(() => {});
      }
      this.lastError = lastError.message;
      // The countdowns go on from the last expected times.
      await this.publishAll();
      return;
    }
    if (this.lastError) {
      logger.info('SL reachable again');
      this.lastError = null;
      await this.gladys.setConnectionStatus(true).catch(() => {});
    }
    await this.refreshMessages();
    const now = this.now();
    this.refreshedAt = now;
    const events = [];
    let memoryChanged = false;
    for (const [index, watch] of watches.entries()) {
      const result = results[index];
      if (!result) {
        // This stop only failed: its last board ages on.
        continue;
      }
      const departures = applyFilters(parseDepartures(result.departures, now), watch);
      const messages = messagesFor(this.slMessages.list, watch, departures, now);
      this.boards.set(watchKey(watch), { departures, messages, at: now });
      const found = this.detect(watch, departures, messages, now);
      events.push(...found.events);
      memoryChanged ||= found.memoryChanged;
    }
    memoryChanged = this.pruneMemory(now) || memoryChanged;
    if (memoryChanged) {
      await this.save();
    }
    await this.publishAll({ force: republish });
    for (const { key, data } of events) {
      await this.fire(key, data);
    }
  }

  /** The traffic messages, read again when older than MESSAGES_EVERY_MS. */
  async refreshMessages() {
    if (this.slMessages.at && this.now() - this.slMessages.at < MESSAGES_EVERY_MS) {
      return;
    }
    try {
      this.slMessages.list = await this.sl.messages();
      if (this.slMessages.failed) {
        logger.info('SL traffic messages read again');
      }
      this.slMessages.failed = false;
    } catch (err) {
      // The last list is kept; said once per streak.
      if (!this.slMessages.failed) {
        logger.warn(`Cannot read the SL traffic messages: ${err.message}`);
      }
      this.slMessages.failed = true;
    }
    // A failure waits the same delay: no request each minute on a broken API.
    this.slMessages.at = this.now();
  }

  async publishAll({ force = false } = {}) {
    const states = [];
    for (const watch of this.createdWatches()) {
      const board = this.boards.get(watchKey(watch));
      if (board) {
        states.push(
          ...stopStates(
            this.gladys,
            watch,
            aged(board.departures, this.now()),
            board.messages,
            this.config.language,
          ),
        );
      }
    }
    if (states.length === 0) {
      return;
    }
    if (force) {
      this.gladys.forgetPublishedStates?.();
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      if (this.publishFailed) {
        this.publishFailed = false;
        logger.info('States published again');
      }
    } catch (err) {
      // Gladys restarting: said once, the next refresh sends them again.
      if (!this.publishFailed) {
        logger.warn(`Cannot publish ${states.length} state(s): ${err.message}`);
      }
      this.publishFailed = true;
    }
  }

  // --- Scene triggers ----------------------------------------------------------

  /** The scene events of a fresh read of a watch. */
  detect(watch, departures, messages, now) {
    const key = watchKey(watch);
    const deviceId = this.deviceId(watch);
    const events = [];
    let memoryChanged = false;
    // First read in this process: what is there is not news (RAM memories).
    const firstNow = !this.checkedNow.has(key);
    this.checkedNow.add(key);
    // First read ever (persisted memories).
    const firstEver = !this.memory.checked.includes(key);
    if (firstEver) {
      this.memory.checked.push(key);
      memoryChanged = true;
    }
    const base = (departure) => ({
      stop: deviceId,
      stop_name: watch.name,
      line: departure.line,
      mode: departure.mode,
      destination: departure.destination,
      platform: departure.platform,
      scheduled_time: clockTime(departure.aimed),
      expected_time: clockTime(departure.expected),
      minutes: departure.minutes,
      delay_minutes: departure.delay,
    });

    // journey key → { aimed, handled }: kept until two hours after the aimed
    // time, so a journey leaving the window and coming back is not news again.
    const soon = this.soonDone.get(key) ?? new Map();
    const delays = this.delayDone.get(key) ?? new Map();
    // A threshold crossed long before this read (SL down, a 2-minute
    // interval) is too late to announce: marked, not fired.
    const slack = Math.ceil(this.config.refreshSeconds / 60);
    for (const departure of departures) {
      if (departure.cancelled) {
        const memo = this.remember(`${key}|cancel|${departure.key}`, now);
        memoryChanged ||= memo.changed;
        if (memo.fresh && !firstEver) {
          events.push({ key: TRIGGERS.CANCELLED, data: base(departure) });
        }
        continue;
      }
      // Leave now: each threshold once, when the countdown reaches it. A
      // journey first seen inside a threshold does not fire it.
      const seen = soon.get(departure.key);
      if (!seen) {
        soon.set(departure.key, {
          aimed: departure.aimed,
          handled: new Set(SOON_MINUTES.filter((minutes) => departure.minutes <= minutes)),
        });
      } else {
        for (const threshold of SOON_MINUTES) {
          if (departure.minutes <= threshold && !seen.handled.has(threshold)) {
            seen.handled.add(threshold);
            if (departure.minutes >= threshold - slack) {
              events.push({
                key: TRIGGERS.SOON,
                data: { ...base(departure), threshold: String(threshold) },
              });
            }
          }
        }
      }
      // Delay: each threshold once per journey.
      const reached = delays.get(departure.key) ?? { aimed: departure.aimed, handled: new Set() };
      for (const threshold of DELAY_MINUTES) {
        if (departure.delay >= threshold && !reached.handled.has(threshold)) {
          reached.handled.add(threshold);
          if (!firstNow) {
            events.push({
              key: TRIGGERS.DELAYED,
              data: { ...base(departure), threshold: String(threshold) },
            });
          }
        }
      }
      delays.set(departure.key, reached);
    }
    for (const map of [soon, delays]) {
      for (const [journey, entry] of map) {
        if (now - entry.aimed > JOURNEY_MEMORY_MS) {
          map.delete(journey);
        }
      }
    }
    this.soonDone.set(key, soon);
    this.delayDone.set(key, delays);

    // One event per message and line: a scene filtered on either line hears it.
    for (const message of messages) {
      const memoryKey = `${key}|message|${message.id}`;
      const memo = this.remember(memoryKey, now);
      memoryChanged ||= memo.changed;
      if (!memo.fresh || firstEver) {
        continue;
      }
      for (const line of message.lines.length > 0 ? message.lines : ['']) {
        events.push({
          key: TRIGGERS.DISRUPTION,
          data: {
            stop: deviceId,
            stop_name: watch.name,
            line,
            summary: clip(message.summary || message.description, 1000),
            description: clip(message.description, 1000),
          },
        });
      }
    }
    return { events, memoryChanged };
  }

  /** Records a persisted memory key: `fresh` when new, `changed` when /data must be written. */
  remember(memoryKey, now) {
    const seen = this.memory.announced[memoryKey];
    if (seen === undefined || now - seen > SEEN_WRITE_MS) {
      this.memory.announced[memoryKey] = now;
      return { fresh: seen === undefined, changed: true };
    }
    return { fresh: false, changed: false };
  }

  pruneMemory(now) {
    let changed = false;
    for (const [memoryKey, seen] of Object.entries(this.memory.announced)) {
      if (now - seen > MEMORY_MS) {
        delete this.memory.announced[memoryKey];
        changed = true;
      }
    }
    return changed;
  }

  async fire(key, data) {
    const minute = Math.floor(this.now() / 60000);
    if (this.eventMinute !== minute) {
      this.eventMinute = minute;
      this.eventCount = 0;
    }
    this.eventCount += 1;
    if (this.eventCount > EVENTS_PER_MINUTE) {
      logger.debug(`Too many scene events this minute, ${key} dropped`);
      return;
    }
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.fireFailed = false;
    } catch (err) {
      // A 429 or Gladys restarting: said once per streak.
      if (!this.fireFailed) {
        logger.warn(`Cannot fire the ${key} trigger: ${err.message}`);
      }
      this.fireFailed = true;
    }
  }

  // --- Readings for the widget and the scene action ----------------------------

  /**
   * The watch and departures of a device; read again when older than two
   * refresh intervals (a scene action right after the start).
   */
  async boardOf(externalId) {
    const watch = this.watchOfDevice(externalId);
    if (!watch) {
      return null;
    }
    let board = this.boards.get(watchKey(watch));
    if (
      this.isCreated(externalId) &&
      (!board || this.now() - board.at > this.config.refreshSeconds * 2000)
    ) {
      await this.refresh();
      board = this.boards.get(watchKey(watch));
    }
    return {
      watch,
      departures: board ? aged(board.departures, this.now()) : null,
      messages: board?.messages ?? [],
    };
  }

  // --- Configuration actions -------------------------------------------------
  //
  // Gladys shows in green what an action returns and in red what it throws:
  // every failure throws an ActionFailure with the four-language message.

  fail(key, params) {
    return new ActionFailure(sayAll(TEXT, key, params));
  }

  async call(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ActionFailure) {
        throw err;
      }
      throw this.fail('serviceDown', { error: err.message });
    }
  }

  /** The sites matching a text: exact name or alias first, then the names containing it. */
  async findSites(text) {
    const sites = await this.call(() => this.sl.sites());
    const wanted = fold(text);
    const exact = sites.filter(
      (site) => fold(site.name) === wanted || site.aliases.some((alias) => fold(alias) === wanted),
    );
    if (exact.length > 0) {
      return { exact: true, sites: exact };
    }
    return {
      exact: false,
      sites: sites
        .filter((site) => fold(site.name).includes(wanted))
        .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name, 'sv')),
    };
  }

  siteLabel(site) {
    return `${site.name}${site.note ? ` (${site.note})` : ''} [${site.id}]`;
  }

  async searchStops({ query } = {}) {
    const text = String(query ?? '').trim();
    if (!text) {
      throw this.fail('searchNeedText');
    }
    const id = parseSiteId(text);
    const sites =
      id !== null
        ? (await this.call(() => this.sl.sites())).filter((site) => site.id === id)
        : (await this.findSites(text)).sites;
    if (sites.length === 0) {
      throw this.fail('searchNone', { query: text });
    }
    const shown = sites.slice(0, SEARCH_RESULTS);
    const list = shown.map((site) => `• ${this.siteLabel(site)}`).join('\n');
    return Object.fromEntries(
      ['en', 'fr', 'de', 'es'].map((lang) => [
        lang,
        `${say(TEXT, lang, 'searchFound', { count: sites.length })}\n${list}\n${say(TEXT, lang, 'searchHint')}`,
      ]),
    );
  }

  async addStop({ stop: query, lines: lineText, direction, mode } = {}) {
    const text = String(query ?? '').trim();
    if (!text) {
      throw this.fail('searchNeedText');
    }
    const id = parseSiteId(text);
    let site;
    if (id !== null) {
      site = (await this.call(() => this.sl.sites())).find((known) => known.id === id);
    } else {
      const found = await this.findSites(text);
      if (found.sites.length > 1) {
        const list = found.sites
          .slice(0, SEARCH_RESULTS)
          .map((known) => `• ${this.siteLabel(known)}`)
          .join('\n');
        const messages = sayAll(TEXT, 'addAmbiguous');
        for (const lang of Object.keys(messages)) {
          messages[lang] = `${messages[lang]}\n${list}`;
        }
        throw new ActionFailure(messages);
      }
      site = found.sites[0];
    }
    if (!site) {
      throw this.fail('addUnknown', { query: text });
    }
    const wantedMode = String(mode ?? '')
      .trim()
      .toUpperCase();
    if (wantedMode && !MODES.includes(wantedMode)) {
      throw this.fail('addUnknownMode', { mode: wantedMode });
    }
    const lines = parseLines(lineText);
    // The lines served are those of the next 20 hours: the API has no list.
    const board = await this.call(() => this.sl.departures({ id: site.id, mode: wantedMode }));
    const departures = parseDepartures(board.departures, this.now());
    const served = new Map();
    for (const departure of departures) {
      const code = departure.line.toUpperCase();
      served.set(code, [...new Set([...(served.get(code) ?? []), departure.lineRef])]);
    }
    const missing = lines.filter((line) => !served.has(line));
    if (missing.length > 0) {
      throw this.fail('addUnknownLines', {
        lines: missing.join(', '),
        available:
          clip(
            [...served.keys()]
              .sort((a, b) => a.localeCompare(b, 'sv', { numeric: true }))
              .join(', '),
            120,
          ) || '—',
      });
    }
    const watch = {
      id: site.id,
      name: site.name,
      // As SL writes them ("17", "43X"), for the device name and the filter.
      lines: lines.map(
        (line) => departures.find((departure) => departure.line.toUpperCase() === line).line,
      ),
      // "METRO:17": the lines of the traffic messages, and the server filter.
      lineRefs: lines.flatMap((line) => served.get(line)),
      stopAreas: site.stopAreas,
      direction: clip(String(direction ?? '').trim(), 40),
      mode: wantedMode,
    };
    const key = watchKey(watch);
    if (this.watches.some((known) => watchKey(known) === key)) {
      throw this.fail('alreadyWatched', { name: watchName(watch, this.config.language) });
    }
    if (this.watches.length >= MAX_WATCHES) {
      throw this.fail('tooMany', { max: MAX_WATCHES });
    }
    this.watches.push(watch);
    this.removed = this.removed.filter((removed) => removed !== key);
    await this.save();
    await this.publishDiscovered();
    logger.info(`Stop added: ${watchName(watch, 'en')} (${site.id})`);
    return Object.fromEntries(
      ['en', 'fr', 'de', 'es'].map((lang) => [
        lang,
        say(TEXT, lang, 'added', { name: watchName(watch, lang) }),
      ]),
    );
  }

  async remove({ name } = {}) {
    const text = fold(name);
    const id = parseSiteId(name);
    const matches = this.watches.filter(
      (watch) =>
        fold(watchName(watch, this.config.language)) === text ||
        fold(watchName(watch, 'en')) === text ||
        watchKey(watch) === text ||
        (id !== null && watch.id === id),
    );
    const byName = matches.length > 0 ? matches : this.watches.filter((w) => fold(w.name) === text);
    if (byName.length === 0) {
      throw this.fail('removeUnknown', { query: String(name ?? '').trim() });
    }
    if (byName.length > 1) {
      throw this.fail('removeAmbiguous');
    }
    const [watch] = byName;
    this.watches = this.watches.filter((known) => known !== watch);
    const key = watchKey(watch);
    this.boards.delete(key);
    // Added again later, the stop starts afresh: nothing it held is news.
    this.soonDone.delete(key);
    this.delayDone.delete(key);
    this.checkedNow.delete(key);
    this.memory.checked = this.memory.checked.filter((checked) => checked !== key);
    for (const memoryKey of Object.keys(this.memory.announced)) {
      if (memoryKey.startsWith(`${key}|`)) {
        delete this.memory.announced[memoryKey];
      }
    }
    if (!this.removed.includes(key)) {
      this.removed.push(key);
    }
    await this.save();
    await this.publishDiscovered();
    logger.info(`Stop removed: ${watchName(watch, 'en')}`);
    return Object.fromEntries(
      ['en', 'fr', 'de', 'es'].map((lang) => [
        lang,
        say(TEXT, lang, 'removed', { name: watchName(watch, lang) }),
      ]),
    );
  }

  status() {
    return Object.fromEntries(
      ['en', 'fr', 'de', 'es'].map((lang) => {
        if (this.watches.length === 0) {
          return [lang, say(TEXT, lang, 'statusNone')];
        }
        const lines = [say(TEXT, lang, 'statusHeader', { count: this.watches.length })];
        for (const watch of this.watches) {
          const created = this.isCreated(this.deviceId(watch));
          lines.push(
            `• ${watchName(watch, lang)} [${watch.id}] — ${say(TEXT, lang, created ? 'statusCreated' : 'statusNotCreated')}`,
          );
        }
        lines.push(
          this.refreshedAt
            ? say(TEXT, lang, 'statusRefreshed', {
                age: Math.round((this.now() - this.refreshedAt) / 1000),
              })
            : say(TEXT, lang, 'statusNeverRefreshed'),
        );
        if (this.lastError) {
          lines.push(say(TEXT, lang, 'statusError', { error: this.lastError }));
        }
        return [lang, lines.join('\n')];
      }),
    );
  }

  /** "Metro 17 to Åkeshov at Slussen: in 3 and 7 min (4 min late)". */
  sentence(watch, group, language) {
    const [first, second] = group;
    let when;
    if (!second) {
      when = first.minutes === 0 ? say(TEXT, language, 'now') : say(TEXT, language, 'in', first);
    } else {
      when =
        first.minutes === 0
          ? say(TEXT, language, 'nowThen', { second: second.minutes })
          : say(TEXT, language, 'inTwo', { first: first.minutes, second: second.minutes });
    }
    const late = first.delay > 0 ? say(TEXT, language, 'delayedNote', first) : '';
    return (
      say(TEXT, language, 'sentence', {
        line: `${modeName(first.mode, language)} ${first.line}`.trim(),
        destination: first.destination,
        stop: watch.name,
        when,
      }) + late
    );
  }
}
