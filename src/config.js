// -----------------------------------------------------------------------------
// Integration configuration: the defaults (they mirror the `default` values of
// the manifest `config_schema`, test/manifest.test.js checks it) and the
// normalization of what Gladys sends (strings from the form).
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Seconds between two reads of the departures. One minute is the floor: one
// request per watched stop, on an API shared by every user, and a countdown in
// minutes gains nothing from more.
export const REFRESH_INTERVALS = [60, 120];

export const DEFAULT_CONFIG = {
  language: 'fr',
  refresh_interval: '60',
};

/**
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 * @returns {{ language: string, refreshSeconds: number }}
 */
export function normalizeConfig(raw = {}) {
  const language = LANGUAGES.includes(raw?.language) ? raw.language : DEFAULT_CONFIG.language;
  const seconds = Number(raw?.refresh_interval ?? DEFAULT_CONFIG.refresh_interval);
  return {
    language,
    refreshSeconds: REFRESH_INTERVALS.includes(seconds)
      ? seconds
      : Number(DEFAULT_CONFIG.refresh_interval),
  };
}
