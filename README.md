# dsh-peak-indicator

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) Web UI plugin from [DKM.Labs](https://github.com/DKM-Labs): a small pill under the message composer that says whether the DeepSeek API is billing **Peak** or **Off-peak** right now, with a countdown to the next change.

Published as `@dkm-labs/dsh-peak-indicator` (GitHub install; not on npm yet).

```
Off-peak · peak in 2h 41m      ← green: half price
Peak · off-peak in 1h 05m      ← amber: standard price
```

Hover it for the rule, the next switch time in your local time zone, and the holiday-calendar coverage. It re-evaluates every 30 seconds. No network calls, no API key, no host data — the tier is computed from the clock.

## Why

DeepSeek's API price depends on the time of day: peak hours cost twice the off-peak rate. Sending a task while the pill says **Off-peak** is the same request for half the price. The countdown answers the useful question: *wait, or send now?*

## Install

The package is a DSH **bundle** (it declares `dsh.bundle.patch`), so the one-line install wires it into the profile:

```sh
dsh plugin --profile web add github:DKM-Labs/dsh-peak-indicator
```

Or from a local clone (edits show up after a page reload):

```sh
git clone https://github.com/DKM-Labs/dsh-peak-indicator.git
dsh plugin --profile web add ./dsh-peak-indicator
```

From the GUI, the same spec goes into **Plugins → Add plugin**: `github:DKM-Labs/dsh-peak-indicator`, the full repository URL, or an absolute directory path. The running `dsh web` recomposes live; if the pill does not appear, reload the page once.

The package does not need a build step and has no runtime dependencies, so a Git install asks for no pnpm `allowBuilds` approval.

### Uninstall

```sh
dsh plugin --profile web remove @dkm-labs/dsh-peak-indicator
```

## How the tier is decided

The plugin implements DeepSeek's official pricing footnote, verbatim:

> Off-peak rates are half of the peak rates. Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday, excluding Chinese public holidays. All other hours are off-peak, including weekends and Chinese public holidays in full.

Beijing time is UTC+8 with no daylight saving, so the check applies a fixed +8 h offset and reads the Beijing calendar day:

```
peak  ⇔  Beijing date is Mon–Fri  ∧  not a Chinese public holiday  ∧  time ∈ [09:00,12:00) ∪ [14:00,18:00)
idle  ⇔  every other instant
```

- **Weekends and Chinese public holidays are off-peak all day**, including a weekend that holiday adjustment turns into a working day.
- **The countdown points at the next real tier flip**, not the next clock boundary: on Friday after 18:00 it counts down to Monday 09:00 Beijing (63 h), and on a holiday weekday it skips the whole holiday block.
- **Holiday calendar**: 2026 (国办发明电〔2025〕7号) and 2027 (国办发明电〔2026〕10号) are built in. For a year whose notice is not published, weekdays are treated as peak-eligible; the tooltip names the coverage.

The tier is defined by DeepSeek's pricing page and can change; that page is authoritative. The plugin deliberately shows no price figures, because hardcoded prices rot.

## Verify

```sh
node scripts/verify.mjs
```

Offline and dependency-free: it loads `client.js` through a stub `window.__ModuleLoader__` exactly like the browser module table, renders the pill at fixed instants by mocking `Date.now`, and covers both peak windows, all boundaries, weekends, the 63-hour weekend countdown, 2026/2027 holiday days, the package contract, and the holiday calendar's day count. The same command runs in GitHub Actions on every push and pull request.

## Compatibility

- DSH `0.2.x`; developed and verified against `0.2.2-rc.1`. `engines.dsh` carries explicit prerelease branches so `-rc` builds resolve.
- Registers one entry in `conversation.composer.dock` (`kind: list`, session scope), the same ambient row as the host's own usage and activity pills.
- Styled only with host theme tokens (`--dsw-alias-*`, `--dsh-content-font-*`), so it follows light/dark, font size and zoom.

## Limitations

- The visible copy is English only.
- Holiday coverage ends with the published State Council notices (2027 at release time); update `CN_HOLIDAYS` in `client.js` when the next notice lands.
- It reports the DeepSeek API tier; it does not know which provider or model a session actually uses.

## License

[MIT](LICENSE). The billing rule and calendar data are quoted from DeepSeek's public pricing page and the State Council holiday notices.
