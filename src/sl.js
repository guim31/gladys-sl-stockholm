// -----------------------------------------------------------------------------
// SL open APIs (Stockholm, Trafiklab, no key):
// - transport.integration.sl.se/v1/sites: every SL site (6,500, 1.6 MB),
//   read on demand for the stop search, kept in memory for a day;
// - /v1/sites/{id}/departures: the departures of one site, one request per
//   watched stop and refresh (the API has no batch);
// - deviations.integration.sl.se/v1/messages: the traffic messages in force,
//   one request for every watch, read less often (they change slowly).
//
// The API answers 429 "Quota has been exceeded" to bursts, and now and then to
// a lone request (1 in 6 seen on 2026-11-20, spaced by a second): requests are
// serialized, spaced, and a 429 is tried again twice, after 2 then 5 seconds.
// The site list, the most refused, is also kept in /data for a week and used
// stale when SL refuses it.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const TRANSPORT_URL = 'https://transport.integration.sl.se/v1';
export const DEVIATIONS_URL = 'https://deviations.integration.sl.se/v1/messages';

const TIMEOUT_MS = 15000;
// Minutes of departures asked for: the API's maximum (1,200). It does not
// return every departure of the window, only the next few of each line and
// direction, so a stop quiet at night still shows its first morning departure.
export const FORECAST_MINUTES = 1200;
export const SITES_TTL_MS = 24 * 3600 * 1000;
// The copy of the site list in /data: fresh for a week, used stale after.
export const SITES_FILE_TTL_MS = 7 * 24 * 3600 * 1000;
const SITES_FILE = 'sites.json';
// Between two requests, and after a 429 before trying again.
export const REQUEST_GAP_MS = 500;
export const RETRY_DELAYS_MS = [2000, 5000];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Transport modes of the API (`transport` filter).
export const MODES = ['METRO', 'TRAIN', 'TRAM', 'BUS', 'SHIP', 'FERRY', 'TAXI'];

export class SlError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** "9192" → 9192; anything else → null. */
export function parseSiteId(text) {
  const value = String(text ?? '').trim();
  return /^\d{1,9}$/.test(value) ? Number(value) : null;
}

export class Sl {
  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {(ms: number) => Promise<void>} [options.sleep] instant in the tests
   * @param {string} [options.cacheDir] where the site list is kept (/data)
   */
  constructor({
    fetch: fetchImpl = globalThis.fetch,
    now = Date.now,
    sleep = wait,
    cacheDir = null,
  } = {}) {
    this.fetch = fetchImpl;
    this.now = now;
    this.sleep = sleep;
    this.cacheDir = cacheDir;
    this.sitesCache = null;
    this.queue = Promise.resolve();
    this.lastRequestAt = 0;
  }

