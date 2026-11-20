// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+).
//
// - departures: the board of one watched stop — a status row per departure
//   ("17 → Åkeshov" / "07:45 · 3 min · +4"), green when counted down in real
//   time, orange when late, red when cancelled, grey for a timetable time;
//   the heading is the device name given in Gladys, the caption the SL traffic
//   message of the stop (in Swedish, as SL writes it) or the legend.
//
// Budget of the core: 8 components, 2 texts, a status of 10 rows at most.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { clockTime } from './departures.js';
import { clip, watchName } from './devices.js';
import { TEXT, say } from './messages.js';

export const MAX_ROWS = 8;
const MAX_LABEL = 40;

const t = (language, key, params) => say(TEXT, language, key, params);

/** "07:45 · 3 min · +4", "07:45 · Cancelled". */
export function departureValue(departure, language) {
  const time = clockTime(departure.cancelled ? departure.aimed : departure.expected);
  if (departure.cancelled) {
    return clip(`${time} · ${t(language, 'cancelled')}`, 40);
  }
  const late = departure.delay > 0 ? ` · +${departure.delay}` : '';
  return `${time} · ${departure.minutes} min${late}`;
}

export function departureColor(departure) {
  if (departure.cancelled) {
    return WIDGET_COLORS.DANGER;
  }
  if (departure.delay >= 2) {
    return WIDGET_COLORS.WARNING;
  }
  return departure.realtime ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL;
}

async function departuresContent(service, { settings, language }) {
  const ttl = Math.max(30, service.config.refreshSeconds);
  if (!settings?.stop) {
    return { ttl_seconds: ttl, components: [{ type: 'text', text: t(language, 'pickStop') }] };
  }
  const found = await service.boardOf(settings.stop);
  if (!found) {
    return { ttl_seconds: ttl, components: [{ type: 'text', text: t(language, 'gone') }] };
  }
  const { watch, departures, messages } = found;
  // The name the user gave the device in Gladys, else the name of the watch.
  const device = (service.gladys.devices ?? []).find((d) => d.external_id === settings.stop);
  const components = [
    {
      type: 'text',
      variant: 'heading',
      text: clip(device?.name || watchName(watch, language), 40),
    },
  ];
  if (!departures) {
    components.push({ type: 'text', variant: 'body', text: t(language, 'loading') });
    return { ttl_seconds: ttl, components };
  }
  components.push({
    type: 'text',
    variant: 'caption',
    text:
      messages.length > 0
        ? clip(
            `⚠ ${[...new Set(messages.map((m) => m.summary || m.description))].join(' · ')}`,
            120,
          )
        : t(language, 'legend'),
  });
  const rows = departures.slice(0, MAX_ROWS);
  if (rows.length === 0) {
    components[1] = { type: 'text', variant: 'caption', text: t(language, 'noDeparture') };
    return { ttl_seconds: ttl, components };
  }
  components.push({
    type: 'status',
    items: rows.map((departure) => ({
      label: clip(`${departure.line} → ${departure.destination}`, MAX_LABEL),
      value: departureValue(departure, language),
      color: departureColor(departure),
    })),
  });
  return { ttl_seconds: ttl, components };
}

export const WIDGETS = {
  departures: { get: departuresContent },
};
