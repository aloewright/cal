import { splitSetCookieHeader } from "better-auth/cookies";
import { createAuth } from "./auth";
import type { Env } from "./env";
import {
  createEvent,
  deleteEvent,
  ensureEventsSchema,
  listEventsInRange,
} from "./events";
import { isValidEmail, sendCalendarInvite } from "./invitations";
import { addRealtimeKitParticipant, createRealtimeKitMeeting } from "./realtimekit";
import { reconcile } from "./reconcile";
import { handleSyncWebhook, sendWebhook } from "./sync";
import { loginPage, meetingPage, monthView } from "./views";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const html = (body: string, status = 200): Response =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, must-revalidate",
    },
  });


const appendSetCookieHeaders = (target: Headers, source: Headers): void => {
  const getSetCookie = source.getSetCookie?.();
  const setCookie = source.get("set-cookie");
  const cookies = getSetCookie?.length
    ? getSetCookie
    : setCookie
      ? splitSetCookieHeader(setCookie)
      : [];
  for (const cookie of cookies) {
    target.append("set-cookie", cookie);
  }
};

const MAIL_STATIC_ORIGIN = "https://mail.fly.pm";

const staticAssetTypes = new Map<string, string>([
  ["/favicon.ico", "image/vnd.microsoft.icon"],
  ["/favicon-16x16.png", "image/png"],
  ["/favicon-32x32.png", "image/png"],
  ["/apple-touch-icon.png", "image/png"],
  ["/logo.png", "image/png"],
  ["/icon-192.png", "image/png"],
  ["/icon-512.png", "image/png"],
]);

const calendarStaticAssetPaths = new Map<string, string>([
  ["/favicon.ico", "/calendar-favicon.ico"],
  ["/favicon-16x16.png", "/calendar-favicon-16x16.png"],
  ["/favicon-32x32.png", "/calendar-favicon-32x32.png"],
  ["/apple-touch-icon.png", "/calendar-apple-touch-icon.png"],
  ["/logo.png", "/calendar-appicon.png"],
  ["/icon-192.png", "/calendar-icon-192.png"],
  ["/icon-512.png", "/calendar-icon-512.png"],
]);

const siteManifest = {
  name: "fly.pm Calendar",
  short_name: "fly.pm",
  icons: [
    {
      src: "/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any maskable",
    },
    {
      src: "/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable",
    },
  ],
  theme_color: "#0f172a",
  background_color: "#0f172a",
  display: "standalone",
  start_url: "/",
  scope: "/",
  orientation: "portrait-primary",
};

