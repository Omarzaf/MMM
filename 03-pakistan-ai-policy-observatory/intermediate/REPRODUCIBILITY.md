# Reproducibility note

Generated: 2026-09-03T04:15:00Z

Dataset SHA-256: `f3ea28cda863210d730a8c40ee76d516a07eecfc3dac0d1ee57456a105fa1cdc`

1. Run `node tools/audit_dataset.mjs` to reproduce the file inventory, hashes, container checks and temporal-coverage calculations.
2. Run `node tools/prepare_briefings.mjs` to reproduce normalized briefing units, URL indices and whole-unit similarity checks.
3. Run `node tools/build_research_dataset.mjs` to validate source references and regenerate the curated evidence, source, exclusion and watchlist CSVs from the reviewed event model.
4. Review `intermediate/briefing_units.csv` and `intermediate/coverage_gaps.csv` before interpreting negative findings. Missing intervals are never imputed.
5. Re-open every URL in `intermediate/source_register.csv` because live registers can change. Reconfirm legal/procurement lifecycle status against the primary text or register and record a new access timestamp.
6. Treat briefing repetition as discovery provenance only. Corroboration requires an independent external source; later releases describing the same underlying event remain one event cluster.
7. Create and activate `.venv`, install the pinned packages in `requirements.txt`, then build the DOCX with `python tools/build_report.py` and the XLSX with `python tools/build_workbook.py`.
8. After recalculating and saving the workbook in native Excel, run `python tools/sanitize_workbook_metadata.py` to remove optional local save-path metadata, then run `python tools/verify_workbook.py --require-cached-formulas`.

“Comprehensive” here means comprehensive with respect to the supplied files and documented verification searches. It cannot prove that every relevant public event was captured.
