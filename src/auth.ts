import { betterAuth } from "better-auth";
import type { Env } from "./env";

export interface AppSession {
  source: "mail" | "local";
  authCookie?: {
    name: string;
    value: string;
  };
  session: {
    id: string;
    token: string;
    userId: string;
    expiresAt: Date;
  };
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
  };
}

export const createAuth = (env: Env) =>
  betterAuth({
    database: env.DB,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: (env.BETTER_AUTH_TRUSTED_ORIGINS ?? env.BETTER_AUTH_URL)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
    },
    advanced: {
      useSecureCookies: true,
    },
  });

export type Auth = ReturnType<typeof createAuth>;

const SESSION_COOKIE_NAMES = new Set([
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
  "better-auth-session_token",
  "__Secure-better-auth-session_token",
]);

interface BetterAuthSessionCookie {
  name: string;
  rawValue: string;
  token: string;
}

export function extractBetterAuthSessionCookies(cookieHeader: string | null): BetterAuthSessionCookie[] {
  if (!cookieHeader) return [];

  const cookies: BetterAuthSessionCookie[] = [];
  const seen = new Set<string>();
  for (const cookie of cookieHeader.split(/;\s*/)) {
    const eq = cookie.indexOf("=");
    if (eq <= 0) continue;

    const name = cookie.slice(0, eq);
    if (!SESSION_COOKIE_NAMES.has(name)) continue;

    const rawValue = cookie.slice(eq + 1);
    let value = rawValue;
    try {
      value = decodeURIComponent(rawValue);
    } catch {
      // Keep the raw cookie value; Better Auth tokens are URL-safe before signing.
    }

    const token = value.split(".")[0]?.trim();
    if (token && !seen.has(token)) {
      seen.add(token);
      cookies.push({ name, rawValue, token });
    }
  }
  return cookies;
}

export function extractBetterAuthSessionTokens(cookieHeader: string | null): string[] {
  return extractBetterAuthSessionCookies(cookieHeader).map((cookie) => cookie.token);
}

function coerceExpiry(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis);
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim() !== "") {
      return coerceExpiry(numeric);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

async function getMailSession(env: Env, request: Request): Promise<AppSession | null> {
  if (!env.AUTH_DB) return null;

  const cookies = extractBetterAuthSessionCookies(request.headers.get("cookie"));
  for (const cookie of cookies) {
    const row = await env.AUTH_DB.prepare(
      `SELECT
        s.id AS sessionId,
        s.token AS token,
        s.userId AS userId,
        s.expiresAt AS expiresAt,
        u.id AS id,
        u.email AS email,
        u.name AS name,
        u.image AS image
      FROM sessions s
      JOIN users u ON u.id = s.userId
      WHERE s.token = ?
      LIMIT 1`
    )
      .bind(cookie.token)
      .first<{
        sessionId: string;
        token: string;
        userId: string;
        expiresAt: number | string;
        id: string;
        email: string;
        name: string;
        image: string | null;
      }>();

    if (!row) continue;

    const expiresAt = coerceExpiry(row.expiresAt);
    if (!expiresAt || expiresAt <= new Date()) continue;

    return {
      source: "mail",
      authCookie: {
        name: cookie.name,
        value: cookie.rawValue,
      },
      session: {
        id: row.sessionId,
        token: row.token,
        userId: row.userId,
        expiresAt,
      },
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        image: row.image,
      },
    };
  }

  return null;
}

export async function getCurrentSession(
  env: Env,
  request: Request,
  auth: Auth
): Promise<AppSession | null> {
  const mailSession = await getMailSession(env, request);
  if (mailSession) return mailSession;

  const localSession = await auth.api.getSession({ headers: request.headers });
  if (!localSession) return null;

  return {
    source: "local",
    session: {
      id: localSession.session.id,
      token: localSession.session.token,
      userId: localSession.session.userId,
      expiresAt: localSession.session.expiresAt,
    },
    user: {
      id: localSession.user.id,
      email: localSession.user.email,
      name: localSession.user.name,
      image: localSession.user.image ?? null,
    },
  };
}
