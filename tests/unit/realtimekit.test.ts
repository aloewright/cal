// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { createRealtimeKitMeeting } from "../../src/realtimekit";
import type { Env } from "../../src/env";

const env = {
  AI_GATEWAY_ACCOUNT_ID: "account-1",
  AI_GATEWAY_NAME: "gateway",
  BETTER_AUTH_SECRET: "secret",
  BETTER_AUTH_URL: "https://cal.fly.pm",
  REALTIMEKIT_APP_ID: "app-1",
  REALTIMEKIT_API_TOKEN: "token-1",
} as unknown as Env;

describe("createRealtimeKitMeeting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates recorded meetings without an invalid file prefix", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        data: { id: "meeting-1", title: "Planning" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await createRealtimeKitMeeting(env, "Planning");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-1/realtime/kit/app-1/meetings",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer token-1",
          "content-type": "application/json",
        },
      })
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      title: "Planning",
      persist_chat: true,
      record_on_start: true,
      transcribe_on_end: true,
      summarize_on_end: true,
      ai_config: {
        transcription: {
          language: "en",
          profanity_filter: true,
        },
        summarization: {
          summary_type: "team_meeting",
          text_format: "markdown",
          word_limit: 500,
        },
      },
      recording_config: {
        video_config: { export_file: true, codec: "H264" },
      },
    });
    expect(body.recording_config).not.toHaveProperty("file_name_prefix");
  });
});
