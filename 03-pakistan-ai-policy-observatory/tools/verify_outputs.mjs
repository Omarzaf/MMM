#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const intermediate = path.join(root, "intermediate");
const outputDir = path.join(root, "outputs", "01a0653c-96d7-7c92-918b-3975d6716164");
const reportPath = path.join(
  outputDir,
  "Pakistan_AI_Policy_and_Digital_Infrastructure_Verified_15-Day_Monitoring_Report_2026-08-18_to_2026-09-03_UTC.docx",
);

const dataset = JSON.parse(readFileSync(path.join(intermediate, "research_dataset.json"), "utf8"));
const audit = JSON.parse(readFileSync(path.join(intermediate, "audit_summary.json"), "utf8"));
const reportSource = readFileSync(path.join(intermediate, "report_source.md"), "utf8");
const readme = readFileSync(path.join(root, "README.md"), "utf8");
const htmlPath = path.join(root, "index.html");
const aliasHtmlPath = path.join(root, "pakistan-ai-policy-observatory.html");
const html = readFileSync(htmlPath, "utf8");
const aliasHtml = readFileSync(aliasHtmlPath, "utf8");
const records = [...dataset.events, ...dataset.baselines];
const checks = [];

function check(name, condition, detail) {
  checks.push({ name, passed: Boolean(condition), detail });
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

const eventIds = records.map((record) => record.event_id);
const sourceIds = dataset.sources.map((source) => source.source_id);
const briefingIds = new Set(
  readFileSync(path.join(intermediate, "briefing_units.csv"), "utf8")
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => line.match(/^"?([^",]+)/)?.[1])
    .filter(Boolean),
);
const sourceIdSet = new Set(sourceIds);
const carryInBaselineCount = dataset.baselines.filter((record) => record.lifecycle === "BASELINE_CARRY_IN").length;
const disputedBaselineCount = dataset.baselines.filter((record) => record.lifecycle === "CONTRADICTED_OR_UNRESOLVED").length;

check("event count", dataset.events.length === 36, `${dataset.events.length} in-period/discovered records`);
check("baseline/context count", dataset.baselines.length === 16, `${dataset.baselines.length} total baselines/context records`);
check("baseline lifecycle breakdown", carryInBaselineCount === 13 && disputedBaselineCount === 3, `${carryInBaselineCount} carry-in + ${disputedBaselineCount} disputed`);
check("source count", dataset.sources.length === 111, `${dataset.sources.length} assessed sources`);
check("exclusion count", dataset.exclusions.length === 13, `${dataset.exclusions.length} material exclusions`);
check("watchlist count", dataset.watchlist.length === 14, `${dataset.watchlist.length} watchlist rows`);
check("unique event IDs", duplicates(eventIds).length === 0, duplicates(eventIds).join(", ") || "none duplicated");
check("unique source IDs", duplicates(sourceIds).length === 0, duplicates(sourceIds).join(", ") || "none duplicated");

const requiredFields = [
  "event_id",
  "normalized_event_title",
  "category",
  "institution",
  "geography",
  "event_date",
  "publication_date",
  "first_detected",
  "last_updated",
  "status_stage",
  "verified_facts",
  "significance",
  "confidence",
  "confidence_reason",
  "unresolved_issues",
  "inclusion_decision",
];
const missingRequired = [];
for (const record of records) {
  for (const field of requiredFields) {
    const value = record[field];
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
      missingRequired.push(`${record.event_id}:${field}`);
    }
  }
}
check("required event fields", missingRequired.length === 0, missingRequired.join(", ") || "all populated");

const malformedReferenceArrays = records
  .filter(
    (record) =>
      !Array.isArray(record.briefing_refs) ||
      !Array.isArray(record.primary_source_ids) ||
      !Array.isArray(record.corroborating_source_ids),
  )
  .map((record) => record.event_id);
const recordsWithoutExternalEvidence = records
  .filter((record) => [...(record.primary_source_ids ?? []), ...(record.corroborating_source_ids ?? [])].length === 0)
  .map((record) => record.event_id);
check(
  "reference-array schema",
  malformedReferenceArrays.length === 0,
  malformedReferenceArrays.join(", ") || "all reference fields are arrays",
);
check(
  "external evidence per record",
  recordsWithoutExternalEvidence.length === 0,
  recordsWithoutExternalEvidence.join(", ") || "every record has at least one assessed external source",
);

