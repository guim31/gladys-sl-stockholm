// -----------------------------------------------------------------------------
// The SL client: requests, filters, cache of the site list, failures.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FORECAST_MINUTES,
  REQUEST_GAP_MS,
  SITES_TTL_MS,
  Sl,
  SlError,
  parseSiteId,
} from '../src/sl.js';
import { FIXTURE_TIME, SLUSSEN, createClock, createFetch } from './helpers/world.js';

test('site numbers only', () => {
  assert.equal(parseSiteId(' 9192 '), 9192);
  assert.equal(parseSiteId('Slussen'), null);
  assert.equal(parseSiteId('91.2'), null);
});

test('departures: the 20-hour window, one line and the mode filtered by SL', async () => {
  const network = createFetch();
  const sl = new Sl({ fetch: network.fetch, now: () => FIXTURE_TIME, sleep: async () => {} });
  const all = await sl.departures({ id: SLUSSEN });
  assert.equal(all.departures.length, 110);
  const url = new URL(network.calls[0].url);
  assert.equal(url.pathname, '/v1/sites/9192/departures');
  assert.equal(url.searchParams.get('forecast'), String(FORECAST_MINUTES));
  const one = await sl.departures({ id: SLUSSEN, lineIds: [17], mode: 'METRO' });
  assert.ok(one.departures.every((d) => d.line.id === 17));
  const params = new URL(network.calls[1].url).searchParams;
  assert.equal(params.get('line'), '17');
  assert.equal(params.get('transport'), 'METRO');
  // Several lines: not repeatable on SL, filtered by the integration.
  await sl.departures({ id: SLUSSEN, lineIds: [17, 18] });
  assert.equal(new URL(network.calls[2].url).searchParams.get('line'), null);
  await assert.rejects(sl.departures({ id: 'x' }), SlError);
});

test('the site list is read once a day, reduced to what is needed', async () => {
  const network = createFetch();
  const clock = createClock();
  const sl = new Sl({ fetch: network.fetch, now: clock.now, sleep: async () => {} });
  const sites = await sl.sites();
  assert.deepEqual(
    sites.find((site) => site.id === 9001),
    {
      id: 9001,
      name: 'T-Centralen',
      note: '',
      aliases: ['Tcentralen', 'TCE'],
      stopAreas: [1051, 5011, 5901, 10291, 80055, 10910, 4301, 5300, 5310],
    },
  );
  await sl.sites();
  assert.equal(network.calls.length, 1);
  clock.advance(SITES_TTL_MS);
  await sl.sites();
  assert.equal(network.calls.length, 2);
});

test('failures: quota, network, invalid JSON', async () => {
  const network = createFetch();
  const waits = [];
  const sl = new Sl({ fetch: network.fetch, sleep: async (ms) => waits.push(ms) });
  network.fail = 429;
  await assert.rejects(sl.messages(), /deviations\.integration\.sl\.se: HTTP 429 \(quota\)/);
  // Tried three times, 2 then 5 seconds apart.
  assert.equal(network.calls.length, 3);
  assert.deepEqual(
    waits.filter((ms) => ms >= 2000),
    [2000, 5000],
  );
  network.fail = new Error('getaddrinfo EAI_AGAIN');
  await assert.rejects(sl.departures({ id: 1 }), /transport\.integration\.sl\.se: getaddrinfo/);
  const bad = new Sl({ fetch: async () => new Response('<html>'), sleep: async () => {} });
  await assert.rejects(bad.messages(), /invalid JSON/);
});

test('a lone 429 is tried again; requests are spaced', async () => {
  const network = createFetch();
  const clock = createClock();
  const waits = [];
  let refused = 1;
  const sl = new Sl({
    fetch: async (url) => {
      if (refused > 0) {
        refused -= 1;
        return new Response('{}', { status: 429 });
      }
      return network.fetch(url);
    },
    now: clock.now,
    sleep: async (ms) => {
      waits.push(ms);
      clock.advance(ms);
    },
  });
  const [first, second] = await Promise.all([sl.messages(), sl.departures({ id: SLUSSEN })]);
  assert.ok(Array.isArray(first) && second.departures.length > 0);
  assert.deepEqual(waits, [2000, REQUEST_GAP_MS]);
});

test('the site list is kept in /data and used stale when SL refuses it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gladys-sl-sites-'));
  const clock = createClock();
  const network = createFetch();
  const first = new Sl({
    fetch: network.fetch,
    now: clock.now,
    cacheDir: dir,
    sleep: async () => {},
  });
  await first.sites();
  // A restart: read from /data, not from SL.
  const again = new Sl({
    fetch: network.fetch,
    now: clock.now,
    cacheDir: dir,
    sleep: async () => {},
  });
  assert.equal((await again.sites()).length, 9);
  assert.equal(network.calls.length, 1);
  // A month later, SL refusing: the old copy still answers.
  clock.advance(30 * 24 * 3600 * 1000);
  network.fail = 429;
  const late = new Sl({
    fetch: network.fetch,
    now: clock.now,
    cacheDir: dir,
    sleep: async () => {},
  });
  assert.equal((await late.sites()).length, 9);
});
