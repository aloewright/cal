export interface Env {
  DB: D1Database;
  CAL_ASSETS: R2Bucket;
  CAL_CACHE: KVNamespace;
  EMBEDDINGS_INDEX: VectorizeIndex;
  AI: Ai;
  AI_GATEWAY_ACCOUNT_ID: string;
  AI_GATEWAY_NAME: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}
