import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminSessionToken } from "@/lib/auth";
import { getClientIp, isIpAllowedForAdmin } from "@/lib/network";

const PUBLIC_ADMIN_PATHS = ["/admin/login", "/api/admin/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Network-level gate: the entire /admin surface (including the login
  // page/route) is restricted to the configured LAN, regardless of whether
  // the caller knows the password.
  const clientIp = getClientIp(request);
  if (!isIpAllowedForAdmin(clientIp)) {
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Forbidden: network not allowed" }, { status: 403 });
    }
    return new NextResponse("Forbidden: this network is not permitted to access /admin.", {
      status: 403,
    });
  }

  const isPublic = PUBLIC_ADMIN_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
  if (isPublic) return NextResponse.next();

  const cookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const isAuthed = !!cookie && cookie === getAdminSessionToken();

  if (isAuthed) return NextResponse.next();

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