const badBriefingRefs = [];
const badSourceRefs = [];
for (const record of records) {
  for (const ref of record.briefing_refs ?? []) {
    if (!briefingIds.has(ref)) badBriefingRefs.push(`${record.event_id}:${ref}`);
  }
  for (const ref of [...(record.primary_source_ids ?? []), ...(record.corroborating_source_ids ?? [])]) {
    if (!sourceIdSet.has(ref)) badSourceRefs.push(`${record.event_id}:${ref}`);
  }
}
check("briefing references resolve", badBriefingRefs.length === 0, badBriefingRefs.join(", ") || "all resolve");
check("source references resolve", badSourceRefs.length === 0, badSourceRefs.join(", ") || "all resolve");

const sourceUrls = new Set(dataset.sources.map((source) => source.url));
const watchlistUrlsOutsideRegister = dataset.watchlist
  .filter((item) => item.source_url && !sourceUrls.has(item.source_url))
  .map((item) => item.watch_id);
const watchlistIdsMissingFromReport = dataset.watchlist
  .filter((item) => !reportSource.includes(item.watch_id))
  .map((item) => item.watch_id);
check(
  "watchlist URL provenance",
  watchlistUrlsOutsideRegister.length === 0,
  watchlistUrlsOutsideRegister.join(", ") || "every linked watch item resolves to the source register",
);
check(
  "watchlist report traceability",
  watchlistIdsMissingFromReport.length === 0,
  watchlistIdsMissingFromReport.join(", ") || "all stable watch IDs appear in the report",
);

const invalidNoBriefingRecords = records
  .filter(
    (record) =>
      record.briefing_refs.length === 0 &&
      (!record.first_detected.includes("verification") || !record.inclusion_decision.includes("verification")),
  )
  .map((record) => record.event_id);
const unsupportedPrimaryAbsence = records
  .filter(
    (record) =>
      record.primary_source_ids.length === 0 &&
      (record.corroborating_source_ids.length === 0 || record.confidence === "High"),
  )
  .map((record) => record.event_id);
const excludedRecords = records
  .filter((record) => record.lifecycle === "EXCLUDED_OUT_OF_SCOPE")
  .map((record) => record.event_id);
check(
  "verification-discovered provenance",
  invalidNoBriefingRecords.length === 0,
  invalidNoBriefingRecords.join(", ") || "records without briefing references are explicitly verification-discovered",
);
check(
  "primary-source absence bounded",
  unsupportedPrimaryAbsence.length === 0,
  unsupportedPrimaryAbsence.join(", ") || "empty primary arrays retain secondary evidence and non-High confidence",
);
check(
  "event/exclusion separation",
  excludedRecords.length === 0,
  excludedRecords.join(", ") || "no excluded lifecycle item is counted as an evidence record",
);

const invalidUrls = dataset.sources
  .filter((source) => {
    try {
      const parsed = new URL(source.url);
      return !["http:", "https:"].includes(parsed.protocol);
    } catch {
      return true;
    }
  })
  .map((source) => source.source_id);
check("source URL syntax", invalidUrls.length === 0, invalidUrls.join(", ") || "all valid HTTP(S) URLs");

