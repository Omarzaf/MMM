import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const extractedDir = join(root, "intermediate", "extracted");
const unitsDir = join(root, "intermediate", "briefings");

const sources = [
  ["B001", "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-18_bundle.md", 0],
  ["B002", "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-18_bundle.md", 1],
  ["B003", "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-18_bundle.md", 2],
  ["B004", "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-22.md", null],
  ["B005", "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-23_2010PKT.md", null],
  ["B006", "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-25_0025PKT.md", null],
  ["B007", "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-26_0710PKT.md", null],
  ["B008", "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-27_1906PKT.md", null],
  ["B009", "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-28_1952PKT.md", null],
  ["B010", "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-29_1938PKT.md", null],
  ["B011", "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-30_1957PKT.md", null],
  ["B012", "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-08-31_1049ET.md", null],
  ["B013", "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-09-01_1249ET.md", null],
  ["B014", "Pakistan_AI_Policy_Infrastructure_Daily_Brief_2026-09-02_2219ET.md", null],
];

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return `${headers.map(csvEscape).join(",")}\n${rows
    .map((row) => headers.map((header) => csvEscape(row[header])).join(","))
    .join("\n")}\n`;
}

function splitBundle(text) {
  const parts = text.split(/^# Tab [23]\s*$/m);
  if (parts.length !== 3) {
    throw new Error(`Expected three tabs in Markdown bundle; found ${parts.length}`);
  }
  return parts;
}

function normalizeText(text) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll(/https?:\/\/\S+/g, " ")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function shingles(text, width = 5) {
  const words = normalizeText(text).split(/\s+/).filter(Boolean);
  const result = new Set();
  for (let index = 0; index <= words.length - width; index += 1) {
    result.add(words.slice(index, index + width).join(" "));
  }
  return result;
}

function jaccard(left, right) {
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

function extractUrls(text) {
  const markdownUrls = [...text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => match[1]);
  const bareUrls = [...text.matchAll(/(?<!\()https?:\/\/[^\s<>)\]]+/g)].map((match) => match[0]);
  return [...new Set([...markdownUrls, ...bareUrls].map((url) => url.replace(/[.,;:]+$/, "")))];
}

async function main() {
  await mkdir(unitsDir, { recursive: true });
  const bundleText = await readFile(join(extractedDir, sources[0][1]), "utf8");
  const bundleParts = splitBundle(bundleText);
  const units = [];
  const urlRows = [];

  for (const [briefingId, sourceName, bundleIndex] of sources) {
    const text = bundleIndex === null
      ? await readFile(join(extractedDir, sourceName), "utf8")
      : bundleParts[bundleIndex];
    const normalized = normalizeText(text);
    const urls = extractUrls(text);
    const headingCount = (text.match(/^#{1,6}\s+/gm) ?? []).length;
    const lineCount = text.split(/\r?\n/).length;
    const wordCount = normalized ? normalized.split(/\s+/).length : 0;
    const outputName = `${briefingId}.md`;
    await writeFile(join(unitsDir, outputName), text.trim() + "\n");
    units.push({
      briefing_id: briefingId,
      extracted_source_file: sourceName,
      bundle_part: bundleIndex === null ? "whole document" : `part ${bundleIndex + 1}`,
      normalized_file: `intermediate/briefings/${outputName}`,
      line_count: lineCount,
      word_count: wordCount,
      heading_count: headingCount,
      unique_url_count: urls.length,
      normalized_sha256: createHash("sha256").update(normalized).digest("hex"),
      source_basename: basename(sourceName),
    });
    for (const url of urls) {
      urlRows.push({ briefing_id: briefingId, source_file: sourceName, url });
    }
  }

  const similarityRows = [];
  const shingleSets = new Map();
  for (const unit of units) {
    const text = await readFile(join(root, unit.normalized_file), "utf8");
    shingleSets.set(unit.briefing_id, shingles(text));
  }
  for (let leftIndex = 0; leftIndex < units.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < units.length; rightIndex += 1) {
      const left = units[leftIndex].briefing_id;
      const right = units[rightIndex].briefing_id;
      similarityRows.push({
        briefing_a: left,
        briefing_b: right,
        five_word_shingle_jaccard: Number(jaccard(shingleSets.get(left), shingleSets.get(right)).toFixed(4)),
        exact_normalized_duplicate: units[leftIndex].normalized_sha256 === units[rightIndex].normalized_sha256 ? "yes" : "no",
      });
    }
  }

  similarityRows.sort((a, b) => b.five_word_shingle_jaccard - a.five_word_shingle_jaccard);
  await writeFile(join(root, "intermediate", "briefing_index.csv"), toCsv(units));
  await writeFile(join(root, "intermediate", "source_url_index.csv"), toCsv(urlRows));
  await writeFile(join(root, "intermediate", "unit_similarity.csv"), toCsv(similarityRows));
  console.log(`Prepared ${units.length} briefing units and ${urlRows.length} unique briefing-URL references.`);
  console.log(`Highest cross-unit shingle similarity: ${similarityRows[0].briefing_a}/${similarityRows[0].briefing_b} = ${similarityRows[0].five_word_shingle_jaccard}`);
}

await main();
