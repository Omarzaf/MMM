// SPDX-License-Identifier: MIT
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import fs from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_POLICY_PATH = path.join(ROOT, "intermediate", "link_health_policy.json");
const HARD_BROKEN_STATUSES = new Set([404, 410]);
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

export function normalizeHost(value) {
  return String(value || "").trim().toLowerCase();
}

/** Expand any textual IPv6 form to its 16 canonical bytes, or null. */
export function ipv6ToBytes(value) {
  let text = String(value || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);
  if (isIP(text) !== 6) return null;
  let tail = "";
  const dotted = text.lastIndexOf(":");
  const maybeV4 = text.slice(dotted + 1);
  if (maybeV4.includes(".")) {
    const octets = maybeV4.split(".").map(Number);
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    tail = ((octets[0] << 8) | octets[1]).toString(16) + ":" + ((octets[2] << 8) | octets[3]).toString(16);
    text = text.slice(0, dotted + 1) + tail;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rear = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = 8 - head.length - rear.length;
  if (halves.length === 2 ? fill < 0 : fill !== 0) return null;
  const groups = [...head, ...Array.from({ length: halves.length === 2 ? fill : 0 }, () => "0"), ...rear];
  if (groups.length !== 8) return null;
  const bytes = [];
  for (const group of groups) {
    const word = Number.parseInt(group || "0", 16);
    if (!Number.isInteger(word) || word < 0 || word > 0xffff) return null;
    bytes.push((word >> 8) & 0xff, word & 0xff);
  }
  return bytes;
}

/** The IPv4 address embedded by a mapped, compatible, 6to4 or NAT64 form. */
export function embeddedIpv4(bytes) {
  const v4 = (a, b, c, d) => `${bytes[a]}.${bytes[b]}.${bytes[c]}.${bytes[d]}`;
  const zeros = (from, to) => bytes.slice(from, to).every((byte) => byte === 0);
  if (zeros(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return v4(12, 13, 14, 15); // ::ffff:0:0/96
  if (zeros(0, 12) && !(zeros(12, 15) && bytes[15] <= 1)) return v4(12, 13, 14, 15);        // ::a.b.c.d
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return v4(2, 3, 4, 5);                        // 2002::/16 6to4
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && zeros(4, 12)) {
    return v4(12, 13, 14, 15);                                                              // 64:ff9b::/96 NAT64
  }
  return null;
}

export function isPublicIpAddress(value) {
  const address = normalizeHost(value).replace(/^\[|\]$/g, "");
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (family === 6) {
    const bytes = ipv6ToBytes(address);
    if (!bytes) return false;
    // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and the NAT64
    // well-known prefix all carry an embedded v4 address that must be judged
    // on its own terms, or 127.0.0.1 slips through in v6 clothing.
    const embedded = embeddedIpv4(bytes);
    if (embedded) return isPublicIpAddress(embedded);
    if (bytes.every((byte) => byte === 0)) return false;                 // ::
    if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) return false; // ::1
    if ((bytes[0] & 0xfe) === 0xfc) return false;                        // fc00::/7 unique-local
    if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return false;   // fe80::/10 link-local
    if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0xc0) return false;   // fec0::/10 site-local
    if (bytes[0] === 0xff) return false;                                 // ff00::/8 multicast
    return true;
  }
  return false;
}

export function validateHttpUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "URL is malformed." };
  }
  if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, reason: `Unsupported URL protocol: ${parsed.protocol}` };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Credential-bearing URLs are not allowed." };
  }
  const host = normalizeHost(parsed.hostname).replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, reason: "Local network targets are not allowed." };
  }
  if (isIP(host) && !isPublicIpAddress(host)) {
    return { ok: false, reason: "Private or link-local network targets are not allowed." };
  }
  return { ok: true, url: parsed.toString() };
}

export async function validateResolvedTarget(value, lookupImpl = lookup) {
  const validated = validateHttpUrl(value);
  if (!validated.ok) return validated;
  const hostname = new URL(validated.url).hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) return { ...validated, addresses: [{ address: hostname, family: isIP(hostname) }] };
  const addresses = await lookupImpl(hostname, { all: true, verbatim: true });
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return { ok: false, reason: "Hostname did not resolve to an address." };
  }
  const unsafe = addresses.find(({ address }) => !isPublicIpAddress(address));
  if (unsafe) {
    return { ok: false, reason: `Hostname resolved to a disallowed local address: ${unsafe.address}` };
  }
  return { ...validated, addresses };
}

