import { createAuth } from "./auth";
import type { Env } from "./env";
import {
  createEvent,
  deleteEvent,
  eventsTableDDL,
  listEventsInRange,
} from "./events";
import { loginPage, monthView } from "./views";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const html = (body: string, status = 200): Response =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

const aiGatewayUrl = (env: Env): string =>
  `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/openai`;

const ymd = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const parseMonth = (
  ymParam: string | null
): { year: number; month: number } => {
  if (ymParam) {
    const match = /^(\d{4})-(\d{2})$/.exec(ymParam);
    if (match) {
      const y = Number(match[1]);
      const m = Number(match[2]);
      if (y >= 1900 && y <= 3000 && m >= 1 && m <= 12) {
        return { year: y, month: m };
      }
    }
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
};

const monthRange = (
  year: number,
  month: number
): { start: string; end: string } => {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const startDow = startDate.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
  const gridStart = new Date(
    Date.UTC(year, month - 1, 1 - startDow)
  );
  const gridEnd = new Date(gridStart.getTime());
  gridEnd.setUTCDate(gridEnd.getUTCDate() + totalCells - 1);
  return {
    start: ymd(
      gridStart.getUTCFullYear(),
      gridStart.getUTCMonth() + 1,
      gridStart.getUTCDate()
    ),
    end: ymd(
      gridEnd.getUTCFullYear(),
      gridEnd.getUTCMonth() + 1,
      gridEnd.getUTCDate()
    ),
  };
};

const isValidDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const auth = createAuth(env);

    if (url.pathname.startsWith("/api/auth/")) {
      return auth.handler(request);
    }

    if (url.pathname === "/health") {
      return json({ ok: true });
    }

    if (url.pathname === "/cloudflare/status") {
      return json({
        d1Binding: Boolean(env.DB),
        r2Binding: Boolean(env.CAL_ASSETS),
        kvBinding: Boolean(env.CAL_CACHE),
        vectorizeBinding: Boolean(env.EMBEDDINGS_INDEX),
        aiBinding: Boolean(env.AI),
        aiGatewayUrl: aiGatewayUrl(env),
      });
    }

    if (url.pathname === "/admin/migrate" && request.method === "POST") {
      const adminToken = url.searchParams.get("token");
      if (!adminToken || adminToken !== env.BETTER_AUTH_SECRET) {
        return json({ error: "unauthorized" }, 401);
      }
      const { getMigrations } = await import("better-auth/db/migration");
      const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(
        auth.options
      );
      await runMigrations();
      const statements = eventsTableDDL
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
      return json({
        ok: true,
        created: toBeCreated.map((t: { table: string }) => t.table),
        added: toBeAdded.map((t: { table: string }) => t.table),
        events_table: "cal_event",
      });
    }

    const session = await auth.api.getSession({ headers: request.headers });

    if (url.pathname === "/") {
      if (!session) {
        const mode = url.searchParams.get("mode") === "signup" ? "signup" : "signin";
        return html(loginPage(mode));
      }
      const { year, month } = parseMonth(url.searchParams.get("ym"));
      const { start, end } = monthRange(year, month);
      const events = await listEventsInRange(env, session.user.id, start, end);
      const now = new Date();
      const today = {
        y: now.getUTCFullYear(),
        m: now.getUTCMonth() + 1,
        d: now.getUTCDate(),
      };
      return html(
        monthView({
          userEmail: session.user.email,
          year,
          month,
          events,
          today,
        })
      );
    }

    if (url.pathname === "/events") {
      if (!session) return json({ error: "unauthorized" }, 401);
      if (request.method === "GET") {
        const date = url.searchParams.get("date");
        if (!date || !isValidDate(date)) {
          return json({ error: "invalid date" }, 400);
        }
        const events = await listEventsInRange(
          env,
          session.user.id,
          date,
          date
        );
        return json(events);
      }
      if (request.method === "POST") {
        const body = (await request.json().catch(() => null)) as {
          event_date?: string;
          title?: string;
          start_time?: string | null;
          description?: string | null;
        } | null;
        if (!body || !body.event_date || !isValidDate(body.event_date) || !body.title) {
          return json({ error: "invalid input" }, 400);
        }
        const created = await createEvent(env, session.user.id, {
          event_date: body.event_date,
          title: body.title.slice(0, 200),
          start_time: body.start_time ?? null,
          description: body.description ?? null,
        });
        return json(created, 201);
      }
      return json({ error: "method not allowed" }, 405);
    }

    if (url.pathname.startsWith("/events/")) {
      if (!session) return json({ error: "unauthorized" }, 401);
      const id = url.pathname.slice("/events/".length);
      if (!id) return json({ error: "missing id" }, 400);
      if (request.method === "DELETE") {
        const ok = await deleteEvent(env, session.user.id, id);
        return json({ ok }, ok ? 200 : 404);
      }
      return json({ error: "method not allowed" }, 405);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
