// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and the real SL
// answers: configuration actions, discovered devices, states, scene triggers,
// widget, scene action, persistence, failures, logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { NO_DEPARTURE_MINUTES } from '../src/devices.js';
import { MAX_WATCHES, MESSAGES_EVERY_MS, TRIGGERS } from '../src/service.js';
import {
  SLUSSEN,
  STYRSVIK,
  T_CENTRALEN,
  action,
  captureLogs,
  create,
  createFetch,
  createWorld,
  discovered,
  failedAction,
  lastState,
} from './helpers/world.js';
import { stageEverything } from './helpers/scenario.js';

const fr = (message) => message.fr;

test('nothing watched: no request at all, the status says so', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.service.refresh();
  assert.equal(world.network.calls.length, 0);
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.match(fr(await action(world, 'status')), /Aucun arrêt suivi/);
});

test('search: by name, alias or number; failures in red', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const byName = await action(world, 'search_stops', { query: 'slussen' });
  assert.match(fr(byName), /2 arrêt\(s\) trouvé\(s\)/);
  assert.match(fr(byName), /• Slussen \[9192\]\n• Slussen \(ersättningstrafik\) \[9208\]/);
  assert.match(byName.de, /Haltestelle hinzufügen/);
  assert.match(fr(await action(world, 'search_stops', { query: 'TCE' })), /T-Centralen \[9001\]/);
  assert.match(fr(await action(world, 'search_stops', { query: '9001' })), /T-Centralen \[9001\]/);
  assert.match(fr(await action(world, 'search_stops', { query: 'oden' })), /Odenplan \[9117\]/);
  assert.equal(
    fr(await failedAction(world, 'search_stops', { query: 'Zzyzx' })),
    'Aucun arrêt ne correspond à « Zzyzx ».',
  );
  assert.match(fr(await failedAction(world, 'search_stops', { query: ' ' })), /Saisissez/);
  // The site list is read once.
  assert.equal(world.network.calls.length, 1);
  // SL refusing the list: the copy kept in /data answers.
  world.service.sl.sitesCache = null;
  world.network.fail = 429;
  assert.match(fr(await action(world, 'search_stops', { query: 'TCE' })), /T-Centralen \[9001\]/);
  // No copy at all: the failure is said, in red.
  world.service.sl.sitesCache = null;
  await rm(join(world.dataDir, 'sites.json'));
  assert.equal(
    fr(await failedAction(world, 'search_stops', { query: 'Slussen' })),
    'SL est injoignable (transport.integration.sl.se: HTTP 429 (quota)). Réessayez dans un instant.',
  );
});

test('add a stop: homonyms, unknown line or mode, filters in the name, duplicates', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ambiguous = await failedAction(world, 'add_stop', { stop: 'Slussen' });
  assert.match(fr(ambiguous), /Plusieurs arrêts correspondent/);
  assert.match(fr(ambiguous), /Slussen \(ersättningstrafik\) \[9208\]/);
  assert.match(fr(await failedAction(world, 'add_stop', { stop: '999999' })), /« 999999 »/);
  const wrongLine = await failedAction(world, 'add_stop', { stop: '9192', lines: '17, 99' });
  assert.match(
    fr(wrongLine),
    /absente\(s\) de cet arrêt : 99\. Lignes des 20 prochaines heures : /,
  );
  assert.match(fr(await failedAction(world, 'add_stop', { stop: '9192', mode: 'boat' })), /BOAT/);
  assert.deepEqual(world.fake.discoveredDevices, []);

  const added = await action(world, 'add_stop', {
    stop: '9192',
    lines: '18 17',
    direction: 'Hagsatra',
  });
  assert.equal(
    fr(added),
    "Slussen (17, 18 · → Hagsatra) ajouté.\nOuvrez l'onglet Découverte pour créer son appareil.",
  );
  const byName = await action(world, 'add_stop', { stop: 't-centralen', mode: 'train' });
  assert.match(fr(byName), /^T-Centralen \(Pendeltåg\) ajouté/);
  assert.match(
    fr(await failedAction(world, 'add_stop', { stop: '9001', mode: 'TRAIN' })),
    /déjà suivi avec ces filtres/,
  );
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.name, d.external_id]),
    [
      ['SL · Slussen (17, 18 · → Hagsatra)', 'ext:test-integration:stop:9192-17-18-to-hagsatra'],
      ['SL · T-Centralen (Pendeltåg)', 'ext:test-integration:stop:9001-train'],
    ],
  );
  assert.deepEqual(
    devices[0].features.map((f) => f.name),
    ['Prochain départ', 'Départ suivant', 'Retard', 'Ligne et destination', 'Perturbation'],
  );
  const saved = JSON.parse(await readFile(join(world.dataDir, 'watch.json'), 'utf8'));
  assert.deepEqual(saved.watches[0].lineRefs, ['METRO:17', 'METRO:18']);
  // Nothing is read before a device is created.
  const before = world.network.departureRequests().length;
  await world.service.refresh();
  assert.equal(world.network.departureRequests().length, before);
});

