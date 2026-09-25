# Evidence workbook specification

Target: `outputs/01a0653c-96d7-7c92-918b-3975d6716164/Pakistan_AI_Policy_Monitor_Evidence_Register_and_Coverage_Log_2026-08-18_to_2026-09-03.xlsx`

The workbook is a presentation and audit layer over the reviewed intermediate CSV/JSON files. It must not change the underlying event decisions, dates, lifecycle classifications, confidence ratings, or source limitations.

## Sheets and authoritative inputs

1. **Read Me** — title, observed period, search cutoff, scope caveat, source hierarchy, confidence rubric, navigation, and formula-driven control totals.
2. **Evidence Register** — `evidence_register.csv`; one row per distinct event or retained baseline/context record. Preserve separate event/publication dates and separate facts, source claims, interpretation, implications, and unresolved issues.
3. **Coverage & Gaps** — `audit_summary.json`, `briefing_units.csv`, and `coverage_gaps.csv`; show nominal expected, observed, and missing counts, observed-span estimates, strict-window coverage, timezone notes, and every inter-briefing gap.
4. **Exclusions** — `exclusion_log.csv`; retain item ID, item, exclusion type, reason, and disposition.
5. **Briefing Units** — `briefing_units.csv`; retain B001–B014 provenance, exact filenames/subunits, normalized UTC windows, timing issues, and hashes.
6. **Sources** — `source_register.csv`; retain S001–S111 with publisher, title, plain-text URL, source type, publication/event/access dates, availability, and limitations.
7. **Watchlist** — `watchlist.csv`; retain W001–W014 with trigger, topic, verification task, source ID where present, and plain-text URL.
8. **File Inventory** — `dataset_inventory.csv`; retain every received top-level file, format, size, hash, readability, apparent coverage, units, and inclusion decision.
9. **Methodology** — `REPRODUCIBILITY.md` plus the report appendix; summarize extraction, deduplication, verification, conflict treatment, and refresh instructions.

## Required workbook controls

- Read Me totals must be formulas tied to the populated data sheets: 52 evidence rows, 111 sources, 14 briefing units, 13 exclusions, and 14 watch items.
- Coverage controls must calculate `1,440 - 14 = 1,426` and the observed ratio `14 / 1,440`, with divide-by-zero protection.
- Evidence lifecycle controls must calculate 36 in-period/verification-discovered records and 16 baseline/context records, split into 13 `BASELINE_CARRY_IN` and 3 `CONTRADICTED_OR_UNRESOLVED` baselines.
- Confidence controls must calculate 32 High, 16 Medium, and 4 Low across all evidence rows.
- All researched rows must expose their source URLs directly; no URL may be inferred or shortened.
- The WHO GIS/NEIR record and S047 must visibly preserve `24 August in B006` versus `28 August on the current mutable page`.
- The telecom-withdrawal record must retain publication date `2026-08-28`.

## Presentation and verification

- Use a restrained navy/teal/gold editorial palette consistent with the report, with accessible contrast and no decorative charting.
- Freeze the identifying columns and header row on long sheets; enable filters on every register.
- Wrap long evidence and limitation fields, cap widths, and use sensible row heights so text remains readable without extreme cells.
- Use typed numeric values for counts, minutes, bytes, and ratios. Use formulas for derived totals and rates.
- Apply conditional formatting only where it clarifies lifecycle, confidence, inclusion, or missing coverage.
- Visually inspect every sheet and scan formulas for `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, and `#N/A` before export.
- Save exactly one final `.xlsx` in the target output directory.
