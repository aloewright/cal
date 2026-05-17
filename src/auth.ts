import { betterAuth } from "better-auth";
import type { Env } from "./env";

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
