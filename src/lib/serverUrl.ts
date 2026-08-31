import { networkInterfaces } from "node:os";

/**
 * Best-effort LAN URL the kiosk (and anyone else on the network) can use to
 * reach this board, shown in the footer. Resolves the host's first non-internal
 * IPv4 address rather than "localhost"/127.0.0.1, so the footer is useful when
 * read off the TV from across the room.
 *
 * Node-only (uses `node:os`) -- import from server components / route handlers,
 * never from Edge-runtime code.
 */
export function getBoardLanUrl(): string {
  const port = process.env.PORT ?? "3000";
  const host = firstLanIpv4() ?? "localhost";
  return `http://${host}:${port}`;
}

function firstLanIpv4(): string | null {
  const interfaces = networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    for (const addr of addrs ?? []) {
      // Node <18 reports `family` as the string "IPv4"; newer as the number 4.
      const isIpv4 = addr.family === "IPv4" || (addr.family as unknown) === 4;
      if (isIpv4 && !addr.internal) return addr.address;
    }
  }
  return null;
}
