// SPDX-License-Identifier: MIT
import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyOutcome,
  isPublicIpAddress,
  probeUrl,
  runLinkHealthCheck,
  validateHttpUrl,
  validateResolvedTarget,
  validatePolicy,
} from "./link_health.mjs";

function createPolicy() {
  return validatePolicy({
    version: 1,
    dataset_path: "intermediate/research_dataset.json",
    default_timeout_ms: 10000,
    default_concurrency: 4,
    max_redirects: 5,
    output_path: "tmp/link-health/latest.json",
    waf_allowlist: [
      {
        host: "www.dawn.com",
        statuses: [403, 406, 429],
        rationale: "Expected WAF behavior for automated probes.",
      },
    ],
  });
}

test("validatePolicy rejects duplicate hosts and missing rationale", () => {
  assert.throws(
    () =>
      validatePolicy({
        waf_allowlist: [
          { host: "www.dawn.com", statuses: [403], rationale: "one" },
          { host: "www.dawn.com", statuses: [429], rationale: "two" },
        ],
      }),
    /Duplicate allowlist host/,
  );

  assert.throws(
    () =>
      validatePolicy({
        waf_allowlist: [{ host: "www.dawn.com", statuses: [403], rationale: "" }],
      }),
    /must include rationale/,
  );

  assert.throws(
    () => validatePolicy({ waf_allowlist: [], default_concurrency: 0 }),
    /default_concurrency must be a positive integer/,
  );
});

test("classifyOutcome keeps 404 and 410 hard-broken even for allowlisted hosts", () => {
  const policy = createPolicy();
  const hard404 = classifyOutcome({
    status: 404,
    finalUrl: "https://www.dawn.com/story",
    errorCode: null,
    allowlist: policy.wafAllowlist,
  });
  const hard410 = classifyOutcome({
    status: 410,
    finalUrl: "https://www.dawn.com/story",
    errorCode: null,
    allowlist: policy.wafAllowlist,
  });

  assert.equal(hard404.category, "hard-broken");
  assert.equal(hard410.category, "hard-broken");
});

test("classifyOutcome marks expected WAF statuses separately from other HTTP failures", () => {
  const policy = createPolicy();
  const waf = classifyOutcome({
    status: 403,
    finalUrl: "https://www.dawn.com/story",
    errorCode: null,
    allowlist: policy.wafAllowlist,
  });
  const unexpected = classifyOutcome({
    status: 403,
    finalUrl: "https://example.com/story",
    errorCode: null,
    allowlist: policy.wafAllowlist,
  });
  const redirectLoop = classifyOutcome({
    status: 302,
    finalUrl: "https://example.com/loop",
    errorCode: "ERR_TOO_MANY_REDIRECTS",
    allowlist: policy.wafAllowlist,
  });

  assert.equal(waf.category, "allowlisted-waf");
  assert.equal(unexpected.category, "http-error");
  assert.equal(redirectLoop.category, "http-error");
  assert.equal(redirectLoop.ok, false);
});

test("validateHttpUrl rejects malformed, credential-bearing, and local targets", () => {
  assert.equal(validateHttpUrl("not a URL").ok, false);
  assert.equal(validateHttpUrl("file:///tmp/source").ok, false);
  assert.equal(validateHttpUrl("https://user:secret@example.com/source").ok, false);
  assert.equal(validateHttpUrl("http://127.0.0.1/source").ok, false);
  assert.equal(validateHttpUrl("http://169.254.169.254/latest/meta-data").ok, false);
  assert.equal(validateHttpUrl("https://example.com/source").ok, true);
  assert.equal(isPublicIpAddress("8.8.8.8"), true);
  assert.equal(isPublicIpAddress("10.0.0.1"), false);
  assert.equal(isPublicIpAddress("::1"), false);
});

test("validateResolvedTarget rejects hostnames that resolve to local addresses", async () => {
  const local = await validateResolvedTarget(
    "https://public-looking.example/source",
    async () => [{ address: "10.0.0.7", family: 4 }],
  );
  const publicTarget = await validateResolvedTarget(
    "https://public-looking.example/source",
    async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ],
  );

  assert.equal(local.ok, false);
  assert.match(local.reason, /disallowed local address/);
  assert.equal(publicTarget.ok, true);
});

