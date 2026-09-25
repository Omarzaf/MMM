# HipHop Pakistan — hybrid alignment to Meaning, Man and Model (2026-08-26)

The "Living Liner Notes" entry was built to its own approved broadsheet brief and
did not follow the series design system in `../readme.md`. Umar asked for a
**hybrid** alignment: keep this piece's broadsheet layout, chaptering, evidence
instruments, and photography, but give it the MMM *identity*. Nothing about the
research, copy, chapters, sources, or interactions changed.

## What changed (identity only)

- **Type → MMM.** Display/body is now **Newsreader**; every label/caption/nav/table
  (the old system-sans `--interface`) and all mono are now **IBM Plex Mono**. The
  five MMM type roles now read through.
- **Palette → single copper accent.** Warm MMM paper/ink ramp; `--rust` is now the
  series **copper `#8a5a3b`**. The second accent (`--source-blue`) and the blue-teal
  evidence-matrix ramp were collapsed to warm ink/copper tones so copper is the only
  chromatic accent. (`--matrix-3` set to `#c6a274` to hold AA on 11px score text.)
- **Warm dark mode + toggle.** Added the MMM `[data-theme="dark"]` warm-near-black
  ground (copper fixed across modes). Default follows `prefers-color-scheme`; a
  fixed-corner **theme toggle** (progressive-enhancement, persists to localStorage)
  can force either mode. The contact-sheet film mount stays dark in both themes.

## Fonts are package-local, not external, not data: URIs

This package's `verify-site` contract forbids **both** external URLs **and** `data:`
URIs (it flags either as `EXTERNAL_RUNTIME_ASSET`). So the two faces are shipped as
latin-subset woff2 under `assets/hiphop-pakistan/fonts/` and referenced by relative
`url(...)` from `site/fonts.css`, which `tools/build-site.mjs` prepends into the one
inlined `<style>`. The page still makes **zero** network requests. (SIL OFL 1.1.)

## Sources: registry kept (not converted to numbered endnotes)

MMM's binding source rule is "every citation links its real primary source." That is
already met: each inline `Sxxx` chip resolves to a registry row whose "Open original
source" link is a verified external URL (`verify-site` rejects any that isn't). The
filterable 76-source registry is *more* rigorous than a flat endnote list (it carries
per-source provenance + limitation), so it was restyled into the copper/mono idiom
rather than replaced. Converting to literal MMM numbered-superscript endnotes is a
separate, larger job if Umar wants the exact pattern.

## Files touched
`site/styles.css`, `site/render/document.mjs` (toggle button), `site/interactions.mjs`
(theme toggle), `tools/build-site.mjs` (+ prepend fonts.css), `tests/package.test.mjs`
(fixture copies fonts.css), new `site/fonts.css` + `assets/hiphop-pakistan/fonts/*.woff2`.

## Verification
`node tools/build-site.mjs` → deterministic; canonical == mirror.
`node tools/verify-site.mjs` → **PASS**. Full suite: 110/127 (the 17 failures are the
pre-existing environment-only infra tests — symlinked-output / preview-server /
temp-dir / on-device Chrome — none design-related; all render/contrast/motion/
interaction/content/figures/csv/research-model tests pass).
Not yet done here: live desktop/mobile screenshots in light+dark (blocked — the
desktop app's device sign-in went stale mid-session, and the device VM has no Chrome).
