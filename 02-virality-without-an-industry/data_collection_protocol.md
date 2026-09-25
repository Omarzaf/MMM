# Data Collection and Sampling Protocol

**Version:** 1.0  
**Date:** 23 August 2026

## 1. Study period

The quantitative study covers releases from 1 January 2014 through 31 December 2025. Developments from 1 January through 23 August 2026 form an epilogue and are never pooled into complete-year trend estimates.

## 2. Unit definitions

- **Work:** an underlying composition.
- **Track:** one released audio version of a work.
- **Visual item:** the official video, live session, visualizer, or programme performance linked to a track.
- **Artist:** a solo performer, duo, band, collective, ensemble, or recurring project identity.
- **Release event:** the first public availability date of a specific track version.
- **Attention observation:** a platform metric captured at a defined date, geography, and unit.

## 3. Candidate universe

Build each year's candidate pool from at least four independent channels:

1. Platform charts or year-end summaries.
2. Official channels, labels, branded programmes, distributors, and public catalogues.
3. Music criticism, radio, archives, and year-end lists.
4. Regional, independent, genre-community, and expert nominations.

No track enters the sample solely because the researcher remembers it. Memory is a discovery tool, not a sampling frame.

## 4. Primary annual strata

Select 30 tracks for each complete year. Assign one mutually exclusive primary stratum:

| Stratum | Annual quota | Operational rule |
|---|---:|---|
| High attention | 10 | Strongest documented cross-platform attention within the candidate universe |
| Editorial / critical | 5 | Repeated expert recognition, awards, or historical significance not already selected |
| Regional language | 5 | Meaningful non-Urdu or non-English lyrical identity and regional circulation |
| Independent emerging | 5 | Early-career or self-released pathway without dominant institutional sponsorship at initial release |
| Legacy revival | 3 | Older artist, catalogue, composition, or tradition receiving renewed circulation |
| Institutional soundtrack | 2 | Film, television, branded, state, campaign, or major programme commission |

Primary strata organize selection, not identity. Code language, gender, region, funding, and genre separately.

## 5. Diversity checks

After each rolling three-year block, inspect:

- Gender configuration and women's authorship/production roles.
- Province, territory, city, and non-metropolitan origin.
- Urdu, English, Punjabi, Sindhi, Pashto, Balochi, Saraiki, Hindko, Kashmiri, Shina, Burushaski, Brahui, and other languages present in the candidate universe.
- Genre and devotional/secular form.
- Class-access indicators where ethically and reliably available.
- Brand, label, distributor, and independent release routes.

Diversity checks can trigger a documented replacement within the same primary stratum. They cannot be used to delete an inconvenient negative case.

## 6. Deduplication and version rules

- Remixes, acoustic versions, live sessions, reissues, and soundtrack edits receive separate `track_id` values but share a `work_id` where appropriate.
- Select the version whose release event generated the relevant attention, and link other versions.
- Do not sum views across versions without documenting the aggregation rule.
- Exclude unofficial lyric uploads, pirated reuploads, and fan edits from primary metrics, but record their existence when they materially affect discoverability.
- A track appearing in multiple annual lists belongs to its first qualifying release year unless a later version is analytically distinct.

## 7. Metric capture

Every mutable platform metric must include:

- Platform and public URL.
- Capture timestamp in UTC.
- Metric name, value, unit, geography, and period.
- Collection method and collector ID.
- Archive reference or screenshot hash where permitted.
- Quality flag documenting unavailable, estimated, rounded, hidden, or deleted values.

Use platform-native metrics separately. YouTube views, Spotify chart ranks, TikTok creations, and Google Trends scores do not share a denominator and must not be added into a single raw total.

## 8. Age adjustment

Calculate exposure time as months between release and capture. Report:

- First 30-day or first-year values where historical records exist.
- Views or other cumulative counts per month since release as a sensitivity measure.
- Peak rank and chart duration separately from cumulative counts.
- Cohort comparisons among tracks with comparable exposure windows.

An old track's lifetime views are not directly comparable with a recent track's first month. Time remains annoyingly linear.

## 9. Rights and institutional data

For each track, seek:

- Master owner.
- Composition/publishing owner.
- Label, distributor, publisher, manager, brand, and programme relationships.
- Written versus verbal agreement.
- Public credits and metadata completeness.
- Known disputes or corrections, with allegation status and source.

Use `unknown`, not an inferred owner, when contracts and reliable credits are unavailable.

## 10. Economic data

Prefer participant-provided ranges and documentary evidence. Do not estimate artist income by multiplying public streams by a generic per-stream rate. For each economic observation, record whether it is:

- Exact and documented.
- Exact and self-reported.
- Range and self-reported.
- Publicly reported by an organization.
- Modelled estimate.
- Unknown.

Convert currencies only for explicit comparative purposes. Preserve nominal rupee values, exchange rate, inflation adjustment, and reference date.

## 11. Missing and deleted content

- Distinguish not observed, not available, not applicable, deleted, private, geo-blocked, and researcher access failure.
- Recheck deleted or unavailable items once through a different lawful public route.
- Do not replace deleted content with an unverified mirror without flagging provenance.
- Report missingness by year, platform, and artist type.

## 12. Quality control

1. Pilot 30 tracks from three years before full collection.
2. Run schema and allowed-value validation after every batch.
3. Double-enter 10 percent of factual metadata.
4. Double-code at least 25 percent of qualitative variables.
5. Freeze a dated analytical snapshot before modelling.
6. Keep corrections in an append-only change log.
7. Publish the sampling and exclusion log with sensitive details removed.
