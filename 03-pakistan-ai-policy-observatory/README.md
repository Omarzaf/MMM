# III — Pakistan’s AI policy is becoming infrastructure. Almost none of it can be shown to run.

Project, Meaning, Man and Model. Read it live: https://meaning-man-and-model.vercel.app/pakistan-ai-policy-observatory.html, or open `index.html` in this folder, where the student guide’s data links resolve to the files beside it.

> **About this folder.** This is a public snapshot of the PDP 2026 research package, taken from its source repository at commit `89632d5`. The source repository is still private, so its README below describes it as private and pre-release. Everything listed below is included here except the source repository's CI workflows (`.github/`) and one unrelated file the audit excluded from the corpus. To rebuild and check the observatory from this folder:
>
> ```bash
> node tools/build_html_report.mjs
> node tools/verify_outputs.mjs
> ```
>
> Both run offline; all 45 checks pass on this snapshot, and the rebuilt `index.html` is byte-identical to the one committed. Rebuilding the Word report and Excel register needs the Python dependencies in `requirements.txt`, as described below.

---

# PDP 2026

Source-bounded research on Pakistan's AI policy and digital-infrastructure developments observed between 2026-08-18 and 2026-09-03 UTC.

This repository remains private as of 2026-09-03. The files below are the candidate publication package, not a live public release.

## What this project is

- A verified evidence package built from a supplied briefing corpus plus independent source review.
- A separation of research stages: discovery provenance, independently assessed evidence, lifecycle status, confidence, unresolved issues, and forward checks.
- A local-first publication package with reproducible artifacts and explicit release gates.

## What this project is not

- The briefing corpus is not treated as independent corroboration.
- Missing briefing intervals are not treated as evidence that no event occurred.
- A repository copy is not permission to republish third-party source material.
- A future public release is not authorized until the human approval gates below are completed.

## Deliverables

- `index.html` — the interactive HTML edition and GitHub Pages entrypoint, in the Meaning, Man and Model design system. No external scripts, stylesheets or data; the only remote asset is the Newsreader / IBM Plex Mono webfont from Google Fonts, which degrades to the declared local Georgia / system-mono stack offline.
- `pakistan-ai-policy-observatory.html` — a redirect to `index.html`, kept so existing links to the named artifact keep resolving.
- `outputs/01a0653c-96d7-7c92-918b-3975d6716164/Pakistan_AI_Policy_and_Digital_Infrastructure_Verified_15-Day_Monitoring_Report_2026-08-18_to_2026-09-03_UTC.docx`
- `outputs/01a0653c-96d7-7c92-918b-3975d6716164/Pakistan_AI_Policy_Monitor_Evidence_Register_and_Coverage_Log_2026-08-18_to_2026-09-03.xlsx`

Machine-readable evidence, source, exclusion, watchlist, briefing, and coverage registers live under `intermediate/`. Reproducibility and verification utilities live under `tools/`.

## For students

Use this repository as an evidence observatory rather than a news feed. Start with the interactive report for orientation, then move into the repository when you need to test a claim, analyse the data, reproduce an artifact, or cite the work. The central reading rule is that verified facts, source claims, lifecycle stage, confidence, and unresolved issues remain separate.

### A five-minute route

1. Open [`index.html`](index.html) and read the short version and lifecycle ladder.
2. Search or filter the evidence ledger, expand one evidence dossier, and follow its source IDs to the source register.
3. Compare the verified facts with the source claim, confidence basis, and unresolved issues. High confidence applies to the narrow claim being assessed; it is not proof of impact or future delivery.
4. Check the coverage tables before drawing conclusions from an apparent absence. Missing briefing intervals are unknown, not evidence that nothing happened.

### Repository map

| Path | What it is for |
| --- | --- |
| [`README.md`](README.md) | Scope, deliverables, build instructions, licensing, and publication gates. |
| [`intermediate/`](intermediate/) | Canonical reviewed data, source provenance, coverage gaps, exclusions, and reproducibility notes. |
| [`tools/`](tools/) | Deterministic builders, audits, and verification utilities. |
| [`outputs/`](outputs/) | Reader-ready DOCX report and XLSX audit workbook. |
| [`CITATION.cff`](CITATION.cff) | Pre-release citation metadata for the monitoring package. |

### Data access

