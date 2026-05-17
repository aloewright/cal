import { betterAuth } from "better-auth";
import type { Env } from "./env";

export const createAuth = (env: Env) =>
  betterAuth({
    database: env.DB,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
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
