import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets LAN devices (e.g. loading the kiosk board or /admin from another
  // machine on 10.0.0.0/22) reach the `next dev` server -- dev-only, and
  // separate from the /admin network gate in src/proxy.ts, which is what
  // actually enforces this range in production.
  allowedDevOrigins: ["10.0.0.*", "10.0.1.*", "10.0.2.*", "10.0.3.*"],
};

export default nextConfig;