export function validatePolicy(policy) {
  if (!policy || typeof policy !== "object") {
    throw new Error("Policy must be an object.");
  }
  if (!Array.isArray(policy.waf_allowlist)) {
    throw new Error("Policy waf_allowlist must be an array.");
  }
  const hostMap = new Map();
  for (const entry of policy.waf_allowlist) {
    const host = normalizeHost(entry.host);
    if (!host) {
      throw new Error("Allowlist entry host is required.");
    }
    if (hostMap.has(host)) {
      throw new Error(`Duplicate allowlist host: ${host}`);
    }
    if (!Array.isArray(entry.statuses) || entry.statuses.length === 0) {
      throw new Error(`Allowlist entry ${host} must declare at least one status.`);
    }
    for (const status of entry.statuses) {
      if (!Number.isInteger(status) || status < 100 || status > 599) {
        throw new Error(`Allowlist entry ${host} has invalid HTTP status: ${status}`);
      }
    }
    if (!String(entry.rationale || "").trim()) {
      throw new Error(`Allowlist entry ${host} must include rationale.`);
    }
    hostMap.set(host, {
      host,
      statuses: new Set(entry.statuses),
      rationale: String(entry.rationale).trim(),
    });
  }
  const defaultTimeoutMs = Number(policy.default_timeout_ms ?? 10000);
  const defaultConcurrency = Number(policy.default_concurrency ?? 8);
  const maxRedirects = Number(policy.max_redirects ?? 5);
  if (!Number.isInteger(defaultTimeoutMs) || defaultTimeoutMs <= 0) {
    throw new Error("Policy default_timeout_ms must be a positive integer.");
  }
  if (!Number.isInteger(defaultConcurrency) || defaultConcurrency <= 0) {
    throw new Error("Policy default_concurrency must be a positive integer.");
  }
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0) {
    throw new Error("Policy max_redirects must be a non-negative integer.");
  }
  return {
    version: policy.version ?? 1,
    generated_on: policy.generated_on ?? null,
    dataset_path: policy.dataset_path ?? "intermediate/research_dataset.json",
    default_timeout_ms: defaultTimeoutMs,
    default_concurrency: defaultConcurrency,
    max_redirects: maxRedirects,
    output_path: policy.output_path ?? "tmp/link-health/latest.json",
    wafAllowlist: hostMap,
  };
}

export function classifyOutcome({ status, finalUrl, errorCode, allowlist }) {
  const validatedUrl = finalUrl ? validateHttpUrl(finalUrl) : { ok: false };
  const host = validatedUrl.ok ? normalizeHost(new URL(validatedUrl.url).host) : "";
  const allowed = host ? allowlist.get(host) : undefined;
  const numericStatus = Number.isInteger(status) ? status : null;

  if (numericStatus !== null && HARD_BROKEN_STATUSES.has(numericStatus)) {
    return {
      category: "hard-broken",
      ok: false,
      reason: `Received ${numericStatus}; allowlist does not override hard-broken statuses.`,
    };
  }

  if (errorCode === "ERR_TOO_MANY_REDIRECTS") {
    return {
      category: "http-error",
      ok: false,
      reason: "Redirect limit exceeded before reaching a terminal response.",
    };
  }

  if (errorCode === "ERR_INVALID_URL" || errorCode === "ERR_UNSAFE_URL") {
    return {
      category: "http-error",
      ok: false,
      reason: errorCode === "ERR_INVALID_URL" ? "Source URL is invalid." : "Source URL resolves to a disallowed local or credential-bearing target.",
    };
  }

  if (errorCode) {
    return {
      category: "transient-network",
      ok: false,
      reason: `Network failure: ${errorCode}.`,
    };
  }

  if (numericStatus !== null && numericStatus >= 200 && numericStatus < 400) {
    return {
      category: "healthy",
      ok: true,
      reason: `Received ${numericStatus}.`,
    };
  }

  if (numericStatus !== null && allowed?.statuses.has(numericStatus)) {
    return {
      category: "allowlisted-waf",
      ok: true,
      reason: `Received expected bot-protection status ${numericStatus} for ${host}.`,
      rationale: allowed.rationale,
    };
  }

  if (numericStatus !== null && numericStatus >= 400 && numericStatus < 600) {
    return {
      category: "http-error",
      ok: false,
      reason: `Received unexpected HTTP status ${numericStatus}.`,
    };
  }

  return {
    category: "transient-network",
    ok: false,
    reason: "No terminal HTTP response was recorded.",
  };
}