  /** One request at a time, spaced, a 429 tried again (RETRY_DELAYS_MS). */
  request(url) {
    const run = this.queue.then(async () => {
      for (let attempt = 0; ; attempt += 1) {
        const gap = this.lastRequestAt + REQUEST_GAP_MS - this.now();
        if (gap > 0) {
          await this.sleep(gap);
        }
        let error;
        try {
          return await this.requestOnce(url);
        } catch (err) {
          error = err;
        } finally {
          this.lastRequestAt = this.now();
        }
        if (error.status !== 429 || attempt >= RETRY_DELAYS_MS.length) {
          throw error;
        }
        // Longer than the gap: no other wait after it.
        await this.sleep(RETRY_DELAYS_MS[attempt]);
        this.lastRequestAt = 0;
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }

  async requestOnce(url) {
    const host = new URL(url).host;
    let response;
    try {
      response = await this.fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new SlError(`${host}: ${err.name === 'TimeoutError' ? 'timeout' : err.message}`);
    }
    if (!response.ok) {
      throw new SlError(
        `${host}: HTTP ${response.status}${response.status === 429 ? ' (quota)' : ''}`,
        response.status,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new SlError(`${host}: invalid JSON`);
    }
  }

  /**
   * Every SL site: from memory when younger than a day, else from /data when
   * younger than a week, else from SL; a stale copy rather than an error when
   * SL refuses.
   * @returns {Promise<{ id: number, name: string, note: string, aliases: string[], stopAreas: number[] }[]>}
   */
  sites() {
    // Two actions at once share one read: a second one is what SL refuses.
    this.sitesLoading ??= this.loadSites().finally(() => {
      this.sitesLoading = null;
    });
    return this.sitesLoading;
  }

  async loadSites() {
    if (this.sitesCache && this.now() - this.sitesCache.at < SITES_TTL_MS) {
      return this.sitesCache.sites;
    }
    const saved = this.sitesCache ?? (await this.readSitesFile());
    if (saved && this.now() - saved.at < SITES_FILE_TTL_MS && !this.sitesCache) {
      this.sitesCache = saved;
      return saved.sites;
    }
    let body;
    try {
      body = await this.request(`${TRANSPORT_URL}/sites?expand=true`);
    } catch (err) {
      if (saved) {
        return saved.sites;
      }
      throw err;
    }
    if (!Array.isArray(body)) {
      throw new SlError('SL: unexpected site list');
    }
    // Only what the search and the watches need: a fifth of the raw size.
    const sites = body
      .filter((site) => Number.isInteger(site?.id) && typeof site.name === 'string')
      .map((site) => ({
        id: site.id,
        name: site.name,
        note: typeof site.note === 'string' ? site.note : '',
        aliases: [
          ...(Array.isArray(site.alias) ? site.alias : []),
          ...(site.abbreviation ? [site.abbreviation] : []),
        ].filter((alias) => typeof alias === 'string'),
        stopAreas: (site.stop_areas ?? []).filter(Number.isInteger),
      }));
    this.sitesCache = { sites, at: this.now() };
    await this.writeSitesFile(this.sitesCache);
    return sites;
  }

  async readSitesFile() {
    if (!this.cacheDir) {
      return null;
    }
    try {
      const data = JSON.parse(await readFile(join(this.cacheDir, SITES_FILE), 'utf8'));
      return Array.isArray(data?.sites) && Number.isFinite(data.at) ? data : null;
    } catch {
      return null;
    }
  }

  async writeSitesFile(data) {
    if (!this.cacheDir) {
      return;
    }
    const path = join(this.cacheDir, SITES_FILE);
    try {
      await mkdir(this.cacheDir, { recursive: true });
      await writeFile(`${path}.tmp`, JSON.stringify(data));
      await rename(`${path}.tmp`, path);
    } catch {
      // Only a cache: the list is read from SL again next time.
    }
  }

  /**
   * The departures of a site, with the server-side filters the API has: one
   * line (by its id) and one transport mode.
   * @param {{ id: number, lineIds?: number[], mode?: string }} watch
   * @returns {Promise<{ departures: object[], stopDeviations: object[] }>}
   */
  async departures(watch) {
    const id = parseSiteId(watch.id);
    if (id === null) {
      throw new SlError(`SL: invalid site ${String(watch.id).slice(0, 20)}`);
    }
    const url = new URL(`${TRANSPORT_URL}/sites/${id}/departures`);
    url.searchParams.set('forecast', String(FORECAST_MINUTES));
    // `line` is not repeatable: several lines are filtered here.
    const lineIds = (watch.lineIds ?? []).filter(Number.isInteger);
    if (lineIds.length === 1) {
      url.searchParams.set('line', String(lineIds[0]));
    }
    if (MODES.includes(watch.mode)) {
      url.searchParams.set('transport', watch.mode);
    }
    const body = await this.request(url.toString());
    return {
      departures: Array.isArray(body?.departures) ? body.departures : [],
      stopDeviations: Array.isArray(body?.stop_deviations) ? body.stop_deviations : [],
    };
  }

  /** The traffic messages published now (every line and stop of SL). */
  async messages() {
    const url = new URL(DEVIATIONS_URL);
    url.searchParams.set('future', 'false');
    const body = await this.request(url.toString());
    if (!Array.isArray(body)) {
      throw new SlError('SL: unexpected deviation list');
    }
    return body;
  }
}
