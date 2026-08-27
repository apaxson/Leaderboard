export const ADMIN_COOKIE_NAME = "leaderboard_admin_session";

/**
 * The cookie's value is a token only the server knows (ADMIN_SESSION_TOKEN),
 * never derived from anything guessable. Middleware runs on the Edge
 * runtime, so this file must stay free of Node-only APIs.
 */
export function getAdminSessionToken(): string {
  const token = process.env.ADMIN_SESSION_TOKEN;
  if (!token) {
    throw new Error("Missing ADMIN_SESSION_TOKEN environment variable.");
  }
  return token;
}

export function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("Missing ADMIN_PASSWORD environment variable.");
  }
  return password;
}
