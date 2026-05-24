import type { Env } from "./env";

const DEFAULT_REALTIMEKIT_APP_ID = "806174ec-d6d3-479b-a02a-9db9da2b6333";
const DEFAULT_PRESET_NAME = "group_call_participant";

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

const realtimeKitConfig = (env: Env) => {
  const accountId = env.REALTIMEKIT_ACCOUNT_ID || env.AI_GATEWAY_ACCOUNT_ID;
  const appId = env.REALTIMEKIT_APP_ID || DEFAULT_REALTIMEKIT_APP_ID;
  const token = env.REALTIMEKIT_API_TOKEN;
  const presetName = env.REALTIMEKIT_PRESET_NAME || DEFAULT_PRESET_NAME;
  return { accountId, appId, token, presetName };
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
  path: string,
  body: Record<string, unknown>
): Promise<T> => {
  const { accountId, token } = requireRealtimeKitConfig(env);
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
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

export const createRealtimeKitMeeting = async (
  env: Env,
  title: string
): Promise<RealtimeKitMeeting> => {
  const { appId } = requireRealtimeKitConfig(env);
  const storageConfig = parseStorageConfig(env);
  const recordingConfig: Record<string, unknown> = {
    file_name_prefix: "storage.fly.app/cal",
    video_config: { export_file: true, codec: "H264" },
  };
  if (storageConfig) {
    recordingConfig.storage_config = storageConfig;
    recordingConfig.realtimekit_bucket_config = { enabled: false };
  }

  return await apiRequest<RealtimeKitMeeting>(
    env,
    `/realtime/kit/${appId}/meetings`,
    {
      title,
      record_on_start: true,
      recording_config: recordingConfig,
    }
  );
};

export const addRealtimeKitParticipant = async (
  env: Env,
  meetingId: string,
  user: { id: string; email: string; name?: string | null }
): Promise<RealtimeKitParticipant> => {
  const { appId, presetName } = requireRealtimeKitConfig(env);
  return await apiRequest<RealtimeKitParticipant>(
    env,
    `/realtime/kit/${appId}/meetings/${meetingId}/participants`,
    {
      custom_participant_id: `${user.id}-${crypto.randomUUID()}`,
      preset_name: presetName,
      name: user.name || user.email,
    }
  );
};

export const realtimeKitIsConfigured = (env: Env): boolean => {
  const { accountId, appId, token } = realtimeKitConfig(env);
  return Boolean(accountId && appId && token);
};
