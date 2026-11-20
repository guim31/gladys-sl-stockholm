// -----------------------------------------------------------------------------
// From the recorded SL answers to departures and messages: Stockholm times,
// minutes, delays, cancellations, filters, the messages of a watch.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFilters,
  clockTime,
  messagesFor,
  parseDepartures,
  parseSlTime,
  running,
} from '../src/departures.js';
import {
  FIXTURE_TIME,
  SLUSSEN,
  STYRSVIK,
  T_CENTRALEN,
  fixtureJson,
  recordedStops,
} from './helpers/world.js';
import { slMessage } from './helpers/scenario.js';

const stops = recordedStops();
const parse = (site) => parseDepartures(stops[site].departures, FIXTURE_TIME);
const SLUSSEN_AREAS = [1011, 306, 11002, 44000, 8054];

test('SL times are Stockholm wall-clock times, winter and summer', () => {
  assert.equal(parseSlTime('2026-11-20T09:32:10'), Date.parse('2026-11-20T08:32:10Z'));
  assert.equal(parseSlTime('2026-07-01T09:00:00'), Date.parse('2026-07-01T07:00:00Z'));
  // Around the change of 2026-10-25 (03:00 CEST → 02:00 CET).
  assert.equal(parseSlTime('2026-10-25T04:00:00'), Date.parse('2026-10-25T03:00:00Z'));
  assert.equal(parseSlTime('2026-10-25T01:30:00'), Date.parse('2026-10-24T23:30:00Z'));
  // With an offset (deviations API): read as is.
  assert.equal(parseSlTime('2026-11-20T07:00:00+01:00'), Date.parse('2026-11-20T06:00:00Z'));
  assert.ok(Number.isNaN(parseSlTime('soon')));
});

test('the recorded Slussen departures: minutes, delay, platform, real time', () => {
  const departures = parse(SLUSSEN);
  assert.equal(departures.length, 104);
  const metro18 = departures.find((d) => d.line === '18' && d.destination === 'Åkeshov');
  assert.deepEqual(
    {
      mode: metro18.mode,
      lineRef: metro18.lineRef,
      platform: metro18.platform,
      time: clockTime(metro18.expected),
      minutes: metro18.minutes,
      delay: metro18.delay,
      realtime: metro18.realtime,
      cancelled: metro18.cancelled,
    },
    {
      mode: 'METRO',
      lineRef: 'METRO:18',
      platform: '1',
      time: '09:38',
      minutes: 0,
      delay: 0,
      realtime: true,
      cancelled: false,
    },
  );
  // A timetable time ("09:39") is not real time.
  const bus474 = departures.find((d) => d.line === '474');
  assert.equal(bus474.realtime, false);
  // "Inställd": cancelled.
  const skarpnack = departures.find((d) => d.line === '17' && d.destination === 'Skarpnäck');
  assert.equal(skarpnack.cancelled, true);
  // Sorted by expected time.
  assert.ok(departures.every((d, i) => i === 0 || departures[i - 1].expected <= d.expected));
});

test('a departure already gone is dropped; an early one has no delay', () => {
  const [entry] = structuredClone(stops[SLUSSEN].departures);
  entry.expected = '2026-11-20T09:30:00';
  assert.deepEqual(parseDepartures([entry], FIXTURE_TIME), []);
  entry.scheduled = '2026-11-20T09:45:00';
  entry.expected = '2026-11-20T09:44:00';
  assert.equal(parseDepartures([entry], FIXTURE_TIME)[0].delay, 0);
  entry.state = 'DEPARTED';
  assert.deepEqual(parseDepartures([entry], FIXTURE_TIME), []);
});

test('filters: lines (any case), direction (part, accents ignored), mode', () => {
  const departures = parse(T_CENTRALEN);
  const lines = applyFilters(departures, { lines: ['43X', '17'] });
  assert.deepEqual([...new Set(lines.map((d) => d.line))].sort(), ['17', '43X']);
  const direction = applyFilters(departures, { direction: 'hasselby' });
  assert.ok(direction.length > 0);
  assert.ok(direction.every((d) => d.destination === 'Hässelby strand'));
  const trains = applyFilters(departures, { mode: 'TRAIN' });
  assert.ok(trains.length > 0 && trains.every((d) => d.mode === 'TRAIN'));
  assert.equal(running(departures).length, departures.length - 3);
});

test('a quiet archipelago pier: the next boats of the coming hours', () => {
  const departures = parse(STYRSVIK);
  assert.equal(departures[0].minutes, 12);
  assert.equal(departures[1].minutes, 42);
  assert.deepEqual(parseDepartures(fixtureJson('departures-empty.json').departures, 0), []);
});

test('messages: at the stop, on a followed line, never a lift', () => {
  const messages = fixtureJson('messages.json');
  const slussen = parse(SLUSSEN);
  // No line filter: only the message about Slussen itself.
  assert.deepEqual(
    messagesFor(messages, { stopAreas: SLUSSEN_AREAS }, slussen, FIXTURE_TIME).map((m) => [
      m.id,
      m.lines,
      m.summary,
    ]),
    [['12388104', ['76', '57'], 'Hållplats Slussen läge C flyttad']],
  );
  // Line 76 followed: every message about line 76, wherever.
  const bus76 = applyFilters(slussen, { lines: ['76'] });
  assert.deepEqual(
    messagesFor(
      messages,
      { stopAreas: SLUSSEN_AREAS, lineRefs: ['BUS:76'] },
      bus76,
      FIXTURE_TIME,
    ).map((m) => m.id),
    ['12388104', '12869517', '13288336'],
  );
  // Ship 17 is not metro 17; a closed lift (importance 2) is not a disruption.
  const extra = [
    slMessage({ id: 1, header: 'Brygga', lines: [['SHIP', 17]] }),
    slMessage({ id: 2, header: 'Hiss', lines: [['METRO', 17]], stopAreas: [1011], importance: 2 }),
    slMessage({ id: 3, header: 'Signalfel', lines: [['METRO', 17]] }),
  ];
  assert.deepEqual(
    messagesFor(extra, { stopAreas: SLUSSEN_AREAS, lineRefs: ['METRO:17'] }, [], FIXTURE_TIME).map(
      (m) => m.summary,
    ),
    ['Signalfel'],
  );
  // Out of its publication window: not shown.
  assert.deepEqual(
    messagesFor(extra, { lineRefs: ['METRO:17'] }, [], Date.parse('2026-11-21T12:00:00Z')),
    [],
  );
});