const declares = (selector, property, value) => {
  const rule = new RegExp(`(?:^|[,}])\\s*${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\\{([^}]*)\\}`, "m");
  const found = html.match(rule);
  if (!found) return false;
  return new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*${value}`, "i").test(found[1]);
};

const countMatches = (text, expression) => [...text.matchAll(expression)].length;
const htmlCountsMatch = [
  ["event", dataset.events.length],
  ["baseline", dataset.baselines.length],
  ["record", records.length],
  ["source", dataset.sources.length],
  ["watch", dataset.watchlist.length],
  ["briefing", audit.briefing_units_observed],
].every(([name, count]) => html.includes(`data-${name}-count="${count}"`));
check("HTML audited counts", htmlCountsMatch, htmlCountsMatch ? "body metadata matches audited counts" : "one or more HTML count markers drifted");
check(
  "HTML rendered row counts",
  countMatches(html, /<article class="record" data-record/g) === records.length &&
    countMatches(html, /<tr data-source/g) === dataset.sources.length &&
    countMatches(html, /<article class="watch">/g) === dataset.watchlist.length,
  `${countMatches(html, /<article class="record" data-record/g)} records; ${countMatches(html, /<tr data-source/g)} sources; ${countMatches(html, /<article class="watch">/g)} watch items`,
);
const aliasRedirects =
  aliasHtml.length < 2048 &&
  /<link\s+rel="canonical"\s+href="index\.html">/.test(aliasHtml) &&
  /<meta\s+http-equiv="refresh"\s+content="0;\s*url=index\.html">/.test(aliasHtml) &&
  /<a href="index\.html">/.test(aliasHtml);
check(
  "HTML Pages entrypoint",
  aliasRedirects,
  aliasRedirects ? "index.html carries the report and the named path redirects to it" : "the named observatory path is not a working redirect to index.html",
);

const studentGuideIndex = html.indexOf('id="student-guide"');
const tldrIndex = html.indexOf('<div class="tldr">');
const frameIndex = html.indexOf('<div class="frame">');
const firstNumberedSectionIndex = html.indexOf('<section id="sec-1">');
const studentGuideStructure =
  tldrIndex > -1 &&
  frameIndex > -1 &&
  studentGuideIndex > tldrIndex &&
  firstNumberedSectionIndex > studentGuideIndex &&
  tldrIndex > frameIndex &&
  countMatches(html, /<article class="student-guide-card">/g) === 4 &&
  html.includes('<a class="start-link" href="#student-guide"><span class="mono sm">Start</span><span class="t">For students</span></a>');
check(
  "HTML student guide structure",
  studentGuideStructure,
  studentGuideStructure ? "student guide sits between the TL;DR and Section I inside the frame, and is linked from the contents rail" : "student guide placement, cards, or navigation entry drifted",
);

const studentResourcePaths = [
  "./README.md",
  "./intermediate/REPRODUCIBILITY.md",
  "./intermediate/research_dataset.json",
  "./intermediate/evidence_register.csv",
  "./intermediate/source_register.csv",
  "./intermediate/briefing_units.csv",
  "./intermediate/coverage_gaps.csv",
  "./intermediate/watchlist.csv",
  "./outputs/01a0653c-96d7-7c92-918b-3975d6716164/Pakistan_AI_Policy_Monitor_Evidence_Register_and_Coverage_Log_2026-08-18_to_2026-09-03.xlsx",
  "./LICENSE",
  "./tools/LICENSE",
  "./CITATION.cff",
];
const missingStudentLinks = studentResourcePaths.filter((href) => !html.includes(`href="${href}"`));
const missingStudentFiles = studentResourcePaths.filter((href) => {
  try {
    return !statSync(path.join(root, href.slice(2))).isFile();
  } catch {
    return true;
  }
});
check(
  "HTML student resource links",
  missingStudentLinks.length === 0 && missingStudentFiles.length === 0 && html.includes('href="https://github.com/Omarzaf/PDP-2026"'),
  [...missingStudentLinks.map((href) => `missing link ${href}`), ...missingStudentFiles.map((href) => `missing file ${href}`)].join(", ") || "all student data, method, repository, citation, and license links resolve locally",
);

const studentGuideResponsive =
  declares(".student-guide-grid", "grid-template-columns", "repeat\\(2,minmax\\(0,1fr\\)\\)") &&
  declares(".student-guide-card", "min-width", "0") &&
  /\.student-guide-grid\{grid-template-columns:minmax\(0,1fr\)\}/.test(html);
check(
  "HTML student guide mobile guards",
  studentGuideResponsive,
  studentGuideResponsive ? "student cards can shrink and collapse to one column" : "student guide responsive guards missing",
);

const readmeStudentGuide =
  readme.includes("## For students") &&
  readme.includes("### Repository map") &&
  readme.includes("### Data access") &&
  ["intermediate/research_dataset.json", "intermediate/evidence_register.csv", "intermediate/source_register.csv", "LICENSE", "tools/LICENSE", "CITATION.cff"].every((marker) => readme.includes(marker));
check(
  "README student guide",
  readmeStudentGuide,
  readmeStudentGuide ? "student workflow, repository map, data access, citation, and split licensing are documented" : "one or more student-facing README markers are missing",
);

const allowedRemoteAssets = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
const externalRuntimeDependencies = [
  ...[...html.matchAll(/<script\b[^>]*\bsrc=/gi)].map((match) => match[0]),
  ...[...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["']/gi)].map((match) => match[0]),
  ...[...html.matchAll(/url\(\s*["']?(https?:[^"')]+)/gi)]
    .filter((match) => !allowedRemoteAssets.test(match[1]))
    .map((match) => match[0]),
];
const blankTargets = [...html.matchAll(/<a\b[^>]*\btarget="_blank"[^>]*>/gi)].map((match) => match[0]);
const unsafeBlankTargets = blankTargets.filter((tag) => !/\brel="[^"]*\bnoopener\b[^"]*"/i.test(tag));
const htmlAccessibility =
  html.includes('<html lang="en"') &&
  html.includes('<a class="skip" href="#main">') &&
  html.includes('<main id="main" tabindex="-1">') &&
  /<button[^>]*\bclass="theme-toggle"[^>]*>/.test(html) &&
  /<button[^>]*\baria-label="Toggle dark mode"[^>]*>/.test(html) &&
  /<button[^>]*\baria-pressed="false"[^>]*>/.test(html) &&
  !/href=""/.test(html) &&
  unsafeBlankTargets.length === 0 &&
  [...html.matchAll(/<thead>([\s\S]*?)<\/thead>/g)].every((thead) => {
    const cells = [...thead[1].matchAll(/<th\b[^>]*>/g)].map((cell) => cell[0]);
    return cells.length > 0 && cells.every((cell) => /\bscope="col"/.test(cell));
  }) &&
  countMatches(html, /<thead>/g) >= 2;
check("HTML self-contained runtime", externalRuntimeDependencies.length === 0, externalRuntimeDependencies.length ? `${externalRuntimeDependencies.length} external runtime references` : "no external scripts, stylesheets, or CSS assets beyond the Google Fonts face, which degrades to the declared local stack");
check("HTML structural accessibility", htmlAccessibility, htmlAccessibility ? "language, skip target, theme state, links, and table headers pass" : "one or more structural accessibility assertions failed");
const mobileOverflowGuards =
  declares("html,body", "overflow-x", "(clip|hidden)") &&
  declares(".sources-wrap", "overflow-x", "auto") &&
  declares(".sources-wrap", "min-width", "0") &&
  declares(".figure-block svg", "max-width", "100%") &&
  /\.watch-grid\{grid-template-columns:minmax\(0,1fr\)\}/.test(html) &&
  /\.record\{grid-template-columns:minmax\(0,1fr\)\}/.test(html);
check(
  "HTML mobile overflow guards",
  mobileOverflowGuards,
  mobileOverflowGuards ? "figures, tables, ledger rows and watchlist can shrink within a 390px viewport" : "one or more mobile overflow guards are missing",
);

const s052 = dataset.sources.find((source) => source.source_id === "S052");
const s067 = dataset.sources.find((source) => source.source_id === "S067");
check(
  "S052 canonical source",
  s052?.url === "https://www.radio.gov.pk/24-07-2026/pm-field-marshal-inaugurate-sky47-karakorum-01-data-centre" && html.includes(`href="${s052.url}"`),
  s052?.url ?? "source missing",
);
check(
  "S067 availability disclosure",
  Boolean(s067?.availability?.includes("404 on 2026-09-03 audit")) && html.includes(s067.availability),
  s067?.availability ?? "source missing",
);

const invalidConfidence = records
  .filter((record) => !["High", "Medium", "Low"].includes(record.confidence))
  .map((record) => record.event_id);
check("confidence vocabulary", invalidConfidence.length === 0, invalidConfidence.join(", ") || "High/Medium/Low only");

const whoEvent = records.find((record) => record.event_id === "EVT-PROC-20260828-WHO-BALOCHISTAN-GIS");
const whoSource = dataset.sources.find((source) => source.source_id === "S047");
const telecomWithdrawal = records.find((record) => record.event_id === "EVT-TEL-20260828-AMENDMENT-WITHDRAWN");
const whoConflictPreserved =
  whoEvent?.publication_date.includes("2026-08-24") &&
  whoEvent?.publication_date.includes("2026-08-28") &&
  whoEvent?.source_claims.includes("24 August in B006 versus 28 August") &&
  whoSource?.publication_date.includes("2026-08-24") &&
  whoSource?.publication_date.includes("2026-08-28") &&
  whoSource?.limitations.includes("Published 24 Aug 2026") &&
  whoSource?.limitations.includes("Published 28-Aug-2026") &&
  reportSource.includes("WHO publication is 24 August in B006 but 28 August on the current mutable page");
check("WHO mutable-date conflict", whoConflictPreserved, whoConflictPreserved ? "24-Aug capture and 28-Aug current display preserved" : "date conflict missing from event, source, or report");
check(
  "telecom withdrawal publication date",
  telecomWithdrawal?.publication_date === "2026-08-28",
  telecomWithdrawal?.publication_date ?? "record missing",
);

const reportEventCounts = new Map();
for (const match of reportSource.matchAll(/^### ([A-Z0-9-]+) ·/gm)) {
  reportEventCounts.set(match[1], (reportEventCounts.get(match[1]) ?? 0) + 1);
}
const missingReportEvents = eventIds.filter((id) => reportEventCounts.get(id) !== 1);
const extraReportEvents = [...reportEventCounts.keys()].filter((id) => !eventIds.includes(id));
check(
  "report event assignment",
  missingReportEvents.length === 0 && extraReportEvents.length === 0,
  `missing/duplicate: ${missingReportEvents.join(", ") || "none"}; extra: ${extraReportEvents.join(", ") || "none"}`,
);

const requiredHeadings = [
  "1. Executive summary",
  "2. Scope and research questions",
  "3. Dataset and coverage audit",
  "4. Methodology",
  "5. Key findings",
  "6. AI policy, regulation, and public-sector adoption",
  "7. Data protection, digital regulation, and cybersecurity",
  "8. Google in Pakistan",
  "9. AI and digital infrastructure",
  "10. Programs, funding, investment, and workforce",
  "11. Provincial and local developments",
  "12. Cross-cutting analysis and implications",
  "13. Unverified, disputed, or insufficiently supported claims",
  "14. Gaps and limitations",
  "15. Watchlist",
  "16. Conclusion",
  "17. Sources",
  "Appendix A. Methodology and audit detail",
];
const missingHeadings = requiredHeadings.filter((heading) => !reportSource.includes(`# ${heading}`));
check("required report sections", missingHeadings.length === 0, missingHeadings.join(", ") || "all 17 sections plus appendix present");

const placeholderPatterns = [/\[WEAK\]/i, /\bTODO\b/i, /\bTBD\b/i, /\[INSERT [^\]]+\]/i];
const placeholders = placeholderPatterns.filter((pattern) => pattern.test(reportSource)).map(String);
check("no drafting placeholders", placeholders.length === 0, placeholders.join(", ") || "none found");

