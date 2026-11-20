# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- A device per watched SL stop (optionally filtered by lines, direction or
  transport mode): next and following departure, delay, line and destination,
  disruption indicator.
- Configuration actions to find, add and remove stops, and to show what is
  watched.
- A "Next departures" dashboard widget, with delays, cancellations and the SL
  traffic messages of the stop.
- Scene triggers: time to leave, departure delayed, departure cancelled, new
  disruption.
- A scene action reading the next departures, with a sentence ready to send.
- Texts and documentation in English, French, German and Spanish.
