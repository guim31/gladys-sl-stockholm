// -----------------------------------------------------------------------------
// SL open APIs (Stockholm, Trafiklab, no key):
// - transport.integration.sl.se/v1/sites: every SL site (6,500, 1.6 MB),
//   read on demand for the stop search, kept in memory for a day;
// - /v1/sites/{id}/departures: the departures of one site, one request per
//   watched stop and refresh (the API has no batch);
// - deviations.integration.sl.se/v1/messages: the traffic messages in force,
//   one request for every watch, read less often (they change slowly).
//
// The API answers 429 "Quota has been exceeded" to bursts (seen on the site
// list after two reads in a few minutes): the site list is cached, and an
// error is reported once, never retried in a loop.
// -----------------------------------------------------------------------------

export const TRANSPORT_URL = 'https://transport.integration.sl.se/v1';
export const DEVIATIONS_URL = 'https://deviations.integration.sl.se/v1/messages';

const TIMEOUT_MS = 15000;
// Minutes of departures asked for: the API's maximum (1,200). It does not
// return every departure of the window, only the next few of each line and
// direction, so a stop quiet at night still shows its first morning departure.
export const FORECAST_MINUTES = 1200;
export const SITES_TTL_MS = 24 * 3600 * 1000;
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
   */
  constructor({ fetch: fetchImpl = globalThis.fetch, now = Date.now } = {}) {
    this.fetch = fetchImpl;
    this.now = now;
    this.sitesCache = null;
  }

  async request(url) {
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
   * Every SL site, from the memory cache when younger than a day.
   * @returns {Promise<{ id: number, name: string, note: string, aliases: string[], stopAreas: number[] }[]>}
   */
  async sites() {
    if (this.sitesCache && this.now() - this.sitesCache.at < SITES_TTL_MS) {
      return this.sitesCache.sites;
    }
    const body = await this.request(`${TRANSPORT_URL}/sites?expand=true`);
    if (!Array.isArray(body)) {
      throw new SlError('SL: unexpected site list');
    }
    // Only what the search and the watches need: a tenth of the raw size.
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
    return sites;
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
