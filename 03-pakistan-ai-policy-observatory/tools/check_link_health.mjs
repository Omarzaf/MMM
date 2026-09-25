// SPDX-License-Identifier: MIT
import path from "node:path";
import {
  DEFAULT_POLICY_PATH,
  ROOT,
  loadPolicy,
  runLinkHealthCheck,
  writeReport,
} from "./link_health.mjs";

function parseArgs(argv) {
  const args = {
    policyPath: DEFAULT_POLICY_PATH,
    outputPath: null,
    timeoutMs: undefined,
    concurrency: undefined,
    maxRedirects: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--policy" && next) {
      args.policyPath = path.resolve(ROOT, next);
      index += 1;
    } else if (token === "--output" && next) {
      args.outputPath = next;
      index += 1;
    } else if (token === "--timeout-ms" && next) {
      args.timeoutMs = Number(next);
      index += 1;
    } else if (token === "--concurrency" && next) {
      args.concurrency = Number(next);
      index += 1;
    } else if (token === "--max-redirects" && next) {
      args.maxRedirects = Number(next);
      index += 1;
    } else if (token === "--help") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function printHelp() {
  console.log("Usage: node tools/check_link_health.mjs [--policy path] [--output path] [--timeout-ms N] [--concurrency N] [--max-redirects N]");
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const policy = await loadPolicy(args.policyPath);
const report = await runLinkHealthCheck({
  policy,
  timeoutMs: args.timeoutMs,
  concurrency: args.concurrency,
  maxRedirects: args.maxRedirects,
});

const outputPath = args.outputPath ?? policy.output_path;
const written = await writeReport(report, outputPath);

console.log(`Checked ${report.summary.source_count} sources.`);
console.log(`Healthy: ${report.summary.healthy}`);
console.log(`Allowlisted WAF: ${report.summary.allowlisted_waf}`);
console.log(`Hard broken: ${report.summary.hard_broken}`);
console.log(`HTTP error: ${report.summary.http_error}`);
console.log(`Transient/network: ${report.summary.transient_network}`);
console.log(`Report: ${path.relative(ROOT, written)}`);

if (report.summary.hard_broken > 0 || report.summary.http_error > 0) {
  process.exitCode = 1;
}
