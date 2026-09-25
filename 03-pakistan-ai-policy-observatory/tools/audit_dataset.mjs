import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const intermediateDir = join(root, "intermediate");
// This audit describes the frozen research snapshot, so its timestamp is the documented cutoff.
const auditCutoffUtc = "2026-09-03T04:15:00Z";

const briefingUnits = [
  {
    briefing_id: "B001",
    source_file: "Pakistan AI Policy & Infrastructure Daily Brief — August 18, 2026.md",
    source_subunit: "Tab 1",
    nominal_date: "2026-08-18",
    window_start_utc: "2026-08-18T19:24:00Z",
    window_end_utc: "2026-08-18T19:38:00Z",
    window_start_pkt: "2026-08-19T00:24:00+05:00",
    window_end_pkt: "2026-08-19T00:38:00+05:00",
    timestamp_basis: "explicit previous and research cutoffs",
    timing_issues: "Title date is UTC date; normalized PKT date is 2026-08-19.",
  },
  {
    briefing_id: "B002",
    source_file: "Pakistan AI Policy & Infrastructure Daily Brief — August 18, 2026.md",
    source_subunit: "Tab 2",
    nominal_date: "2026-08-20",
    window_start_utc: "2026-08-20T14:36:50Z",
    window_end_utc: "2026-08-20T14:50:39Z",
    window_start_pkt: "2026-08-20T19:36:50+05:00",
    window_end_pkt: "2026-08-20T19:50:39+05:00",
    timestamp_basis: "explicit PKT coverage window",
    timing_issues: "None identified.",
  },
  {
    briefing_id: "B003",
    source_file: "Pakistan AI Policy & Infrastructure Daily Brief — August 18, 2026.md",
    source_subunit: "Tab 3",
    nominal_date: "2026-08-21",
    window_start_utc: "2026-08-21T14:56:00Z",
    window_end_utc: "2026-08-21T15:05:00Z",
    window_start_pkt: "2026-08-21T19:56:00+05:00",
    window_end_pkt: "2026-08-21T20:05:00+05:00",
    timestamp_basis: "explicit approximate UTC and PKT window",
    timing_issues: "Window is explicitly approximate.",
  },
  {
    briefing_id: "B004",
    source_file: "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-22.docx",
    source_subunit: "whole document",
    nominal_date: "2026-08-22",
    window_start_utc: "2026-08-22T14:52:00Z",
    window_end_utc: "2026-08-22T15:05:00Z",
    window_start_pkt: "2026-08-22T19:52:00+05:00",
    window_end_pkt: "2026-08-22T20:05:00+05:00",
    timestamp_basis: "explicit approximate PKT window and UTC completion",
    timing_issues: "Window start is approximate.",
  },
  {
    briefing_id: "B005",
    source_file: "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-23_2010PKT.docx",
    source_subunit: "whole document",
    nominal_date: "2026-08-23",
    window_start_utc: "2026-08-23T14:58:00Z",
    window_end_utc: "2026-08-23T15:10:00Z",
    window_start_pkt: "2026-08-23T19:58:00+05:00",
    window_end_pkt: "2026-08-23T20:10:00+05:00",
    timestamp_basis: "explicit previous cutoff plus stated 12-minute window and filename end time",
    timing_issues: "End time is reconstructed from stated duration and filename.",
  },
  {
    briefing_id: "B006",
    source_file: "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-25_0025PKT.docx",
    source_subunit: "whole document",
    nominal_date: "2026-08-25",
    window_start_utc: "2026-08-24T19:10:00Z",
    window_end_utc: "2026-08-24T19:25:00Z",
    window_start_pkt: "2026-08-25T00:10:00+05:00",
    window_end_pkt: "2026-08-25T00:25:00+05:00",
    timestamp_basis: "explicit PKT comparison and research cutoffs",
    timing_issues: "UTC date is 2026-08-24 while nominal and PKT date are 2026-08-25.",
  },
  {
    briefing_id: "B007",
    source_file: "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-26_0710PKT.docx",
    source_subunit: "whole document",
    nominal_date: "2026-08-26",
    window_start_utc: "2026-08-26T01:38:00Z",
    window_end_utc: "2026-08-26T02:10:00Z",
    window_start_pkt: "2026-08-26T06:38:00+05:00",
    window_end_pkt: "2026-08-26T07:10:00+05:00",
    timestamp_basis: "explicit PKT research window",
    timing_issues: "32-minute interval materially exceeds the stated approximate 15-minute cadence.",
  },
  {
    briefing_id: "B008",
    source_file: "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-27_1906PKT.docx",
    source_subunit: "whole document",
    nominal_date: "2026-08-27",
    window_start_utc: "2026-08-27T13:52:00Z",
    window_end_utc: "2026-08-27T14:06:00Z",
    window_start_pkt: "2026-08-27T18:52:00+05:00",
    window_end_pkt: "2026-08-27T19:06:00+05:00",
    timestamp_basis: "explicit approximate PKT coverage window",
    timing_issues: "Window end is approximate.",
  },
  {
    briefing_id: "B009",
    source_file: "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-28_1952PKT.docx",
    source_subunit: "whole document",
    nominal_date: "2026-08-28",
    window_start_utc: "2026-08-28T14:37:00Z",
    window_end_utc: "2026-08-28T14:52:00Z",
    window_start_pkt: "2026-08-28T19:37:00+05:00",
    window_end_pkt: "2026-08-28T19:52:00+05:00",
    timestamp_basis: "explicit approximate UTC and PKT cutoffs",
    timing_issues: "Window end is approximate.",
  },
  {
    briefing_id: "B010",
    source_file: "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-29_1938PKT.docx",
    source_subunit: "whole document",
    nominal_date: "2026-08-29",
    window_start_utc: "2026-08-29T14:24:00Z",
    window_end_utc: "2026-08-29T14:38:00Z",
    window_start_pkt: "2026-08-29T19:24:00+05:00",
    window_end_pkt: "2026-08-29T19:38:00+05:00",
    timestamp_basis: "explicit PKT cutoffs",
    timing_issues: "Research cutoff is approximate in method text.",
  },
  {
    briefing_id: "B011",
    source_file: "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-30_1957PKT.docx",
    source_subunit: "whole document",
    nominal_date: "2026-08-30",
    window_start_utc: "2026-08-30T14:38:00Z",
    window_end_utc: "2026-08-30T14:57:00Z",
    window_start_pkt: "2026-08-30T19:38:00+05:00",
    window_end_pkt: "2026-08-30T19:57:00+05:00",
    timestamp_basis: "explicit approximate PKT and UTC cutoffs",
    timing_issues: "19-minute interval exceeds the nominal cadence.",
  },
  {
    briefing_id: "B012",
    source_file: "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-31_1049ET.docx",
    source_subunit: "whole document",
    nominal_date: "2026-08-31",
    window_start_utc: "2026-08-31T14:36:00Z",
    window_end_utc: "2026-08-31T14:55:00Z",
    window_start_pkt: "2026-08-31T19:36:00+05:00",
    window_end_pkt: "2026-08-31T19:55:00+05:00",
    timestamp_basis: "explicit approximate UTC and PKT research window",
    timing_issues: "Filename says 1049ET, which converts to 14:49 UTC during EDT and falls inside, not at the end of, the stated window; ET is also DST-ambiguous.",
  },
  {
    briefing_id: "B013",
    source_file: "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-09-01_1249ET.docx",
    source_subunit: "whole document",
    nominal_date: "2026-09-01",
    window_start_utc: "2026-09-01T16:40:00Z",
    window_end_utc: "2026-09-01T16:51:00Z",
    window_start_pkt: "2026-09-01T21:40:00+05:00",
    window_end_pkt: "2026-09-01T21:51:00+05:00",
    timestamp_basis: "explicit UTC/PKT research cutoff in DOCX header and previous cutoff",
    timing_issues: "Filename says 1249ET (16:49 UTC during EDT), two minutes before the explicit 16:51 UTC research cutoff; ET is DST-ambiguous.",
  },
  {
    briefing_id: "B014",
    source_file: "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-09-02_2219ET.docx",
    source_subunit: "whole document",
    nominal_date: "2026-09-02",
    window_start_utc: "2026-09-03T02:06:00Z",
    window_end_utc: "2026-09-03T02:21:00Z",
    window_start_pkt: "2026-09-03T07:06:00+05:00",
    window_end_pkt: "2026-09-03T07:21:00+05:00",
    timestamp_basis: "explicit UTC and PKT research window; body identifies scheduled run as 22:19 EDT",
    timing_issues: "Filename nominal date is EDT; normalized UTC and PKT dates are 2026-09-03. Filename minute is scheduled time, two minutes before research cutoff.",
  },
];

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return `${headers.map(csvEscape).join(",")}\n${rows
    .map((row) => headers.map((header) => csvEscape(row[header])).join(","))
    .join("\n")}\n`;
}

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

