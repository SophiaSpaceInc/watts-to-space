# Changelog

Changes to the site, the model and the command line, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/) as this project reads it:

- **Patch** (1.0.x): fixes, wording, and small additions that change no reference-case result.
- **Minor** (1.x.0): new pages or features, or a corrected value that changes a reference-case result.
- **Major** (x.0.0): a change that breaks posted share links or exported scenario files.

The version is in `package.json`, and each release is tagged `vX.Y.Z`.

## [1.0.3] - 2026-11-04

### Fixed

- Numbers that round to zero no longer show a minus sign, such as "−0 % of the dark-sky value" on
  the Sun page when a panel is close to its balance temperature.

## [1.0.2] - 2026-11-03

### Added

- A note in every page footer and the README that the project was developed with coding agents:
  Grok, Codex and Claude all contributed, including adversarial review.

## [1.0.1] - 2026-11-03

### Added

- The Sun and Watts per kilogram pages take their slider settings from the address, and the
  address follows the sliders, so copying it shares the setting. For example, a solar panel facing
  the Sun with compute bonded to it:
  `/sun/?sunAngle_deg=0&solarAbsorptance=1&emissivity=0.8&T_C=84`. Reset returns to the page's
  defaults.
- This changelog.

## [1.0.0] - 2026-11-03

First public release.

- The explorer: heat path, radiator and location, and power supply for four reference cases (ISS
  heritage, SpaceX Starmind, Aggressive engineering, Idealized bound), with sensitivity charts, a
  pinned baseline, a FAQ and a provenance note on every input.
- Companion pages: Your laptop in space (`/everyday/`), Pointing a radiator at the Sun (`/sun/`) and
  Watts per kilogram (`/mass/`).
- Share links (`?s=w2s1...`), scenario import and export, the `bun run analyze` command line and the
  agent skill.

[1.0.3]: https://github.com/interplanetarychris/watts-to-space/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/interplanetarychris/watts-to-space/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/interplanetarychris/watts-to-space/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/interplanetarychris/watts-to-space/releases/tag/v1.0.0