test('at most MAX_WATCHES stops', async (t) => {
  const watches = Array.from({ length: MAX_WATCHES }, (_, i) => ({
    id: SLUSSEN,
    name: 'Slussen',
    lines: [],
    direction: `D${i}`,
    mode: '',
  }));
  const world = await createWorld({ saved: { watches } });
  t.after(() => world.app.stop());
  assert.match(fr(await failedAction(world, 'add_stop', { stop: '9001' })), /déjà 10 arrêts/);
});

test('two stops: states at creation, one request per stop, messages once', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: '9192', lines: '76' });
  await action(world, 'add_stop', { stop: '9001', lines: '17' });
  const slussen = await create(world, 'Slussen');
  assert.equal(lastState(world, slussen, 'line'), '76 → Norra Hammarbyhamnen');
  assert.equal(lastState(world, slussen, 'disruption'), 1);
  assert.ok(world.fake.widgetRefreshes.includes('departures'));
  const tc = await create(world, 'T-Centralen');
  // 17 to Skarpnäck at 09:37 is cancelled: the next one is 17 to Vällingby.
  assert.equal(lastState(world, tc, 'line'), '17 → Vällingby');
  assert.equal(lastState(world, tc, 'next'), 2);
  assert.equal(lastState(world, tc, 'following'), 3);
  assert.equal(lastState(world, tc, 'delay'), 1);
  assert.equal(lastState(world, tc, 'disruption'), 0);
  // A single line is filtered by SL itself.
  const last = new URL(world.network.departureRequests().at(-1).url);
  assert.equal(last.searchParams.get('line'), '17');
  // Then both, one request each; the messages are not read again before 5 min.
  const departures = world.network.departureRequests().length;
  const messages = () => world.network.calls.filter((c) => c.url.includes('deviations')).length;
  const read = messages();
  world.clock.advance(60000);
  await world.service.refresh();
  assert.equal(world.network.departureRequests().length, departures + 2);
  assert.equal(messages(), read);
  world.clock.advance(MESSAGES_EVERY_MS);
  await world.service.refresh();
  assert.equal(messages(), read + 1);
});

test('nothing announced (a stop at night): countdowns at their maximum', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.network.stops[STYRSVIK] = { departures: [], stop_deviations: [] };
  await action(world, 'add_stop', { stop: '102' });
  const pier = await create(world, 'Styrsvik');
  assert.equal(lastState(world, pier, 'next'), NO_DEPARTURE_MINUTES);
  assert.equal(lastState(world, pier, 'following'), NO_DEPARTURE_MINUTES);
  assert.equal(lastState(world, pier, 'delay'), 0);
  assert.equal(lastState(world, pier, 'line'), 'Aucun départ dans les 20 heures');
  assert.equal(lastState(world, pier, 'disruption'), 0);
});