check("top-level source-file census", audit.top_level_files === 13, `${audit.top_level_files} files`);
check("non-briefing source files", audit.non_briefing_files === 1, `${audit.non_briefing_files} excluded file`);
check(
  "expected nominal briefings",
  audit.nominal_expected_briefings_for_exactly_15_days_at_15_minute_cadence === 1440,
  String(audit.nominal_expected_briefings_for_exactly_15_days_at_15_minute_cadence),
);
check("observed briefing units", audit.briefing_units_observed === 14, String(audit.briefing_units_observed));
check("nominal missing briefings", audit.nominal_missing_briefings === 1426, String(audit.nominal_missing_briefings));

execFileSync("unzip", ["-t", reportPath], { stdio: "pipe" });
const reportCoreXml = execFileSync("unzip", ["-p", reportPath, "docProps/core.xml"], {
  encoding: "utf8",
});
const reportDocumentXml = execFileSync("unzip", ["-p", reportPath, "word/document.xml"], {
  encoding: "utf8",
});
const reportRelationshipsXml = execFileSync(
  "unzip",
  ["-p", reportPath, "word/_rels/document.xml.rels"],
  { encoding: "utf8" },
);
const reportStat = statSync(reportPath);
check("DOCX package integrity", reportStat.size > 0, `${reportStat.size} bytes; unzip test passed`);
check(
  "DOCX authorship metadata",
  reportCoreXml.includes("<dc:creator>Muhammad Umar Zafar</dc:creator>") &&
    reportCoreXml.includes("<cp:lastModifiedBy>Muhammad Umar Zafar</cp:lastModifiedBy>"),
  "creator and lastModifiedBy identify Muhammad Umar Zafar",
);
check(
  "DOCX repaired-source disclosure",
  Boolean(s052?.url) && reportRelationshipsXml.includes(s052.url) &&
    Boolean(s067?.availability) && reportDocumentXml.includes(s067.availability),
  "S052 uses the canonical URL and S067 carries its archive-only availability note",
);

const reportHash = createHash("sha256").update(readFileSync(reportPath)).digest("hex");
const failed = checks.filter((entry) => !entry.passed);
const summary = {
  verified_snapshot_cutoff_utc: dataset.report.search_cutoff_utc,
  report_path: path.relative(root, reportPath).split(path.sep).join("/"),
  report_sha256: reportHash,
  passed: failed.length === 0,
  checks,
};
writeFileSync(path.join(intermediate, "verification_summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

for (const entry of checks) {
  console.log(`${entry.passed ? "PASS" : "FAIL"} ${entry.name}: ${entry.detail}`);
}
if (failed.length > 0) process.exitCode = 1;
