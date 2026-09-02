import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminSessionToken } from "@/lib/auth";

const PUBLIC_ADMIN_PATHS = ["/admin/login", "/api/admin/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