async function staticAssetResponse(url: URL): Promise<Response | null> {
  if (url.pathname === "/site.webmanifest") {
    return new Response(JSON.stringify(siteManifest, null, 2), {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    });
  }

  const contentType = staticAssetTypes.get(url.pathname);
  if (!contentType) return null;

  const assetPath = calendarStaticAssetPaths.get(url.pathname) ?? url.pathname;
  const res = await fetch(`${MAIL_STATIC_ORIGIN}${assetPath}`);
  if (!res.ok || !res.body) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(res.body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400",
    },
  });
}

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
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          const result = await reconcile(env);
          console.log("[reconcile]", JSON.stringify(result));
        } catch (err) {
          console.error("[reconcile] failed", err);
        }
      })()
    );
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
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

    const staticResponse = await staticAssetResponse(url);
    if (staticResponse) return staticResponse;

    const auth = createAuth(env);

    if (url.pathname.startsWith("/api/auth/")) {
      return auth.handler(request);
    }

    if (
      (url.pathname === "/auth/sign-in" || url.pathname === "/auth/sign-up") &&
      request.method === "POST"
    ) {
      const form = await request.formData().catch(() => null);
      if (!form) {
        return html(loginPage("signin", "Invalid form submission"), 400);
      }
      const email = String(form.get("email") ?? "").trim();
      const password = String(form.get("password") ?? "");
      const name = String(form.get("name") ?? "").trim();
      const isSignup = url.pathname === "/auth/sign-up";

      const body: Record<string, string> = { email, password };
      if (isSignup) body.name = name || email.split("@")[0];

      const targetPath = isSignup ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";
      const innerReq = new Request(new URL(targetPath, url).toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const innerRes = await auth.handler(innerReq);
      if (innerRes.ok) {
        const headers = new Headers();
        headers.set("location", "/");
        appendSetCookieHeaders(headers, innerRes.headers);
        return new Response(null, { status: 303, headers });
      }
      let msg = "Authentication failed";
      try {
        const j = (await innerRes.json()) as { message?: string; error?: string };
        msg = j.message || j.error || msg;
      } catch {
        // ignore
      }
      return html(loginPage(isSignup ? "signup" : "signin", msg), innerRes.status);
    }

    if (url.pathname === "/sync/webhook" && request.method === "POST") {
      return handleSyncWebhook(env, request);
    }

    if (url.pathname === "/admin/reconcile" && request.method === "POST") {
      const token = url.searchParams.get("token");
      if (!token || token !== env.BETTER_AUTH_SECRET) {
        return json({ error: "unauthorized" }, 401);
      }
      const result = await reconcile(env);
      return json(result);
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
      await ensureEventsSchema(env);
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
          location?: string | null;
          invitee_email?: string | null;
        } | null;
        if (!body || !body.event_date || !isValidDate(body.event_date) || !body.title) {
          return json({ error: "invalid input" }, 400);
        }
        const inviteeEmail = body.invitee_email?.trim() || null;
        if (inviteeEmail && !isValidEmail(inviteeEmail)) {
          return json({ error: "invalid invitee email" }, 400);
        }
        const created = await createEvent(env, session.user.id, {
          event_date: body.event_date,
          title: body.title.slice(0, 200),
          start_time: body.start_time ?? null,
          description: body.description ?? null,
          location: body.location ? body.location.slice(0, 500) : null,
          invitee_email: inviteeEmail ? inviteeEmail.slice(0, 320) : null,
        });
        let invite: { sent: boolean; error?: string } | undefined;
        if (created.invitee_email) {
          try {
            invite = await sendCalendarInvite(
              env,
              created,
              session.user.email,
              url.origin
            );
          } catch (err) {
            console.error("[invite] send failed", err);
            invite = {
              sent: false,
              error:
                err instanceof Error ? err.message : "Could not send invitation",
            };
          }
        }
        await sendWebhook(env, {
          op: "upsert",
          from: "cal",
          user_email: session.user.email,
          source_id: created.id,
          target_id: null,
          updated_at: created.updated_at,
          event: {
            title: created.title,
            event_date: created.event_date,
            start_time: created.start_time,
            description: created.description,
            location: created.location,
            completed: false,
          },
        });
        return json(invite ? { ...created, invite } : created, 201);
      }
      return json({ error: "method not allowed" }, 405);
    }

    if (url.pathname === "/api/realtimekit/call" && request.method === "POST") {
      if (!session) return json({ error: "unauthorized" }, 401);
      const body = (await request.json().catch(() => null)) as {
        title?: string;
      } | null;
      const title = (body?.title || "Calendar video call").slice(0, 100);
      try {
        const meeting = await createRealtimeKitMeeting(env, title);
        return json({
          meetingId: meeting.id,
          url: new URL(`/meet/${meeting.id}`, url).toString(),
        });
      } catch (err) {
        console.error("[realtimekit] create call failed", err);
        return json(
          {
            error:
              err instanceof Error ? err.message : "Could not create video call",
          },
          502
        );
      }
    }

    if (url.pathname.startsWith("/meet/") && request.method === "GET") {
      const meetingId = url.pathname.slice("/meet/".length);
      if (!meetingId) return new Response("Not found", { status: 404 });
      const guestEmail = url.searchParams.get("email")?.trim() ?? "";
      if (!session && !isValidEmail(guestEmail)) {
        return html(loginPage("signin", "Sign in to join the video call"), 401);
      }
      try {
        const participant = await addRealtimeKitParticipant(env, meetingId, {
          id: session?.user.id ?? "guest",
          email: session?.user.email ?? guestEmail,
          name: session?.user.name ?? guestEmail,
        });
        return html(meetingPage(participant.token));
      } catch (err) {
        console.error("[realtimekit] join call failed", err);
        return html(
          loginPage(
            "signin",
            err instanceof Error ? err.message : "Could not join video call"
          ),
          502
        );
      }
    }

    if (url.pathname.startsWith("/events/")) {
      if (!session) return json({ error: "unauthorized" }, 401);
      const id = url.pathname.slice("/events/".length);
      if (!id) return json({ error: "missing id" }, 400);
      if (request.method === "DELETE") {
        const result = await deleteEvent(env, session.user.id, id);
        if (result.deleted) {
          await sendWebhook(env, {
            op: "delete",
            from: "cal",
            user_email: session.user.email,
            source_id: id,
            target_id: result.dp_task_id,
            updated_at: Date.now(),
          });
        }
        return json({ ok: result.deleted }, result.deleted ? 200 : 404);
      }
      return json({ error: "method not allowed" }, 405);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
