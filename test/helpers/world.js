// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake `fetch` answering like
// SL from the real responses of test/fixtures/sl (captured on 2026-11-20
// around 09:37 in Stockholm), a manual clock, a temporary /data, and the
// integration wired on top through registerHandlers. Nothing touches the
// network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { DEVIATIONS_URL, TRANSPORT_URL } from '../../src/sl.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'Europe/Stockholm';

export const fixtureJson = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/sl/${name}`, import.meta.url), 'utf8'));

// 2026-11-20 09:37:30 in Stockholm: when the departures were captured.
export const FIXTURE_TIME = Date.parse('2026-11-20T08:37:30Z');

export const SLUSSEN = 9192; // metro, bus, boat
export const T_CENTRALEN = 9001; // metro, commuter train, tram, bus
export const STYRSVIK = 102; // archipelago boats only

/** The recorded departures of each site, a deep copy the test may change. */
export function recordedStops() {
  return {
    [SLUSSEN]: fixtureJson('departures-9192.json'),
    [T_CENTRALEN]: fixtureJson('departures-9001.json'),
    [STYRSVIK]: fixtureJson('departures-102.json'),
  };
}

/**
 * A fake `fetch` answering like SL. `stops` holds the departures of each site
 * (change them to stage a delay, a cancellation); `messages` the traffic
 * messages; `fail` makes every request fail with an Error or an HTTP status.
 * The `line` and `transport` filters are applied as SL does. Every call is
 * recorded in `calls`.
 */
export function createFetch() {
  const network = {
    stops: recordedStops(),
    messages: fixtureJson('messages.json'),
    calls: [],
    fail: null,
  };
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  network.fetch = async (url) => {
    network.calls.push({ url });
    if (network.fail instanceof Error) {
      throw network.fail;
    }
    if (typeof network.fail === 'number') {
      return new Response('{"error":"Quota has been exceeded"}', { status: network.fail });
    }
    const parsed = new URL(url);
    if (url.startsWith(DEVIATIONS_URL)) {
      return json(structuredClone(network.messages));
    }
    if (parsed.href === `${TRANSPORT_URL}/sites?expand=true`) {
      return json(fixtureJson('sites.json'));
    }
    const match = parsed.pathname.match(/^\/v1\/sites\/(\d+)\/departures$/);
    if (url.startsWith(TRANSPORT_URL) && match) {
      const body = structuredClone(
        network.stops[Number(match[1])] ?? fixtureJson('departures-empty.json'),
      );
      const line = parsed.searchParams.get('line');
      const mode = parsed.searchParams.get('transport');
      body.departures = body.departures.filter(
        (d) => (!line || String(d.line.id) === line) && (!mode || d.line.transport_mode === mode),
      );
      return json(body);
    }
    return new Response('not found', { status: 404 });
  };
  network.departureRequests = () =>
    network.calls.filter((call) => call.url.includes('/departures'));
  return network;
}

/** A manual clock. */
export function createClock(start = FIXTURE_TIME) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {object} [options.network] from createFetch
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {object} [options.saved] content of /data/watch.json before the start
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers]
 */
export async function createWorld({
  config = {},
  network = createFetch(),
  devices = [],
  saved,
  connect = true,
  timers = false,
  clock = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-sl-')),
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const store = new Store(dataDir);
  if (saved) {
    await store.save(saved);
    await store.flush();
  }
  const app = registerHandlers(gladys, {
    store,
    fetch: network.fetch,
    timers,
    now: clock.now,
    // No real wait: the clock is manual.
    sleep: async () => {},
    dataDir,
  });
  const world = {
    gladys,
    fake: gladys.fake,
    app,
    service: app.service,
    network,
    clock,
    store,
    dataDir,
  };
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return world;
}

/** Run a configuration action; resolves with its message (multi-language). */
export async function action(world, key, fields = {}) {
  const ack = await world.fake.action(key, fields);
  if (!ack.success) {
    throw new Error(`action ${key} failed: ${JSON.stringify(ack.error)}`);
  }
  return ack.data.message;
}

/** Run an action expected to fail: resolves with its error (multi-language). */
export async function failedAction(world, key, fields = {}) {
  const ack = await world.fake.action(key, fields);
  if (ack.success !== false || typeof ack.error?.fr !== 'string' || !ack.error.fr) {
    throw new Error(`action ${key} did not fail with a message: ${JSON.stringify(ack)}`);
  }
  return ack.error;
}

/** The discovered device whose name contains `name`. */
export function discovered(world, name) {
  const device = world.fake.discoveredDevices.find((d) => d.name.includes(name));
  if (!device) {
    throw new Error(`no discovered device named ${name}`);
  }
  return device;
}

/** "Add to Gladys" on the discovered device named `name`; resolves with it. */
export async function create(world, name) {
  const device = discovered(world, name);
  await world.fake.deviceCreated(device);
  return device;
}

/** The last state published on a feature of a device. */
export const lastState = (world, device, key) =>
  world.fake.lastState(`${device.external_id}:${key}`);

/** Captures the log lines of the integration at `level` and above. */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
