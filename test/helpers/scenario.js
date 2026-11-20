// -----------------------------------------------------------------------------
// A scenario staging every trigger on the real Slussen departures: the first
// read is silent, then, five minutes later (when the traffic messages are read
// again), a bus is cancelled, another is 12 minutes late, a new traffic message
// concerns the metro at Slussen, and the countdowns go on. The changes are
// made on the recorded answers, as SL would send them.
// -----------------------------------------------------------------------------

import { SLUSSEN, action, create } from './world.js';

/** "2026-11-20T09:38:10" + minutes, in the same wall-clock format as SL. */
export function shift(local, minutes) {
  const ms = Date.parse(`${local}Z`) + minutes * 60000;
  return new Date(ms).toISOString().replace(/\.\d+Z$/, '');
}

/** A traffic message as the deviations API writes it. */
export function slMessage({ id, header, details, lines = [], stopAreas = [], importance = 5 }) {
  return {
    version: 1,
    deviation_case_id: id,
    publish: { from: '2026-11-20T06:00:00+01:00', upto: '2026-11-20T23:00:00+01:00' },
    priority: { importance_level: importance, influence_level: 5, urgency_level: 1 },
    message_variants: [{ header, details, scope_alias: '', language: 'sv' }],
    scope: {
      stop_areas: stopAreas.map((areaId) => ({ id: areaId, name: 'Slussen', type: 'METROSTN' })),
      lines: lines.map(([mode, lineId]) => ({
        id: lineId,
        transport_authority: 1,
        designation: String(lineId),
        transport_mode: mode,
      })),
    },
  };
}

const find = (departures, line, destination, after = '2026-11-20T09:44') =>
  departures.find(
    (d) => d.line.designation === line && d.destination === destination && d.expected > after,
  );

/** Resolves with the scene events fired after the first read. */
export async function stageEverything(world) {
  await action(world, 'add_stop', { stop: String(SLUSSEN) });
  const device = await create(world, 'Slussen');
  const before = world.fake.sceneEvents.length;
  const departures = world.network.stops[SLUSSEN].departures;
  // Bus 57 to Sofia (09:49): cancelled.
  find(departures, '57', 'Sofia').state = 'CANCELLED';
  // Bus 474 to Mölnvik (09:39): 12 minutes late.
  const late = find(departures, '474', 'Mölnvik');
  late.expected = shift(late.scheduled, 12);
  // A new message about the green line at Slussen.
  world.network.messages.push(
    slMessage({
      id: 99000001,
      header: 'Signalfel vid Slussen',
      details: 'Förseningar i tunnelbanetrafiken.',
      lines: [['METRO', 17]],
      stopAreas: [1011],
    }),
  );
  world.clock.advance(5 * 60000);
  await world.service.refresh();
  return { device, events: world.fake.sceneEvents.slice(before) };
}