test('a quiet pier shows its next boats, hours ahead', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: '102', direction: 'Stavsnäs' });
  const pier = await create(world, 'Styrsvik');
  assert.equal(lastState(world, pier, 'line'), '23 → Stavsnäs');
  assert.equal(lastState(world, pier, 'next'), 42);
  assert.equal(lastState(world, pier, 'following'), 100);
});

test('triggers: silent first read, then once per journey and threshold', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { device, events } = await stageEverything(world);
  const of = (key) => events.filter((event) => event.key === key);

  assert.equal(of(TRIGGERS.CANCELLED).length, 1);
  assert.deepEqual(of(TRIGGERS.CANCELLED)[0].data, {
    stop: device.external_id,
    stop_name: 'Slussen',
    line: '57',
    mode: 'BUS',
    destination: 'Sofia',
    platform: 'A',
    scheduled_time: '09:48',
    expected_time: '09:49',
    minutes: 7,
    delay_minutes: 2,
  });

  const delayed = of(TRIGGERS.DELAYED).filter((event) => event.data.line === '474');
  assert.deepEqual(
    delayed.map((event) => event.data.threshold),
    ['1', '2', '3', '5', '10'],
  );
  assert.equal(delayed[0].data.expected_time, '10:11');
  // The delays already there at the first read are not news.
  assert.ok(of(TRIGGERS.DELAYED).every((event) => event.data.line === '474'));

  assert.deepEqual(
    of(TRIGGERS.DISRUPTION).map((event) => event.data),
    [
      {
        stop: device.external_id,
        stop_name: 'Slussen',
        line: '17',
        summary: 'Signalfel vid Slussen',
        description: 'Förseningar i tunnelbanetrafiken.',
      },
    ],
  );

  // Bus 57 cancelled never says "time to leave"; others did.
  assert.ok(of(TRIGGERS.SOON).length > 0);
  assert.ok(
    of(TRIGGERS.SOON).every(
      (event) => !(event.data.line === '57' && event.data.scheduled_time === '09:48'),
    ),
  );

  // Nothing again on the next read.
  const count = world.fake.sceneEvents.length;
  await world.service.refresh();
  assert.equal(world.fake.sceneEvents.length, count);
});

test('time to leave: each threshold once, when the countdown reaches it', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: '102' });
  await create(world, 'Styrsvik');
  const soon = () =>
    world.fake.sceneEvents
      .filter((e) => e.key === TRIGGERS.SOON && e.data.destination === 'Hagede')
      .map((e) => [e.data.threshold, e.data.minutes]);
  // Boat 16 to Hagede leaves at 09:50, 12 min after the first read: the
  // thresholds reached at the first read (12, 15, 20) are not news.
  for (let i = 0; i < 4; i += 1) {
    world.clock.advance(60000);
    await world.service.refresh();
  }
  assert.deepEqual(soon(), [['10', 10]]);
});

test('a restart does not announce the same cancellation or message again', async (t) => {
  const world = await createWorld();
  await stageEverything(world);
  await world.app.stop();
  const network = createFetch();
  network.stops = world.network.stops;
  network.messages = world.network.messages;
  const again = await createWorld({
    network,
    dataDir: world.dataDir,
    devices: world.fake.devices,
    clock: world.clock,
  });
  t.after(() => again.app.stop());
  world.clock.advance(60000);
  await again.service.refresh();
  const keys = again.fake.sceneEvents.map((event) => event.key);
  assert.ok(!keys.includes(TRIGGERS.CANCELLED));
  assert.ok(!keys.includes(TRIGGERS.DISRUPTION));
});

test('the container reads the departures on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const world = await createWorld({ timers: true, config: { refresh_interval: '60' } });
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: '9192' });
  await create(world, 'Slussen');
  const before = world.network.departureRequests().length;
  t.mock.timers.tick(60000);
  await world.service.inflight;
  t.mock.timers.tick(60000);
  await world.service.inflight;
  assert.equal(world.network.departureRequests().length, before + 2);
  // A poll right after a read does not read again.
  await world.fake.poll(discovered(world, 'Slussen'));
  assert.equal(world.network.departureRequests().length, before + 2);
});

