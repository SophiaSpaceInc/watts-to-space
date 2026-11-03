# Sharing scenarios

Three ways to hand a scenario to someone else, from lightest to heaviest.

| Way | Carries | Use for |
|---|---|---|
| Share string / link | Mode, preset ids, and only the inputs that differ from those presets | Posting in a thread, paper footnote, issue, chat |
| Exported JSON file | The whole scenario, with provenance notes | Design logs, diffs, attaching to a ticket, scenarios with edited stacks |
| Command line | The `bun run analyze ...` command that produced it | Reproducibility in a README or issue (always works, shows every change) |

## Make a share link

```text
bun run analyze --mode starmind --environment cislunar-deep --set radiator.emissivity=0.85 --share-out --format table
```

Prints the share string, the link (`https://watts-to-space.chrislewicki.com/?s=<share string>`), a suggested one-line post and the list of changes. The JSON form (`--share-out` alone) has `share`, `url`, `headline`, `changes`. Use `--base-url` to point at another host (a fork, a local build). Recipients without a browser can use the share string with the CLI, or open the repo's offline `dist-standalone/index.html` build.

An unmodified reference mode is a very short string (for example `w2s1.eyJtIjoiaXNzIiwicCI6Ijc0YTQ2ZjA1In0.208a06c5` for ISS heritage).

## Open a link someone else posted

- Agent: `bun run analyze --share '<string or whole URL>'`. Quote it. The CLI finds `?s=` in a URL and ignores the host, so a link to a fork works too.
- Human: open the URL in a browser; the page reads `?s=`.
- Add `--format table` to show the person the result, and read `changes` to say what the poster altered.
- If the output reports `checksum mismatch`, the string was truncated or mangled in transit (chat clients and line wrapping do this). Ask for the full link again.

## Files

```text
bun run analyze --mode iss --set radiator.sizingMargin=1.4 --export > my-case.json
bun run analyze --scenario my-case.json --format table
```

`--export` writes the same format as the page's Export button: `{"format":"watts-to-space/scenario","version":1,"scenario":{...}}`. Import validates every field and lists every problem. A bare scenario object (no wrapper) is also accepted.

## What a share string contains

`w2s1.<payload>.<check>`

- `w2s1`: format and version.
- `payload`: base64url of JSON `{ m, h?, e?, d? }`: `m` mode id; `h` heat-source preset id and `e` environment preset id if they differ from the mode's defaults; `d` a map of dot-path to value for each input that differs from that preset combination. The source stack (`heatSource.stages`) and the environment travel whole when edited, because their shape can change.
- `check`: 8 hex digits of FNV-1a over the payload.

You can read a payload yourself: split on `.`, base64url-decode the middle part.

**No personal data.** Parameters only. No name, account, machine path or timestamp. Provenance notes are not carried; they come from the presets in the code version that decodes the link.

**Integrity, not authenticity.** The checksum detects accidental damage. It is not a signature or a MAC: anyone can change the payload and recompute the check. Treat a link as "these parameters", never as "this person endorses these numbers". Decoding validates every field, rejects unknown fields and refuses prototype-pollution paths, so a hostile link is exactly as dangerous as an imported file.

**Versioning.** The prefix `w2s1` changes only if the meaning of an encoded field changes. A newer prefix is rejected by an older build with a message naming the prefix it reads. Presets can also change between releases: a link records preset ids and differences, not the preset values, so the same link may evaluate differently after a preset's number is corrected. For a permanent record, attach the exported JSON file or quote the numbers and the commit.

## Posting conventions

1. The link (or string).
2. One line: the mode or case, the location, the inputs changed from the preset with from and to values, and the two or three results that matter (radiator m², solar array m², total mass kg).
3. If it makes a claim ("a coating at 0.85 saves 30 m²"), give the source for the changed number and say whether it is sourced, `ASSUMPTION` or `SECONDARY`.
4. Name the repo commit or release if numbers might move later.

`--share-out --format table` produces items 1 and 2. Real example:

```text
Ideal engineering (ideal), Moon polar ridge, 106 kW rejected: radiator 86.056 m², solar array 267.69 m², total 40144 kg. Changes: environment leo-600 -> moon-polar; heatSource.totalPower_W 250000 -> 100000; radiator.emissivity 0.92 -> 0.85
```

Tidy it for the audience before posting; do not alter the numbers.
