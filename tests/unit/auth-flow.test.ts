// @vitest-environment node

import { describe, expect, it } from "vitest";
import worker from "../../src/index";

const env = {
  AI_GATEWAY_ACCOUNT_ID: "test-account",
  AI_GATEWAY_NAME: "test-gateway",
  BETTER_AUTH_SECRET: "test-secret-value-that-is-long-enough-for-better-auth",
  BETTER_AUTH_TRUSTED_ORIGINS: "https://cal.fly.pm",
  BETTER_AUTH_URL: "https://cal.fly.pm",
};

describe("auth form flow", () => {
  it("preserves each auth Set-Cookie header on successful sign-up redirect", async () => {
    const body = new URLSearchParams({
      email: "new-user@example.com",
      password: "password123",
      name: "New User",
    });

    const response = await worker.fetch(
      new Request("https://cal.fly.pm/auth/sign-up", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://cal.fly.pm",
        },
        body,
      }),
      env as never
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.getSetCookie()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^__Secure-better-auth\.session_token=/),
        expect.stringMatching(/^__Secure-better-auth\.session_data=/),
      ])
    );
  });
});
