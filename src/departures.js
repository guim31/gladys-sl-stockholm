// -----------------------------------------------------------------------------
// From the SL answers to what a watched stop shows: departures (times in
// milliseconds, minutes to wait, delay, cancellation) kept by the filters of
// the watch (lines, direction, mode), and the traffic messages that concern it.
// Pure functions: the clock is a parameter.
// -----------------------------------------------------------------------------

/** Lower case, without accents: "Hässelby" matches "hasselby". */
export function fold(text) {
  return String(text ?? '')
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export const SL_ZONE = 'Europe/Stockholm';
const zoneParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: SL_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Offset of Stockholm from UTC at `ms`, in milliseconds (1 or 2 hours). */
function stockholmOffset(ms) {
  const parts = Object.fromEntries(
    zoneParts.formatToParts(new Date(ms)).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * "2026-11-20T09:32:10" (Stockholm time, no offset, as the departures API
 * writes it) → epoch ms; a time with an offset is read as is; NaN otherwise.
 */
export function parseSlTime(text) {
  const value = String(text ?? '');
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (!match) {
    return /^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
  }
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, Number.isFinite(s) ? s : 0);
  // Two passes: the offset at the guessed instant, then at the corrected one
  // (right at a daylight saving change).
  let guess = wall - stockholmOffset(wall);
  guess = wall - stockholmOffset(guess);
  return guess;
}

// States of a departure that will not leave (Trafiklab "Departure states").
const NOT_RUNNING = new Set(['CANCELLED', 'MISSED', 'ABORTED', 'REPLACED']);
// States of a departure already gone.
const GONE = new Set(['PASSED', 'DEPARTED']);

/** "METRO:17": a line id alone is not unique (ship 17 of Waxholmsbolaget, 43 and 43X). */
export const lineRef = (mode, id) => `${mode}:${id}`;

/**
 * One departure per entry of the API, soonest first; the ones already gone
 * (an answer a minute old) are dropped.
 * @param {object[]} raw `departures` of the API
 * @param {number} now ms
 */
export function parseDepartures(raw, now) {
  const departures = [];
  for (const entry of raw ?? []) {
    const aimed = parseSlTime(entry?.scheduled);
    const expected = parseSlTime(entry?.expected ?? entry?.scheduled);
    if (
      !Number.isFinite(aimed) ||
      !Number.isFinite(expected) ||
      expected < now - 60000 ||
      GONE.has(entry.state)
    ) {
      continue;
    }
    const line = entry.line ?? {};
    const mode = String(line.transport_mode ?? '');
    departures.push({
      // A journey id holds its date (2026112080025): unique with the line.
      key: `${lineRef(mode, line.id)}|${entry.journey?.id ?? entry.scheduled}`,
      line: String(line.designation ?? '').trim() || '?',
      lineRef: lineRef(mode, line.id),
      mode,
      destination: String(entry.destination ?? '').trim() || '?',
      platform: String(entry.stop_point?.designation ?? ''),
      stopArea: entry.stop_area?.id ?? null,
      aimed,
      expected,
      minutes: Math.max(0, Math.floor((expected - now) / 60000)),
      // Early departures are not a delay: 0.
      delay: Math.max(0, Math.round((expected - aimed) / 60000)),
      cancelled:
        NOT_RUNNING.has(entry.state) ||
        (entry.deviations ?? []).some((deviation) => deviation?.consequence === 'CANCELLED'),
      // "3 min" or "Nu" is a real-time countdown; "10:20" a timetable time.
      realtime: /^(nu|\d+ min)$/i.test(String(entry.display ?? '').trim()),
    });
  }
  return departures.sort((a, b) => a.expected - b.expected);
}

/**
 * The departures a watch keeps: its lines (as SL writes them, case ignored),
 * its direction (part of the destination, accents and case ignored), its mode.
 * @param {object[]} departures from parseDepartures
 * @param {{ lines?: string[], direction?: string, mode?: string }} watch
 */
export function applyFilters(departures, watch) {
  const lines = new Set((watch.lines ?? []).map((line) => line.toUpperCase()));
  const direction = fold(watch.direction);
  return departures.filter(
    (departure) =>
      (lines.size === 0 || lines.has(departure.line.toUpperCase())) &&
      (!direction || fold(departure.destination).includes(direction)) &&
      (!watch.mode || departure.mode === watch.mode),
  );
}

/**
 * The departures of an earlier read, as of `now`: minutes counted again from
 * the expected time, the ones gone dropped. A board read a minute ago (or
 * before an outage of SL) never shows a frozen countdown.
 */
export const aged = (departures, now) =>
  departures
    .filter((departure) => departure.expected >= now - 60000)
    .map((departure) => ({
      ...departure,
      minutes: Math.max(0, Math.floor((departure.expected - now) / 60000)),
    }));

/** The departures that will run: not cancelled. */
export const running = (departures) => departures.filter((departure) => !departure.cancelled);

// Lifts and entrances closed are importance 2: useful on site, not a
// disruption of the trip. Moved stops, cancellations, works: 3 and more.
export const MIN_IMPORTANCE = 3;

/**
 * The traffic messages of SL that concern a watch, each once, most important
 * first:
 * - a message about lines counts when one of them is a line of the watch (its
 *   filter, else the lines seen at the stop) and, without a line filter, when
 *   it names no stop or names this one;
 * - a message about a stop only counts for this stop.
 * @param {object[]} messages deviations API
 * @param {{ lineRefs?: string[], stopAreas?: number[] }} watch
 * @param {object[]} departures the departures kept by the watch
 * @param {number} now ms
 */
export function messagesFor(messages, watch, departures, now) {
  const filtered = (watch.lineRefs ?? []).length > 0;
  const lines = new Set(filtered ? watch.lineRefs : departures.map((d) => d.lineRef));
  const areas = new Set([
    ...(watch.stopAreas ?? []),
    ...departures.map((d) => d.stopArea).filter(Number.isInteger),
  ]);
  const found = [];
  for (const message of messages ?? []) {
    const id = message?.deviation_case_id;
    if (id === undefined || (message.priority?.importance_level ?? 0) < MIN_IMPORTANCE) {
      continue;
    }
    const from = Date.parse(message.publish?.from);
    const upto = Date.parse(message.publish?.upto);
    if ((Number.isFinite(from) && from > now) || (Number.isFinite(upto) && upto < now)) {
      continue;
    }
    const scopeLines = (message.scope?.lines ?? []).map((l) => lineRef(l.transport_mode, l.id));
    const scopeAreas = (message.scope?.stop_areas ?? []).map((a) => a.id);
    const atStop = scopeAreas.some((area) => areas.has(area));
    const relevant =
      scopeLines.length > 0
        ? scopeLines.some((line) => lines.has(line)) &&
          (filtered || scopeAreas.length === 0 || atStop)
        : atStop;
    if (!relevant) {
      continue;
    }
    const variant =
      (message.message_variants ?? []).find((v) => v?.language === 'en') ??
      (message.message_variants ?? [])[0] ??
      {};
    found.push({
      id: String(id),
      importance: message.priority?.importance_level ?? 0,
      lines: [
        ...new Set(
          (message.scope?.lines ?? [])
            .filter((l) => lines.has(lineRef(l.transport_mode, l.id)))
            .map((l) => String(l.designation)),
        ),
      ],
      summary: String(variant.header ?? '').trim(),
      description: String(variant.details ?? '').trim(),
    });
  }
  return found.sort((a, b) => b.importance - a.importance);
}

const clockFormat = new Map();

/** "07:45" in the time zone of the container (TZ, set by Gladys). */
export function clockTime(ms) {
  const zone = process.env.TZ || undefined;
  if (!clockFormat.has(zone)) {
    clockFormat.set(
      zone,
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: zone,
      }),
    );
  }
  return clockFormat.get(zone).format(new Date(ms));
}