export async function loadPolicy(policyPath = DEFAULT_POLICY_PATH) {
  const raw = await fs.readFile(policyPath, "utf8");
  return validatePolicy(JSON.parse(raw));
}

export async function loadDataset(datasetPath) {
  const raw = await fs.readFile(datasetPath, "utf8");
  const dataset = JSON.parse(raw);
  if (!Array.isArray(dataset.sources)) {
    throw new Error("Dataset sources array is required.");
  }
  return dataset;
}

export function collectSources(dataset) {
  const seen = new Set();
  const sources = [];
  for (const source of dataset.sources) {
    const sourceId = String(source.source_id || "").trim();
    const url = String(source.url || "").trim();
    if (!sourceId || !url || seen.has(sourceId)) {
      continue;
    }
    seen.add(sourceId);
    sources.push({
      source_id: sourceId,
      url,
      publisher: String(source.publisher || "").trim(),
      document_title: String(source.document_title || "").trim(),
    });
  }
  return sources;
}

function createAbortSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeout);
    },
  };
}

/**
 * Fetch-shaped transport that connects to an address already validated by
 * validateResolvedTarget, instead of resolving the hostname a second time.
 * That removes the window in which a short-TTL record can answer the guard
 * with a public address and the connection with a private one.
 */
export function pinnedFetch(url, init = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const secure = target.protocol === "https:";
    const agentModule = secure ? https : http;
    const pinned = Array.isArray(init.pinnedAddresses) && init.pinnedAddresses.length
      ? init.pinnedAddresses[0].address
      : null;
    const request = agentModule.request({
      protocol: target.protocol,
      host: pinned ?? target.hostname,
      servername: secure ? target.hostname.replace(/^\[|\]$/g, "") : undefined,
      port: target.port || (secure ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: init.method ?? "GET",
      headers: { ...init.headers, host: target.host },
    }, (response) => {
      response.resume(); // discard the body; only status and headers are used
      resolve({
        status: response.statusCode,
        headers: { get: (name) => response.headers[String(name).toLowerCase()] ?? null },
        body: { cancel: async () => response.destroy() },
      });
    });
    request.on("error", reject);
    const signal = init.signal;
    if (signal) {
      if (signal.aborted) {
        request.destroy(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      } else {
        signal.addEventListener("abort", () => {
          request.destroy(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        }, { once: true });
      }
    }
    request.end();
  });
}

export async function probeUrl(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10000;
  const maxRedirects = options.maxRedirects ?? 5;
  const fetchImpl = options.fetchImpl ?? pinnedFetch;
  // The DNS guard is independent of the transport: injecting a fetch for tests
  // or instrumentation must never disable an SSRF control. Callers that want it
  // off have to say so explicitly by passing lookupImpl: null.
  const lookupImpl = options.lookupImpl === undefined ? lookup : options.lookupImpl;
  const headers = {
    "user-agent": "PDP-2026-link-health-checker/1.0",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ...options.headers,
  };
  const initialValidation = validateHttpUrl(url);
  if (!initialValidation.ok) {
    return {
      inputUrl: url,
      finalUrl: url,
      status: null,
      redirects: 0,
      errorCode: initialValidation.reason === "URL is malformed." ? "ERR_INVALID_URL" : "ERR_UNSAFE_URL",
      errorMessage: initialValidation.reason,
    };
  }
  let currentUrl = initialValidation.url;
  let redirects = 0;
  let pinnedAddresses = null;

  while (true) {
    if (lookupImpl) {
      try {
        const resolvedValidation = await validateResolvedTarget(currentUrl, lookupImpl);
        pinnedAddresses = resolvedValidation.addresses ?? null;
        if (!resolvedValidation.ok) {
          return {
            inputUrl: url,
            finalUrl: currentUrl,
            status: null,
            redirects,
            errorCode: "ERR_UNSAFE_URL",
            errorMessage: resolvedValidation.reason,
          };
        }
      } catch (error) {
        return {
          inputUrl: url,
          finalUrl: currentUrl,
          status: null,
          redirects,
          errorCode: String(error?.code || error?.name || "ERR_DNS_LOOKUP"),
          errorMessage: String(error?.message || error),
        };
      }
    }
    const abortable = createAbortSignal(timeoutMs);
    try {
      const response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers,
        signal: abortable.signal,
        pinnedAddresses,
      });
      abortable.clear();
      const location = response.headers.get("location");

      if (location && response.status >= 300 && response.status < 400) {
        if (redirects >= maxRedirects) {
          await response.body?.cancel?.();
          return {
            inputUrl: url,
            finalUrl: currentUrl,
            status: response.status,
            redirects,
            errorCode: "ERR_TOO_MANY_REDIRECTS",
          };
        }
        const nextUrl = new URL(location, currentUrl).toString();
        const redirectValidation = validateHttpUrl(nextUrl);
        if (!redirectValidation.ok) {
          await response.body?.cancel?.();
          return {
            inputUrl: url,
            finalUrl: nextUrl,
            status: response.status,
            redirects,
            errorCode: redirectValidation.reason === "URL is malformed." ? "ERR_INVALID_URL" : "ERR_UNSAFE_URL",
            errorMessage: redirectValidation.reason,
          };
        }
        redirects += 1;
        await response.body?.cancel?.();
        currentUrl = redirectValidation.url;
        continue;
      }

      await response.body?.cancel?.();
      return {
        inputUrl: url,
        finalUrl: currentUrl,
        status: response.status,
        redirects,
        errorCode: null,
      };
    } catch (error) {
      abortable.clear();
      return {
        inputUrl: url,
        finalUrl: currentUrl,
        status: null,
        redirects,
        errorCode: error?.name === "AbortError" ? "ETIMEDOUT" : String(error?.code || error?.cause?.code || error?.name || "ERR_FETCH_FAILED"),
        errorMessage: String(error?.message || error),
      };
    }
  }
}

