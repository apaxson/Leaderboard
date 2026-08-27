/**
 * IPv4 allowlist for the /admin surface. Pure arithmetic (no Node "net"
 * module) so it also runs in the Edge runtime, where src/proxy.ts executes.
 */

const DEFAULT_ADMIN_ALLOWED_CIDRS = "10.0.0.0/22";

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    result = (result << 8) | octet;
  }
  return result >>> 0;
}

function parseCidr(cidr: string): { network: number; mask: number } | null {
  const [ip, prefixRaw] = cidr.trim().split("/");
  const prefix = prefixRaw === undefined ? 32 : Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { network: (ipInt & mask) >>> 0, mask };
}

/** Strips the "::ffff:" prefix Node/V8 sometimes uses for IPv4-mapped addresses. */
function normalizeIp(ip: string): string {
  return ip.trim().replace(/^::ffff:/i, "");
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  const parsedCidr = parseCidr(cidr);
  if (!parsedCidr) return false;
  const ipInt = ipv4ToInt(normalizeIp(ip));
  if (ipInt === null) return false;
  return (ipInt & parsedCidr.mask) >>> 0 === parsedCidr.network;
}

function getAllowedCidrs(): string[] {
  const configured = process.env.ADMIN_ALLOWED_CIDRS ?? DEFAULT_ADMIN_ALLOWED_CIDRS;
  return configured
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

export function isIpAllowedForAdmin(ip: string | null): boolean {
  if (!ip) return false;
  const cidrs = getAllowedCidrs();
  return cidrs.some((cidr) => isIpInCidr(ip, cidr));
}

/**
 * Best-effort client IP for a request reaching this Node process directly.
 * Next.js populates `x-forwarded-for` from the raw socket address whenever
 * the incoming request doesn't already carry that header -- see
 * base-server.js's `req.headers['x-forwarded-for'] ??= socket.remoteAddress`.
 * That means: if this app sits behind a trusted reverse proxy that
 * overwrites/strips client-supplied forwarding headers, this is fully
 * trustworthy. If the Node server is exposed directly to the network with
 * nothing in front of it, a client could in principle set its own
 * X-Forwarded-For header to spoof this check. For a home-LAN kiosk behind a
 * router with no port-forwarding, that's an acceptable trade-off, but if
 * this is ever exposed beyond a trusted LAN, put a reverse proxy in front
 * that strips inbound X-Forwarded-For before setting its own.
 */
export function getClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) return null;
  const [first] = forwardedFor.split(",");
  return first?.trim() || null;
}
