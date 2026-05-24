export interface Env {
  DB: D1Database;
  DP_DB: D1Database;
  CAL_ASSETS: R2Bucket;
  CAL_CACHE: KVNamespace;
  EMBEDDINGS_INDEX: VectorizeIndex;
  AI: Ai;
  AI_GATEWAY_ACCOUNT_ID: string;
  AI_GATEWAY_NAME: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  SYNC_SECRET?: string;
  DP_WEBHOOK_URL?: string;
  REALTIMEKIT_ACCOUNT_ID?: string;
  REALTIMEKIT_APP_ID?: string;
  REALTIMEKIT_API_TOKEN?: string;
  REALTIMEKIT_PRESET_NAME?: string;
  REALTIMEKIT_STORAGE_CONFIG_JSON?: string;
  INVITE_EMAIL?: SendEmail;
  INVITE_EMAIL_FROM?: string;
}