export async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function consume() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) {
        return;
      }
      results[current] = await worker(items[current], current);
    }
  }

  const width = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: width }, () => consume()));
  return results;
}

export async function runLinkHealthCheck(options = {}) {
  const policy = options.policy ?? (await loadPolicy(options.policyPath));
  const datasetPath = path.isAbsolute(policy.dataset_path)
    ? policy.dataset_path
    : path.join(ROOT, policy.dataset_path);
  const dataset = options.dataset ?? (await loadDataset(datasetPath));
  const sources = collectSources(dataset);
  const concurrency = options.concurrency ?? policy.default_concurrency;
  const timeoutMs = options.timeoutMs ?? policy.default_timeout_ms;
  const maxRedirects = options.maxRedirects ?? policy.max_redirects;
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("Concurrency must be a positive integer.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Timeout must be a positive integer.");
  }
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0) {
    throw new Error("Redirect limit must be a non-negative integer.");
  }

  const results = await runWithConcurrency(sources, concurrency, async (source) => {
    const probe = await probeUrl(source.url, {
      timeoutMs,
      maxRedirects,
      fetchImpl: options.fetchImpl,
      lookupImpl: options.lookupImpl,
    });
    const classification = classifyOutcome({
      status: probe.status,
      finalUrl: probe.finalUrl || source.url,
      errorCode: probe.errorCode,
      allowlist: policy.wafAllowlist,
    });
    return {
      source_id: source.source_id,
      url: source.url,
      publisher: source.publisher,
      document_title: source.document_title,
      final_url: probe.finalUrl || source.url,
      status: probe.status,
      redirects: probe.redirects,
      error_code: probe.errorCode,
      error_message: probe.errorMessage ?? null,
      category: classification.category,
      ok: classification.ok,
      reason: classification.reason,
      rationale: classification.rationale ?? null,
    };
  });

  const summary = {
    checked_at_utc: options.checkedAtUtc ?? new Date().toISOString(),
    source_count: results.length,
    healthy: results.filter((item) => item.category === "healthy").length,
    allowlisted_waf: results.filter((item) => item.category === "allowlisted-waf").length,
    hard_broken: results.filter((item) => item.category === "hard-broken").length,
    http_error: results.filter((item) => item.category === "http-error").length,
    transient_network: results.filter((item) => item.category === "transient-network").length,
  };

  return { summary, results };
}

export async function writeReport(report, outputPath) {
  const absolute = path.isAbsolute(outputPath) ? outputPath : path.join(ROOT, outputPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return absolute;
}

export { DEFAULT_POLICY_PATH, ROOT };
