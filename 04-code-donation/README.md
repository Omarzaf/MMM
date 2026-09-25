# IV — Code Donation: the situation of Pakistan’s open-source community

Essay, Meaning, Man and Model. Read it live: https://umarzafar.vercel.app/code-donation.html

> **About this folder.** `article/` holds the essay as published on umarzafar.vercel.app: `code-donation.html` with its stylesheet, script and the site’s `theme-boot.js`. It includes a later editing pass that `code-donation-meaning-man.html` and `code-donation.md` below do not, so where they differ, `article/` is the published text. Everything else is the working folder the essay was built from, described below.

---

# Open Source in Pakistan

Entry IV of Meaning, Man and Model — "Code Donation; situation of Pakistan’s open source
community." Numbering follows the live site at meaning-man-and-model.vercel.app, which
carries three entries ahead of this one; the repo-root index had drifted behind it.

## Files

| File | What it is |
|---|---|
| `code-donation-meaning-man.html` | **The entry.** Standalone MMM page, figures inlined. This is the published artefact, linked from `index.html`. |
| `code-donation.md` | The prose source. Edit here, then re-apply changes to the HTML. |
| `verbalized-sampling/` | The VS run. `vs-prompts.txt` is emitted by the installed library; `vs-run.json` is the k=5 tail-tuned run over five load-bearing passages, with every candidate, its verbalized probability, the selection and why. |
| `figures/*.svg` | Five figures, authored against MMM colour tokens as CSS custom properties with hex fallbacks, so they inherit the page theme in both light and dark mode. Inlined into the entry by `scripts/06-inline-figures.py`. |
| `eligibility-panel-q1-2026.json` | The 140-economy panel behind Figs. 04 and 05 — GitHub licence data joined to World Bank population, internet penetration and income group, with Sponsors eligibility flagged. |
| `research-memo-source.md` | The original research memo this folder started from, unedited. Retained for provenance; several of its claims did not survive verification — see the ledger in Section 10 of the entry. |
| `scripts/` | Reproduction scripts: fetch primary data, build the panel, run the tests, emit the figures, inline them. |

## Figures

| Figure | Claim it carries |
|---|---|
| `fig-01-denominator.svg` | Correcting for internet penetration closes about a third of the peer gap, not all of it. |
| `fig-02-level-vs-growth.svg` | Pakistan has the lowest level and the fastest growth in its peer set. |
| `fig-03-conversion-rate.svg` | **The centrepiece.** The base grew 7.9×; the share converting to public contribution did not move. |
| `fig-04-income-confound.svg` | The headline Sponsors-eligibility gap is an income gap. |
| `fig-05-eligibility-test.svg` | Among Pakistan's income peers, eligibility does not separate the field. |
| Fig. 06 (in-page) | The bespoke element: two live levers — base growth and conversion rate — against Vietnam's current intensity. |
| `entry-mark-code-donation.svg` | The entry mark. Seven rings, one per year, area ∝ the GitHub account base; the copper arc on each is that year's conversion rate at 1% = 90°. The rings grow eightfold, the arc does not move — the argument as one diagram, in the series' line-geometry language. |

## Design notes for this entry

First entry built on the three-zone frame in `readme.md` (left contents nav, content
column, marginalia rail) rather than the older Mecca Pact layout. Scroll-spy, theme
toggle with `localStorage`, numbered endnotes with live hrefs, and a TL;DR block are
all wired rather than stubbed.

Three decisions worth a second opinion, all flagged in the handoff:

- **Page width.** Three zones need 1384px of content box; the readme still says a 1120px
  page max, which predates the frame. This entry uses `--page-max-entry: 1384px` plus
  20px side padding, so the full frame appears at ≥1424px.
- **Narrow viewports.** Implements the review's proposed default (item 5): left nav
  collapses first at 1423px, marginalia stack inline at 1175px.
- **Label contrast.** `--text-label` (`--ink-6`) is 2.47:1 on light paper, below WCAG AA
  for small text. Mono labels that carry content use `--text-support` (`--ink-4`, 4.63:1)
  here; only decorative chrome keeps `--ink-6`. Figures avoid `--ink-6`/`--ink-7` for
  text and data marks entirely.

## Regenerating

Figures and the panel are built from primary data, not committed intermediates — the
GitHub Innovation Graph CSVs, the GitHub Sponsors region list, and the World Bank
population/internet series are all fetched live. See `scripts/README.md`. After
regenerating a figure, re-run `scripts/06-inline-figures.py` to refresh the entry.

## Verbalized sampling

Prose was run through `verbalized-sampling` 0.1.3 (VS-Standard, k=5, tail-tuned to p < 0.1)
on five passages: the opening, the thesis line, the section 03 opener, the section 04
conclusion and the closer. Selections ran from p=0.05 down to p=0.02 against modes of
p=0.28–0.34. Facts, numbers, citations and hedges were held fixed; only framing was sampled.

The library needs Python 3.10+ and its full dependency set pulls torch and transformers, so
the prompt machinery is loaded directly with only pydantic present — real prompts, no LLM
client stack. It ships no model, so the sampled model is the assistant.

## Status

Draft, not published. Before release: re-point the PSEB Annual Report citation at PSEB's
own publication rather than the third-party mirror, verify (or drop) the five
carried-forward claims listed in Section 10, and edit the four `MarginThought` notes in
the right rail — they are drafted in Umar's first-person voice and should be his words.
