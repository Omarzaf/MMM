# II — Virality without an industry

Project. The political economy of Pakistan's music revival, 2014–2026: the country can now measure reach far better than it can measure livelihood. The entry is a research design, not a victory lap. It keeps official internet statistics, platform self-reports, small surveys, artist stories and still-to-be-collected data apart.

Read it live: https://meaning-man-and-model.vercel.app/virality-without-an-industry.html

## Files

| Path | What it is |
| --- | --- |
| `article/virality-without-an-industry.html` | The entry as published: a single self-contained page. |
| `pakistan_music_research_package.html` | The same page as built by `tools/build-site.mjs`. `pakistan_music_research_package (1).html` is the builder's mirror copy. |
| `source_map.csv` | Every source the entry uses, with its type and what it can and cannot support. |
| `annotated_bibliography.csv` | Annotated reading list. |
| `proposition_matrix.csv` | The propositions the study tests, and the evidence each one needs. |
| `artist_dataset_codebook.csv`, `track_dataset_codebook.csv` | Codebooks for the artist and track datasets still to be collected. |
| `content_analysis_codebook.md` | Codebook for the content analysis. |
| `analysis_plan.md` | The analysis plan. |
| `data_collection_protocol.md`, `fieldwork_schedule.csv` | How and when the data will be collected. |
| `interview_guide.md`, `research_ethics_protocol.md` | Interview guide and ethics protocol for the fieldwork. |
| `docs/superpowers/specs/2026-08-23-hiphop-pakistan-live-research-brief.md` | The live research brief: the source verification and narrative boundaries the page was built against. |
| `assets/hiphop-pakistan/` | Photographs and fonts used by the page. `manifest.json` records each image's source, author and licence. |
| `site/` | Page content, data, figures and styles. The chapter text is in `site/content/chapters/`. |
| `tools/`, `tests/` | The page builder, verifier and test suite. |
| `MMM-ALIGNMENT-2026-08-26.md` | Notes on aligning the page with the series design. |

The page links its research files with site-root paths such as `/source_map.csv`. Those resolve on the live site. In this repository, the same files sit at the top of this folder.

## Reproducing the page

Requires Node.js 22 or later. No packages need installing.

```bash
node tools/build-site.mjs
node --test tests/*.test.mjs
```

The build is deterministic and should produce a file identical to `article/virality-without-an-industry.html`. As of this snapshot, 124 of 126 tests pass. The two failures are the determinism test and the verifier-CLI test, and both also fail in the original working folder. They are known issues in the test harness, not in the published page.
