export interface Env {
  DB: D1Database;
  CAL_ASSETS: R2Bucket;
  CAL_CACHE: KVNamespace;
  EMBEDDINGS_INDEX: VectorizeIndex;
  AI: Ai;
  AI_GATEWAY_ACCOUNT_ID: string;
  AI_GATEWAY_NAME: string;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const aiGatewayUrl = (env: Env): string =>
  `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/openai`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/health") {
      return json({ ok: true });
    }

    if (pathname === "/cloudflare/status") {
      return json({
        d1Binding: Boolean(env.DB),
        r2Binding: Boolean(env.CAL_ASSETS),
        kvBinding: Boolean(env.CAL_CACHE),
        vectorizeBinding: Boolean(env.EMBEDDINGS_INDEX),
        aiBinding: Boolean(env.AI),
        aiGatewayUrl: aiGatewayUrl(env),
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
