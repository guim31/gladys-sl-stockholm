# SL Stockholm for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration for public transport in
**Stockholm**: next departures of your SL stops (metro, commuter train, tram, bus, boat), delays,
cancellations and traffic messages, in real time, from the open APIs SL publishes on
[Trafiklab](https://www.trafiklab.se). No account, no key.

## What it does

- **A device per watched stop**, optionally filtered by lines, direction or transport mode: next
  and following departure (minutes), delay of the next departure, its line and destination, and a
  disruption indicator.
- **A dashboard widget**: the next departures of a stop, with times, delays, cancellations and the
  traffic messages.
- **Scene triggers**: time to leave (1 to 20 minutes before a departure), departure delayed,
  departure cancelled, new disruption.
- **A scene action**: read the next departures of a stop, with a sentence ready to send.
- Texts in English, French, German and Spanish. SL's traffic messages stay in Swedish, as
  published.

The user documentation is in [`docs/en.md`](docs/en.md) ([fr](docs/fr.md), [de](docs/de.md),
[es](docs/es.md)).

## Requirements

- Gladys Assistant 5.3.0 or later, with internet access.
- A stop of the SL network (Stockholm county).

## Installation

1. In Gladys, open **Integrations → Install from GitHub**.
2. Paste `https://github.com/guim31/gladys-sl-stockholm` and install.
3. In the integration's **Configuration** tab, use **Find a stop** then **Add a stop**, and create
   the device in the **Discover** tab.

## How it works

The integration reads `transport.integration.sl.se/v1/sites/{id}/departures` (20-hour window) for
each created device, one after the other, every minute (or two), and the traffic messages of
`deviations.integration.sl.se/v1/messages` every 5 minutes. The list of SL sites, used by the stop
search, is read on demand and kept in memory for a day. SL answers bursts with HTTP 429: the
integration never retries in a loop. Only `/data/watch.json` is written: the watched stops and the
cancellations and messages already announced.

## Limits

- Developed without living in Stockholm, against the real SL API: feedback welcome.
- Feature names are set when the device is created.
- Up to 10 stops; SL returns the next departures of each line and direction for 20 hours.
- Traffic messages are in Swedish only.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and real SL answers recorded in `test/fixtures/sl`;
they never touch the network. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- Cover: the SL logo from
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Storstockholms_Lokaltrafik.svg)
  (public domain), shown in white on the SL blue.
- Data: SL (Storstockholms Lokaltrafik), published on
  [Trafiklab](https://www.trafiklab.se/api/our-apis/sl/).
- Inspired by the community HASL integration for Home Assistant and by the `gladys-entur`
  integration.

Not affiliated with SL (Region Stockholm) or Trafiklab.

## License

Apache-2.0
