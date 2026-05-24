import type { Env } from "./env";

const DEFAULT_REALTIMEKIT_APP_ID = "806174ec-d6d3-479b-a02a-9db9da2b6333";
const DEFAULT_PRESET_NAME = "group_call_participant";
const DEFAULT_HOST_PRESET_NAME = "group_call_host";
const DEFAULT_WAITING_ROOM_PRESET_NAME = "cal_waiting_room_participant";

interface CloudflareApiResponse<T> {
  success: boolean;
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface RealtimeKitMeeting {
  id: string;
  title?: string;
}

interface RealtimeKitParticipant {
  id: string;
  token: string;
}

export interface RealtimeKitRecording {
  id: string;
  status: "INVOKED" | "RECORDING" | "UPLOADING" | "UPLOADED" | "ERRORED" | "PAUSED";
  session_id?: string;
  download_url?: string;
  download_url_expiry?: string;
}

interface RealtimeKitWebhook {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  events: string[];
}

interface RealtimeKitPreset {
  id: string;
  name: string;
  config?: Record<string, unknown>;
  ui?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
}

const realtimeKitConfig = (env: Env) => {
  const accountId = env.REALTIMEKIT_ACCOUNT_ID || env.AI_GATEWAY_ACCOUNT_ID;
  const appId = env.REALTIMEKIT_APP_ID || DEFAULT_REALTIMEKIT_APP_ID;
  const token = env.REALTIMEKIT_API_TOKEN;
  const presetName = env.REALTIMEKIT_PRESET_NAME || DEFAULT_PRESET_NAME;
  const hostPresetName = env.REALTIMEKIT_HOST_PRESET_NAME || DEFAULT_HOST_PRESET_NAME;
  const waitingRoomPresetName =
    env.REALTIMEKIT_WAITING_ROOM_PRESET_NAME || DEFAULT_WAITING_ROOM_PRESET_NAME;
  return { accountId, appId, token, presetName, hostPresetName, waitingRoomPresetName };
};

const requireRealtimeKitConfig = (env: Env) => {
  const config = realtimeKitConfig(env);
  if (!config.accountId || !config.appId || !config.token) {
    throw new Error("RealtimeKit is not configured");
  }
  return config as {
    accountId: string;
    appId: string;
    token: string;
    presetName: string;
    hostPresetName: string;
    waitingRoomPresetName: string;
  };
};

const parseStorageConfig = (env: Env): unknown | undefined => {
  if (!env.REALTIMEKIT_STORAGE_CONFIG_JSON) return undefined;
  try {
    return JSON.parse(env.REALTIMEKIT_STORAGE_CONFIG_JSON);
  } catch {
    throw new Error("Invalid REALTIMEKIT_STORAGE_CONFIG_JSON");
  }
};

const apiRequest = async <T>(
  env: Env,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: Record<string, unknown>
): Promise<T> => {
  const { accountId, token } = requireRealtimeKitConfig(env);
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`,
    {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
  const payload = (await response.json().catch(() => null)) as
    | CloudflareApiResponse<T>
    | null;
  if (!response.ok || !payload?.success || !payload.data) {
    const message =
      payload?.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
      `Cloudflare API request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload.data;
};

const recordingConfig = (env: Env): Record<string, unknown> => {
  const storageConfig = parseStorageConfig(env);
  const config: Record<string, unknown> = {
    video_config: { export_file: true, codec: "H264" },
  };
  if (storageConfig) {
    config.storage_config = storageConfig;
    config.realtimekit_bucket_config = { enabled: false };
  }
  return config;
};

export const createRealtimeKitMeeting = async (
  env: Env,
  title: string
): Promise<RealtimeKitMeeting> => {
  const { appId } = requireRealtimeKitConfig(env);

  return await apiRequest<RealtimeKitMeeting>(
    env,
    "POST",
    `/realtime/kit/${appId}/meetings`,
    {
      title,
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
      recording_config: recordingConfig(env),
    }
  );
};

export const addRealtimeKitParticipant = async (
  env: Env,
  meetingId: string,
  user: {
    id: string;
    email: string;
    name?: string | null;
    role?: "host" | "participant";
    waitingRoomEnabled?: boolean;
  }
): Promise<RealtimeKitParticipant> => {
  const { appId, presetName, hostPresetName, waitingRoomPresetName } =
    requireRealtimeKitConfig(env);
  const participantPreset =
    user.role === "host"
      ? hostPresetName
      : user.waitingRoomEnabled
        ? waitingRoomPresetName
        : presetName;
  return await apiRequest<RealtimeKitParticipant>(
    env,
    "POST",
    `/realtime/kit/${appId}/meetings/${meetingId}/participants`,
    {
      custom_participant_id: `${user.id}-${crypto.randomUUID()}`,
      preset_name: participantPreset,
      name: user.name || user.email,
    }
  );
};

export const getActiveRealtimeKitRecording = async (
  env: Env,
  meetingId: string
): Promise<RealtimeKitRecording | null> => {
  const { appId } = requireRealtimeKitConfig(env);
  try {
    return await apiRequest<RealtimeKitRecording>(
      env,
      "GET",
      `/realtime/kit/${appId}/recordings/active-recording/${meetingId}`
    );
  } catch (err) {
    if (err instanceof Error && /404|not found/i.test(err.message)) return null;
    throw err;
  }
};

export const startRealtimeKitRecording = async (
  env: Env,
  meetingId: string
): Promise<RealtimeKitRecording> => {
  const { appId } = requireRealtimeKitConfig(env);
  return await apiRequest<RealtimeKitRecording>(
    env,
    "POST",
    `/realtime/kit/${appId}/recordings`,
    {
      meeting_id: meetingId,
      allow_multiple_recordings: false,
      ...recordingConfig(env),
    }
  );
};

export const updateRealtimeKitRecording = async (
  env: Env,
  recordingId: string,
  action: "pause" | "resume" | "stop"
): Promise<RealtimeKitRecording> => {
  const { appId } = requireRealtimeKitConfig(env);
  return await apiRequest<RealtimeKitRecording>(
    env,
    "PUT",
    `/realtime/kit/${appId}/recordings/${recordingId}`,
    { action }
  );
};

export const ensureRealtimeKitWebhook = async (
  env: Env,
  webhookUrl: string
): Promise<{ created: boolean; url: string }> => {
  const { appId } = requireRealtimeKitConfig(env);
  const expectedEvents = ["meeting.summary", "meeting.transcript", "recording.statusUpdate"];
  const list = await apiRequest<RealtimeKitWebhook[]>(
    env,
    "GET",
    `/realtime/kit/${appId}/webhooks`
  );
  const existing = list.find((webhook) => webhook.url === webhookUrl);
  if (existing) return { created: false, url: webhookUrl };
  await apiRequest<RealtimeKitWebhook>(
    env,
    "POST",
    `/realtime/kit/${appId}/webhooks`,
    {
      name: "cal post-meeting AI",
      url: webhookUrl,
      events: expectedEvents,
      enabled: true,
    }
  );
  return { created: true, url: webhookUrl };
};

export const ensureRealtimeKitWaitingRoomPreset = async (
  env: Env
): Promise<{ created: boolean; name: string }> => {
  const { appId, presetName, waitingRoomPresetName } = requireRealtimeKitConfig(env);
  const presets = await apiRequest<RealtimeKitPreset[]>(
    env,
    "GET",
    `/realtime/kit/${appId}/presets`
  );
  if (presets.some((preset) => preset.name === waitingRoomPresetName)) {
    return { created: false, name: waitingRoomPresetName };
  }

  const basePreset = presets.find((preset) => preset.name === presetName);
  if (!basePreset) throw new Error(`RealtimeKit preset ${presetName} was not found`);
  const details = await apiRequest<RealtimeKitPreset>(
    env,
    "GET",
    `/realtime/kit/${appId}/presets/${basePreset.id}`
  );
  await apiRequest<RealtimeKitPreset>(
    env,
    "POST",
    `/realtime/kit/${appId}/presets`,
    {
      name: waitingRoomPresetName,
      config: details.config,
      ui: details.ui,
      permissions: {
        ...(details.permissions ?? {}),
        waiting_room_type: "SKIP_ON_ACCEPT",
        show_participant_list: false,
      },
    }
  );
  return { created: true, name: waitingRoomPresetName };
};

export const realtimeKitIsConfigured = (env: Env): boolean => {
  const { accountId, appId, token } = realtimeKitConfig(env);
  return Boolean(accountId && appId && token);
};
