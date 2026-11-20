# SL Stockholm

Next departures of your SL stops in Stockholm in Gladys: metro, commuter trains (pendeltåg), trams,
buses and boats, with delays, cancellations and traffic messages, in real time.

The data comes from **SL** (Storstockholms Lokaltrafik), the public transport of the Stockholm
region, through its open APIs published on [Trafiklab](https://www.trafiklab.se): **no account and
no key**. This integration is not affiliated with SL or Trafiklab.

## What you get

- **A device per watched stop** (optionally filtered by lines, direction or transport mode): next
  departure and following departure (minutes), delay of the next departure (minutes), its line and
  destination (text), and whether an SL traffic message concerns the stop or its lines (yes/no).
- **A dashboard widget** with the next departures of a stop: time, minutes, delay, cancelled
  departures in red, traffic messages on top.
- **Four scene triggers**: time to leave, departure delayed, departure cancelled, new disruption.
- **A scene action** that reads the next departures of a stop, with a sentence ready to send by
  message or speaker.

## Requirements

- Gladys Assistant 5.3.0 or later.
- Internet access from the Gladys host (the integration calls `transport.integration.sl.se` and
  `deviations.integration.sl.se`).
- A stop of the SL network (Stockholm county). Other Swedish regions are not covered.

## Installation

1. In Gladys, open **Integrations → Install from GitHub**.
2. Paste `https://github.com/guim31/gladys-sl-stockholm` and install.
3. Open the integration's **Configuration** tab.

## Configuration

### Settings

- **Language of the texts**: language of the feature names (set when a device is created) and of
  the scene sentences. SL writes its traffic messages in Swedish: they are shown as they are.
- **Refresh interval**: 1 minute (default) or 2 minutes. One request per created device; the
  traffic messages are read every 5 minutes.

### Adding a stop

1. **Find a stop**: type a name (`Slussen`, `Odenplan`…) or its abbreviation (`TCE`). The answer
   lists the matching stops with their number, `Slussen [9192]` for example.
2. **Add a stop**: type the number (or the exact name when it is unique). Optional filters:
   - **Lines**: `17, 18` keeps only these lines (as written on the vehicle: `43X`, `474`…). The
     lines are checked against the departures of the next 20 hours.
   - **Direction**: `Hagsätra` keeps only the departures whose destination contains this text
     (accents and case ignored, `hagsatra` works too).
   - **Mode**: metro, commuter train, tram, bus or boat, for the large hubs.
3. Open the **Discover** tab and add the device to Gladys.

The same stop with other filters makes another device: add Slussen towards Hagsätra and Slussen
towards Åkeshov to follow both directions. Up to 10 stops can be watched.

### Removing a stop, checking the state

- **Remove a stop**: type its name as shown by the status (`Slussen (17)`) or its number. Its device
  stays in Gladys until you delete it.
- **Show what is watched**: the stops, whether their device exists, the last read from SL and the
  last error.

## Devices

| Feature              | Type            | Content                                                       |
| -------------------- | --------------- | ------------------------------------------------------------- |
| Next departure       | duration (min)  | minutes before the next departure that runs (0 = leaving now) |
| Following departure  | duration (min)  | minutes before the one after                                  |
| Delay                | duration (min)  | delay of the next departure (0 when on time or early)         |
| Line and destination | text            | `17 → Åkeshov`                                                |
| Disruption           | binary (yes/no) | an SL traffic message concerns the stop or its lines          |

Cancelled departures are skipped by the countdowns. With no departure announced in the next 20
hours, the countdowns show 1440 minutes. Only the departures kept by the filters count. A traffic
message counts when it names the stop, or a line followed by the filter; closed lifts and entrances
(SL's lowest importance) are left out.

## Dashboard widget

**Next departures**: choose a stop. The widget shows its next eight departures (line, destination,
expected time, minutes, delay): green when counted down in real time, orange when two minutes late
or more, red when cancelled, grey for a timetable time. The caption shows the traffic messages of
the stop. The heading is the name you gave the device in Gladys.

## Scene triggers

Each trigger can be limited to a stop and to a line (as written on the vehicle, upper case).

- **Time to leave**: a departure leaves in the chosen number of minutes (1 to 20). Fires once per
  departure, when its countdown reaches the number. A departure first seen inside the window does
  not fire.
- **Departure delayed**: a departure is late by the chosen number of minutes or more (1 to 60).
  Once per departure and threshold.
- **Departure cancelled**: a departure is cancelled. Once per departure.
- **New disruption**: a new traffic message concerns a stop or one of its followed lines. Once per
  message and line.

Variables passed to the scene: stop, line, mode (`METRO`, `TRAIN`, `TRAM`, `BUS`, `SHIP`),
destination, platform, scheduled and expected times, minutes, delay; for a disruption, its summary
and details (in Swedish). What is already there when the integration starts is not announced;
cancellations and messages already announced are not announced again after a restart.

## Scene actions

**Read the next SL departures**: choose a stop, optionally a line. Outputs: a sentence
(`Metro 17 to Åkeshov at Slussen: in 3 and 8 min`), the stop, line, destination, minutes to wait,
minutes to the following one, delay, expected time, platform, real time (1/0), disruption (1/0). The
sentence follows the language of the configuration.

## Scene examples

- **Leave for the metro**: trigger "Time to leave", stop Slussen (17), 7 min → send "Your metro
  leaves in {{minutes}} min from platform {{platform}}" and blink the hall light.
- **Morning briefing**: at 7:00 on weekdays, action "Read the next SL departures" → send its
  sentence to the kitchen speaker.
- **Warn of a cancelled bus**: trigger "Departure cancelled", stop T-Centralen (65) → send a
  message with the destination and the scheduled time.

## Data, refresh and quotas

The SL APIs on Trafiklab are free and need no key. They answer `429 Quota has been exceeded` to
bursts of requests: the integration reads the stops one after the other, at most once a minute,
only for the devices created in Gladys, reads the traffic messages every 5 minutes and the list of
stops (1.6 MB) only when you search or add a stop, kept for a day. Departures are SL's real time
when the vehicle is tracked, else the timetable.

## Troubleshooting

- **No device in Discover**: add the stop first, with "Add a stop".
- **"SL cannot be reached"**: the Gladys host has no internet access, SL is down, or its quota was
  exceeded (HTTP 429). The integration retries at each refresh and says when it is back.
- **A line filter is refused**: the answer lists the lines seen at the stop in the next 20 hours;
  type the line as written there.
- **Several stops share a name** (`Slussen` and `Slussen (ersättningstrafik)`, the replacement
  service stop): use the number shown by "Find a stop".
- **A trigger does not fire**: check the line (exact, upper case) and that the device exists in
  Gladys: only created devices are read.

## Limits

- Developed without living in Stockholm, against the real SL API: feedback welcome.
- Feature names are set when the device is created.
- Traffic messages are in Swedish, never translated.
- SL returns the next departures of each line and direction for the next 20 hours, not every one:
  the widget and the countdowns show the first ones, which is what a board needs.
- Only SL: no SJ long-distance trains, no other Swedish region.

## Credits

Data: SL, published on [Trafiklab](https://www.trafiklab.se/api/our-apis/sl/). Inspired by the
community HASL integration for Home Assistant and by the `gladys-entur` integration.