| File | Best use |
| --- | --- |
| [`research_dataset.json`](intermediate/research_dataset.json) | Canonical nested model for code, APIs, or deeper analysis. |
| [`evidence_register.csv`](intermediate/evidence_register.csv) | Analysis-ready event and baseline rows. |
| [`source_register.csv`](intermediate/source_register.csv) | Assessed sources, URLs, availability, and evidentiary limitations. |
| [`briefing_units.csv`](intermediate/briefing_units.csv) and [`coverage_gaps.csv`](intermediate/coverage_gaps.csv) | Monitoring coverage, provenance, and missingness. |
| [`watchlist.csv`](intermediate/watchlist.csv) | Named triggers and future verification tasks. |
| [XLSX audit workbook](outputs/01a0653c-96d7-7c92-918b-3975d6716164/Pakistan_AI_Policy_Monitor_Evidence_Register_and_Coverage_Log_2026-08-18_to_2026-09-03.xlsx) | Filterable, reader-facing audit layer over the reviewed files. |

For reuse, preserve the split-license boundary: original research content and derived dataset structure are licensed under CC BY 4.0, original code under `tools/` and `.github/` is MIT-licensed, and third-party source pages, documents, and trademarks remain under their own terms. Until a frozen public release is approved, cite this as a pre-release research artifact using [`CITATION.cff`](CITATION.cff).

## Evidence boundary

The reviewed dataset contains 36 in-period or verification-discovered events, 16 baseline or context records, and 111 assessed sources. The supplied corpus contains 14 briefing units against a nominal 1,440 intervals at a 15-minute cadence. Coverage gaps are documented and never interpreted as proof of inactivity.

Every record keeps these fields distinct:

- `source_claims` captures what a source says.
- `verified_facts` captures what survived direct assessment.
- `status_stage` captures lifecycle position rather than promotional language.
- `confidence` attaches to the stated claim, not to eventual delivery.
- `unresolved_issues` and `forward_implications` remain visible rather than silently harmonized away.

## Rebuild and verify

Prerequisites are Node.js 22, Python 3.11+, Pandoc, and native Excel for the workbook formula-cache step. Run from the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt

node tools/audit_dataset.mjs
node tools/prepare_briefings.mjs
node tools/build_research_dataset.mjs
node tools/build_html_report.mjs
python tools/build_report.py
python tools/build_workbook.py
```

Open the rebuilt workbook in native Excel, calculate it, and save it locally. Then sanitize Excel's optional save-path metadata and run every offline gate:

```bash
source .venv/bin/activate
python tools/sanitize_workbook_metadata.py
node tools/verify_outputs.mjs
python tools/verify_workbook.py --require-cached-formulas
node --test tools/link_health.test.mjs
```

The workbook is generated with OpenPyXL 3.1.5 and recalculated in native Excel so formula caches can be independently checked. Do not treat a newly generated workbook as complete until the cached-formula verifier passes. The optional `tools/render_workbook_previews.py` visual-QA helper additionally requires Pillow 11.3.0; it is not part of the rebuild or CI gate.

Optional live link audit:

```bash
node tools/check_link_health.mjs --output tmp/link-health/latest.json
```

That command performs network requests and writes an ignored machine report under `tmp/`. It should be run only when a human wants a fresh publication-readiness check. The matching GitHub Actions workflow is manual-only (`workflow_dispatch`); it has no recurring schedule.

See `intermediate/REPRODUCIBILITY.md` for the refresh sequence and methodological limits.

## License boundary

This repository uses split licensing:

- `LICENSE` applies CC BY 4.0 to the authored report text, derived dataset structure, observatory copy, and other original public-facing research content in this repository.
- `tools/LICENSE` applies MIT to original code under `tools/`.
- `.github/LICENSE` applies MIT to original GitHub Actions workflow code under `.github/`.
- Third-party source materials, scraped pages, publisher trademarks, and linked external documents are excluded from both grants unless their own upstream terms say otherwise.

When the repository is private, these licenses describe intended publication scope; they do not by themselves authorize a visibility change or redistribution of sensitive material.

## Publication checklist

1. Push the feature branch and open a pull request while the repository is still private.
2. Re-run the local rebuild and verification commands above.
3. Run the live link-health checker and manually review any hard-broken or transient failures before trusting the result.
4. Review the source and rights boundary one more time, especially for third-party material and mutable government pages.
5. Decide the GitHub Pages entrypoint and verify the final public-facing HTML path.
6. Approve repository visibility change.
7. Approve GitHub Pages enablement.
8. Approve release tag creation and GitHub Release publication.
9. Approve DOI minting and update `CITATION.cff` with the frozen release version, release date, and public URL.

## Human approval gates

- Changing repository visibility from private to public.
- Enabling GitHub Pages or any other external hosting.
- Creating a release tag or release artifact intended for distribution.
- Minting a DOI or registering the work with an external archival service.
- Redistributing third-party source material or any sensitive derivative not already cleared for publication.

## Current status

As of 2026-09-03, this repository is a private, locally verifiable publication candidate. It is designed so that publication can be reviewed deliberately rather than inferred from the presence of finished artifacts.