function extractCoreValue(xml, localName) {
  const expression = new RegExp(
    `<(?:(?:\\w+):)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:\\w+):)?${localName}>`,
    "i",
  );
  return xml.match(expression)?.[1]?.replaceAll("&amp;", "&").trim() ?? "";
}

async function inspectSourceFile(name) {
  const absolutePath = join(root, name);
  const extension = extname(name).toLowerCase();
  const stats = await stat(absolutePath);
  const buffer = await readFile(absolutePath);
  const fileResult = run("file", ["-b", absolutePath]);
  let readable = "yes";
  let containerStatus = "not applicable";
  let internalTitle = "";
  let internalCreator = "";
  let internalCreated = "";
  let internalModified = "";

  if (extension === ".docx") {
    const testResult = run("unzip", ["-t", absolutePath]);
    containerStatus = testResult.status === 0 ? "valid OOXML ZIP" : "malformed OOXML ZIP";
    readable = testResult.status === 0 ? "yes" : "no";
    if (testResult.status === 0) {
      const coreResult = run("unzip", ["-p", absolutePath, "docProps/core.xml"]);
      const core = coreResult.stdout;
      internalTitle = extractCoreValue(core, "title");
      internalCreator = extractCoreValue(core, "creator");
      internalCreated = extractCoreValue(core, "created");
      internalModified = extractCoreValue(core, "modified");
    }
  }

  const matchingUnits = briefingUnits.filter((unit) => unit.source_file === name);
  const isBriefing = matchingUnits.length > 0;
  const coverage = matchingUnits.length
    ? `${matchingUnits[0].window_start_utc} to ${matchingUnits.at(-1).window_end_utc}`
    : "";
  const notes = extension === ".html"
    ? "Readable standalone article about Pakistan's music economy; excluded for lack of an AI-policy/digital-infrastructure nexus."
    : extension === ".md"
      ? "Single Markdown download containing three labeled briefing tabs."
      : internalCreated === "2013-12-23T23:15:00Z"
        ? "OOXML core creation/modification timestamps are template defaults and not usable as briefing timestamps."
        : "";

  return {
    source_file: name,
    format: extension.slice(1),
    detected_type: fileResult.stdout.trim(),
    bytes: stats.size,
    filesystem_birthtime: stats.birthtime.toISOString(),
    filesystem_mtime: stats.mtime.toISOString(),
    sha256: createHash("sha256").update(buffer).digest("hex"),
    readable,
    container_status: containerStatus,
    internal_title: internalTitle,
    internal_creator: internalCreator,
    internal_created: internalCreated,
    internal_modified: internalModified,
    apparent_briefing_units: matchingUnits.length,
    apparent_coverage_utc: coverage,
    inclusion_decision: isBriefing ? "include as briefing evidence" : "exclude from briefing dataset",
    notes,
  };
}