/** Resolver stub: every test hostname answers with a public address. */
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("runLinkHealthCheck follows redirects and summarizes categories deterministically", async () => {
  const policy = createPolicy();
  const dataset = {
    sources: [
      { source_id: "S001", url: "https://healthy.example/one", publisher: "A", document_title: "One" },
      { source_id: "S002", url: "https://redirect.example/two", publisher: "B", document_title: "Two" },
      { source_id: "S003", url: "https://www.dawn.com/waf", publisher: "C", document_title: "Three" },
      { source_id: "S004", url: "https://broken.example/four", publisher: "D", document_title: "Four" },
      { source_id: "S005", url: "https://timeout.example/five", publisher: "E", document_title: "Five" },
    ],
  };

  const fetchImpl = async (url) => {
    if (url === "https://healthy.example/one") {
      return new Response("ok", { status: 200 });
    }
    if (url === "https://redirect.example/two") {
      return new Response(null, {
        status: 302,
        headers: { location: "https://healthy.example/two-final" },
      });
    }
    if (url === "https://healthy.example/two-final") {
      return new Response("ok", { status: 200 });
    }
    if (url === "https://www.dawn.com/waf") {
      return new Response("blocked", { status: 403 });
    }
    if (url === "https://broken.example/four") {
      return new Response("gone", { status: 404 });
    }
    if (url === "https://timeout.example/five") {
      const error = new Error("timed out");
      error.code = "ETIMEDOUT";
      throw error;
    }
    throw new Error(`Unexpected URL in test: ${url}`);
  };

  const report = await runLinkHealthCheck({
    policy,
    dataset,
    fetchImpl,
    lookupImpl: publicLookup,
    checkedAtUtc: "2026-09-03T00:00:00.000Z",
    concurrency: 2,
  });

  assert.deepEqual(report.summary, {
    checked_at_utc: "2026-09-03T00:00:00.000Z",
    source_count: 5,
    healthy: 2,
    allowlisted_waf: 1,
    hard_broken: 1,
    http_error: 0,
    transient_network: 1,
  });

  const byId = new Map(report.results.map((item) => [item.source_id, item]));
  assert.equal(byId.get("S002").final_url, "https://healthy.example/two-final");
  assert.equal(byId.get("S002").redirects, 1);
  assert.equal(byId.get("S003").category, "allowlisted-waf");
  assert.equal(byId.get("S004").category, "hard-broken");
  assert.equal(byId.get("S005").category, "transient-network");
});

test("runLinkHealthCheck records malformed URLs and unsafe redirects without fetching them", async () => {
  const policy = createPolicy();
  const requested = [];
  const dataset = {
    sources: [
      { source_id: "S001", url: "not a URL", publisher: "A", document_title: "Malformed" },
      { source_id: "S002", url: "https://redirect.example/private", publisher: "B", document_title: "Redirect" },
    ],
  };
  const fetchImpl = async (url) => {
    requested.push(url);
    return new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
    });
  };

  const report = await runLinkHealthCheck({
    policy,
    dataset,
    fetchImpl,
    lookupImpl: publicLookup,
    checkedAtUtc: "2026-09-03T00:00:00.000Z",
  });

  assert.deepEqual(requested, ["https://redirect.example/private"]);
  assert.equal(report.summary.http_error, 2);
  assert.equal(report.results[0].error_code, "ERR_INVALID_URL");
  assert.equal(report.results[1].error_code, "ERR_UNSAFE_URL");
});

test("probeUrl rejects a hostname that resolves to a private address, before fetching", async () => {
  const requested = [];
  const probe = await probeUrl("https://rebind.example/resource", {
    fetchImpl: async (url) => {
      requested.push(url);
      return new Response("ok", { status: 200 });
    },
    lookupImpl: async () => [{ address: "169.254.169.254", family: 4 }],
  });

  assert.deepEqual(requested, []);
  assert.equal(probe.errorCode, "ERR_UNSAFE_URL");
  assert.match(probe.errorMessage, /disallowed local address: 169\.254\.169\.254/);
});

test("probeUrl re-validates resolution on every redirect hop", async () => {
  const resolved = [];
  const probe = await probeUrl("https://start.example/one", {
    fetchImpl: async (url) => {
      if (url === "https://start.example/one") {
        return new Response(null, { status: 302, headers: { location: "https://internal.example/two" } });
      }
      throw new Error(`Unexpected fetch after an unsafe hop: ${url}`);
    },
    lookupImpl: async (hostname) => {
      resolved.push(hostname);
      return hostname === "internal.example"
        ? [{ address: "10.0.0.5", family: 4 }]
        : [{ address: "93.184.216.34", family: 4 }];
    },
  });

  assert.deepEqual(resolved, ["start.example", "internal.example"]);
  assert.equal(probe.errorCode, "ERR_UNSAFE_URL");
  assert.equal(probe.redirects, 1);
});

test("probeUrl surfaces resolver failures instead of falling through to a fetch", async () => {
  const requested = [];
  const probe = await probeUrl("https://nxdomain.example/resource", {
    fetchImpl: async (url) => {
      requested.push(url);
      return new Response("ok", { status: 200 });
    },
    lookupImpl: async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    },
  });

  assert.deepEqual(requested, []);
  assert.equal(probe.errorCode, "ENOTFOUND");
});

test("injecting a fetch does not disable the DNS guard", async () => {
  const probe = await probeUrl("https://looks-fine.example/resource", {
    fetchImpl: async () => new Response("ok", { status: 200 }),
    lookupImpl: async () => [{ address: "127.0.0.1", family: 4 }],
  });

  assert.equal(probe.errorCode, "ERR_UNSAFE_URL");
});

test("non-canonical IPv6 loopback and transition forms are treated as private", () => {
  for (const address of [
    "0:0:0:0:0:ffff:127.0.0.1",
    "::0:1",
    "0:0:0:0:0:0:0:1",
    "64:ff9b::7f00:1",
    "2002:7f00:0001::",
    "::ffff:10.0.0.5",
  ]) {
    assert.equal(isPublicIpAddress(address), false, `${address} must not be treated as public`);
  }
  for (const address of ["2001:4860:4860::8888", "::ffff:8.8.8.8", "2002:0808:0808::"]) {
    assert.equal(isPublicIpAddress(address), true, `${address} must be treated as public`);
  }
});