test('network cut: one warning, the status, countdowns go on, then back', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: '102' });
  const pier = await create(world, 'Styrsvik');
  assert.equal(lastState(world, pier, 'next'), 12);
  const logs = captureLogs(t);
  world.network.fail = new Error('getaddrinfo EAI_AGAIN');
  world.clock.advance(3 * 60000);
  await world.service.refresh();
  await world.service.refresh();
  assert.equal(logs.filter((line) => line.level === 'warn').length, 1);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /SL est injoignable/);
  assert.equal(lastState(world, pier, 'next'), 9);
  assert.match(
    fr(await action(world, 'status')),
    /Dernière erreur : transport\.integration\.sl\.se: getaddrinfo EAI_AGAIN/,
  );
  world.network.fail = null;
  await world.service.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.ok(logs.some((line) => line.level === 'info' && /SL reachable again/.test(line.text)));
});

test('a normal read writes nothing at info level', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: '9192' });
  await create(world, 'Slussen');
  const logs = captureLogs(t);
  world.clock.advance(MESSAGES_EVERY_MS);
  await world.service.refresh();
  assert.deepEqual(logs, []);
});

test('/data lost: the stops come back from the Gladys devices', async (t) => {
  const first = await createWorld();
  await action(first, 'add_stop', { stop: '9192', lines: '76, 2', direction: 'Ropsten' });
  await create(first, 'Slussen');
  await first.app.stop();
  const world = await createWorld({ devices: first.fake.devices });
  t.after(() => world.app.stop());
  assert.deepEqual(world.service.watches, [
    {
      id: SLUSSEN,
      name: 'Slussen',
      lines: ['2', '76'],
      lineRefs: ['BUS:2', 'BUS:76'],
      stopAreas: [1011, 306, 11002, 44000, 8054],
      direction: 'Ropsten',
      mode: '',
    },
  ]);
  assert.equal(world.fake.discoveredDevices[0].external_id, first.fake.devices[0].external_id);
  assert.equal(world.network.departureRequests().length, 1);
});

test('remove a stop by its name or number', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: '9192' });
  await action(world, 'add_stop', { stop: '9001', lines: '17' });
  assert.match(fr(await action(world, 'remove_stop', { name: 'slussen' })), /^Slussen n'est plus/);
  assert.match(
    fr(await action(world, 'remove_stop', { name: 'T-Centralen (17)' })),
    /^T-Centralen \(17\) n'est plus/,
  );
  assert.match(
    fr(await failedAction(world, 'remove_stop', { name: '9192' })),
    /Aucun arrêt suivi ne correspond/,
  );
  assert.deepEqual(world.fake.discoveredDevices, []);
});

test('the status lists the stops and their devices', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: '9192' });
  await action(world, 'add_stop', { stop: '9001' });
  await create(world, 'Slussen');
  world.clock.advance(12000);
  const status = fr(await action(world, 'status'));
  assert.match(status, /Arrêts suivis : 2/);
  assert.match(status, /• Slussen \[9192\] — appareil créé/);
  assert.match(status, /• T-Centralen \[9001\] — appareil pas encore créé/);
  assert.match(status, /il y a 12 s/);
});