function buildGapRows(units) {
  return units.slice(1).map((unit, index) => {
    const previous = units[index];
    const start = new Date(previous.window_end_utc);
    const end = new Date(unit.window_start_utc);
    const gapMinutes = (end - start) / 60000;
    return {
      from_briefing: previous.briefing_id,
      to_briefing: unit.briefing_id,
      gap_start_utc: previous.window_end_utc,
      gap_end_utc: unit.window_start_utc,
      gap_minutes: Number(gapMinutes.toFixed(2)),
      gap_hours: Number((gapMinutes / 60).toFixed(2)),
      approximate_missing_15m_runs: Math.round(gapMinutes / 15),
      material_gap: gapMinutes > 30 ? "yes" : "no",
    };
  });
}

async function main() {
  await mkdir(intermediateDir, { recursive: true });
  const topLevelNames = [
    ...new Set([
      ...briefingUnits.map((unit) => unit.source_file),
      "pakistan-music-economy-meaning-man_1.html",
    ]),
  ].sort((a, b) => a.localeCompare(b));
  const inventory = [];
  for (const name of topLevelNames) inventory.push(await inspectSourceFile(name));

  const sortedUnits = [...briefingUnits].sort(
    (a, b) => new Date(a.window_start_utc) - new Date(b.window_start_utc),
  );
  const gaps = buildGapRows(sortedUnits);
  const firstStart = new Date(sortedUnits[0].window_start_utc);
  const finalEnd = new Date(sortedUnits.at(-1).window_end_utc);
  const spanMinutes = (finalEnd - firstStart) / 60000;
  const observedWindowMinutes = sortedUnits.reduce(
    (total, unit) => total + (new Date(unit.window_end_utc) - new Date(unit.window_start_utc)) / 60000,
    0,
  );
  const expectedAcrossObservedSpan = Math.round(spanMinutes / 15);
  const nominalExpected = 15 * 24 * 4;
  const briefingFileCount = inventory.filter((row) => row.apparent_briefing_units > 0).length;
  const exactDuplicateGroups = Object.values(
    Object.groupBy(inventory, (row) => row.sha256),
  ).filter((rows) => rows.length > 1);

  const summary = {
    generated_at_utc: auditCutoffUtc,
    source_directory: ".",
    top_level_files: inventory.length,
    subdirectories_present_before_audit: 0,
    standalone_archives_found: 0,
    briefing_source_files: briefingFileCount,
    briefing_units_observed: sortedUnits.length,
    non_briefing_files: inventory.length - briefingFileCount,
    unreadable_source_files: inventory.filter((row) => row.readable !== "yes").length,
    exact_duplicate_file_groups: exactDuplicateGroups.length,
    nominal_expected_briefings_for_exactly_15_days_at_15_minute_cadence: nominalExpected,
    nominal_missing_briefings: nominalExpected - sortedUnits.length,
    observed_span_start_utc: sortedUnits[0].window_start_utc,
    observed_span_end_utc: sortedUnits.at(-1).window_end_utc,
    observed_span_minutes: spanMinutes,
    observed_strict_window_minutes: Number(observedWindowMinutes.toFixed(2)),
    observed_strict_window_share_of_span_percent: Number(
      ((observedWindowMinutes / spanMinutes) * 100).toFixed(2),
    ),
    approximate_expected_briefings_across_observed_span_at_15_minute_cadence: expectedAcrossObservedSpan,
    approximate_missing_briefings_across_observed_span: expectedAcrossObservedSpan - sortedUnits.length,
    observed_share_of_span_expected_percent: Number(
      ((sortedUnits.length / expectedAcrossObservedSpan) * 100).toFixed(2),
    ),
    all_interbrief_gaps_exceed_30_minutes: gaps.every((row) => row.material_gap === "yes"),
    nominal_title_dates_without_a_briefing: ["2026-08-19", "2026-08-24"],
    normalized_pkt_dates_without_a_window_between_first_and_last_pkt_date: ["2026-08-24", "2026-09-02"],
    timestamp_policy: "Use explicit internal UTC/PKT windows as authoritative; treat filename dates/times and filesystem timestamps as discovery metadata only; label reconstructed endpoints approximate.",
  };

  await writeFile(join(intermediateDir, "dataset_inventory.csv"), toCsv(inventory));
  await writeFile(join(intermediateDir, "briefing_units.csv"), toCsv(sortedUnits));
  await writeFile(join(intermediateDir, "coverage_gaps.csv"), toCsv(gaps));
  await writeFile(join(intermediateDir, "audit_summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  console.log(JSON.stringify(summary, null, 2));
}

await main();
