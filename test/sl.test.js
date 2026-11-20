// -----------------------------------------------------------------------------
// The SL client: requests, filters, cache of the site list, failures.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORECAST_MINUTES, SITES_TTL_MS, Sl, SlError, parseSiteId } from '../src/sl.js';
import { FIXTURE_TIME, SLUSSEN, createClock, createFetch } from './helpers/world.js';

test('site numbers only', () => {
  assert.equal(parseSiteId(' 9192 '), 9192);
  assert.equal(parseSiteId('Slussen'), null);
  assert.equal(parseSiteId('91.2'), null);
});

test('departures: the 20-hour window, one line and the mode filtered by SL', async () => {
  const network = createFetch();
  const sl = new Sl({ fetch: network.fetch, now: () => FIXTURE_TIME });
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
  const sl = new Sl({ fetch: network.fetch, now: clock.now });
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
  const sl = new Sl({ fetch: network.fetch });
  network.fail = 429;
  await assert.rejects(sl.messages(), /deviations\.integration\.sl\.se: HTTP 429 \(quota\)/);
  network.fail = new Error('getaddrinfo EAI_AGAIN');
  await assert.rejects(sl.departures({ id: 1 }), /transport\.integration\.sl\.se: getaddrinfo/);
  const bad = new Sl({ fetch: async () => new Response('<html>') });
  await assert.rejects(bad.messages(), /invalid JSON/);
});
