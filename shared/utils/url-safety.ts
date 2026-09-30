import { promises as dns, lookup as dnsLookupCallback, type LookupAddress } from "node:dns";
import { isIP } from "node:net";
import { Agent } from "undici";
import { AppError } from "@/shared/errors/app-error";

export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true; // malformed — refuse, don't guess
  if (a === 0) return true; // 0.0.0.0/8 ("this network")
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT
  return false;
}

export function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique local
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  if (lower.startsWith("::ffff:")) {
    const embedded = lower.slice("::ffff:".length);
    if (isIP(embedded) === 4) return isPrivateIpv4(embedded);
  }
  return false;
}

/**
 * Guards against SSRF via customer-supplied URLs we later `fetch()`
 * server-side (webhook endpoints). Requires https, and rejects any hostname
 * that resolves (now) to a loopback/private/link-local/reserved address —
 * including the literal IP form and the cloud-metadata address
 * 169.254.169.254. Callers must re-check at dispatch time too, not just at
 * registration time, since DNS can be repointed after the initial check
 * (rebinding).
 */
export async function assertPubliclyRoutableUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw AppError.validation("Invalid URL");
  }

  if (url.protocol !== "https:") {
    throw AppError.validation("URL must use https");
  }

  const hostname = url.hostname;
  const literalFamily = isIP(hostname);

  if (literalFamily === 4) {
    if (isPrivateIpv4(hostname)) throw AppError.validation("URL resolves to a private or reserved address");
    return;
  }
  if (literalFamily === 6) {
    if (isPrivateIpv6(hostname)) throw AppError.validation("URL resolves to a private or reserved address");
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw AppError.validation("URL hostname could not be resolved");
  }
  if (addresses.length === 0) {
    throw AppError.validation("URL hostname could not be resolved");
  }
  for (const { address, family } of addresses) {
    if (family === 4 && isPrivateIpv4(address)) {
      throw AppError.validation("URL resolves to a private or reserved address");
    }
    if (family === 6 && isPrivateIpv6(address)) {
      throw AppError.validation("URL resolves to a private or reserved address");
    }
  }
}

type DnsLookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * A DNS lookup function (same shape `node:dns`'s own `lookup` uses) that
 * filters out private/reserved addresses at the moment of resolution —
 * passed to undici's Agent `connect.lookup` below so the filter runs at the
 * actual TCP-connect step, not a separate pre-check. `assertPubliclyRoutableUrl`
 * above still has its own window between checking and connecting (DNS could
 * be repointed in between); this closes that gap for good, since there's no
 * longer a second, unguarded resolution — every connection this dispatcher
 * makes resolves through this same filter.
 */
function ssrfSafeLookup(hostname: string, options: unknown, callback: DnsLookupCallback): void {
  dnsLookupCallback(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as unknown as Array<{ address: string; family: number }>;
    const safe = list.filter((a) => (a.family === 4 ? !isPrivateIpv4(a.address) : !isPrivateIpv6(a.address)));
    if (safe.length === 0) {
      return callback(new Error(`SSRF guard: no publicly routable address for ${hostname}`), []);
    }
    callback(null, safe);
  });
}

let sharedDispatcher: Agent | undefined;

/**
 * An undici Agent whose every connection resolves through ssrfSafeLookup.
 * Must be used with undici's own `fetch` (imported from "undici"), not
 * Node's global `fetch` — passing this Agent as `dispatcher` to the global
 * fetch throws ("invalid onRequestStart method"), an interceptor-interface
 * mismatch between Node's bundled undici and this externally-installed one.
 */
export function getSsrfSafeDispatcher(): Agent {
  if (!sharedDispatcher) {
    sharedDispatcher = new Agent({ connect: { lookup: ssrfSafeLookup } });
  }
  return sharedDispatcher;
}