test('the widget: Gladys name, cancelled and late rows, traffic caption', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { device } = await stageEverything(world);
  world.gladys.devices.find((d) => d.external_id === device.external_id).name = 'Home metro';
  const ack = await world.fake.widgetGet('departures', {
    settings: { stop: device.external_id },
    language: 'en',
  });
  const [heading, caption, status] = ack.data.content.components;
  assert.equal(heading.text, 'Home metro');
  assert.equal(caption.text, '⚠ Hållplats Slussen läge C flyttad · Signalfel vid Slussen');
  assert.equal(status.items.length, 8);
  assert.deepEqual(status.items[3], {
    label: '3 → Södersjukhuset',
    value: '09:42 · 0 min · +3',
    color: 'warning',
  });
  // 13 to Axelsberg cancelled at the next read: a red row, at its timetable time.
  world.network.stops[SLUSSEN].departures.find(
    (d) =>
      d.line.designation === '13' &&
      d.destination === 'Axelsberg' &&
      d.expected > '2026-11-20T09:42',
  ).state = 'CANCELLED';
  await world.service.refresh();
  const again = await world.fake.widgetGet('departures', {
    settings: { stop: device.external_id },
    language: 'fr',
  });
  assert.deepEqual(again.data.content.components[2].items[6], {
    label: '13 → Axelsberg',
    value: '09:43 · Supprimé',
    color: 'danger',
  });
  const none = await world.fake.widgetGet('departures', { settings: {}, language: 'de' });
  assert.equal(
    none.data.content.components[0].text,
    'Wähle eine Haltestelle in den Widget-Einstellungen.',
  );
  const gone = await world.fake.widgetGet('departures', {
    settings: { stop: 'ext:x' },
    language: 'es',
  });
  assert.equal(gone.data.content.components[0].text, 'Esta parada ya no se sigue.');
});

test('the scene action: sentence, line filter, nothing found, unknown stop', async (t) => {
  const world = await createWorld({ config: { language: 'en' } });
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: '102' });
  const device = await create(world, 'Styrsvik');
  const all = await world.fake.sceneAction('get_next_departures', { stop: device.external_id });
  assert.equal(
    all.data.outputs.sentence,
    'Boat 16 to Hagede at Styrsvik: in 12 and 312 min. Boat 23 to Stavsnäs at Styrsvik: in 42 and 100 min. Boat 16 to Stavsnäs at Styrsvik: in 282 and 492 min',
  );
  const line17 = await world.fake.sceneAction('get_next_departures', {
    stop: device.external_id,
    line: '17',
  });
  assert.equal(line17.data.outputs.destination, 'Saltsjöbaden');
  assert.equal(line17.data.outputs.expected_time, '15:15');
  assert.equal(line17.data.outputs.disrupted, 0);
  const none = await world.fake.sceneAction('get_next_departures', {
    stop: device.external_id,
    line: '99',
  });
  assert.equal(none.data.outputs.minutes, NO_DEPARTURE_MINUTES);
  assert.equal(none.data.outputs.sentence, 'No departure from Styrsvik in the next 20 hours.');
  const unknown = await world.fake.sceneAction('get_next_departures', { stop: 'ext:x' });
  assert.equal(unknown.success, false);
  assert.equal(unknown.error.fr, "Cet arrêt n'est plus suivi.");
});

test('a language change renames the devices, not their features', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: '9001', mode: 'metro' });
  await world.fake.configUpdated({ language: 'de' });
  assert.equal(world.fake.discoveredDevices[0].name, 'SL · T-Centralen (U-Bahn)');
});

test('a removed stop does not come back at the restart, even with its device', async (t) => {
  const first = await createWorld();
  await action(first, 'add_stop', { stop: '9192' });
  await create(first, 'Slussen');
  await action(first, 'remove_stop', { name: 'Slussen' });
  await first.app.stop();
  const world = await createWorld({ dataDir: first.dataDir, devices: first.fake.devices });
  t.after(() => world.app.stop());
  assert.deepEqual(world.service.watches, []);
  await action(world, 'add_stop', { stop: '9192' });
  assert.equal(world.service.watches.length, 1);
});

test('one stop failing keeps the others', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: '102' });
  await action(world, 'add_stop', { stop: '9001' });
  const pier = await create(world, 'Styrsvik');
  await create(world, 'T-Centralen');
  const fetch = world.network.fetch;
  world.service.sl.fetch = async (url) =>
    url.includes('/sites/102/') ? new Response('{}', { status: 500 }) : fetch(url);
  world.clock.advance(60000);
  await world.service.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(lastState(world, pier, 'next'), 11);
  assert.equal(T_CENTRALEN, 9001);
});
