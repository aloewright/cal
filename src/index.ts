import { splitSetCookieHeader } from "better-auth/cookies";
import { createAuth, getCurrentSession } from "./auth";
import type { Env } from "./env";
import {
  createEvent,
  deleteEvent,
  ensureEventsSchema,
  getEventByMeetingId,
  listEventsInRange,
  markMeetingSummarySent,
} from "./events";
import { isValidEmail, sendCalendarInvite, sendMeetingSummaryEmail } from "./invitations";
import {
  addRealtimeKitParticipant,
  createRealtimeKitMeeting,
  ensureRealtimeKitWebhook,
  ensureRealtimeKitWaitingRoomPreset,
  getActiveRealtimeKitRecording,
  startRealtimeKitRecording,
  updateRealtimeKitRecording,
} from "./realtimekit";
import { reconcile } from "./reconcile";
import { handleSyncWebhook, sendWebhook } from "./sync";
import {
  archiveSharedTask,
  createSharedTask,
  isValidTaskDate,
  isValidTaskTime,
  listSharedTasks,
  toggleSharedTask,
} from "./tasks";
import { loginPage, meetingPage, monthView, tasksView } from "./views";

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

const escapeSummaryText = (value: string): string => value.slice(0, 18000);

const summaryWebhookToken = (env: Env): string | undefined =>
  env.REALTIMEKIT_WEBHOOK_SECRET || env.BETTER_AUTH_SECRET;

const webhookUrl = (env: Env, origin: string): string => {
  const base = env.BETTER_AUTH_URL || origin;
  const url = new URL("/api/realtimekit/webhook", base);
  const token = summaryWebhookToken(env);
  if (token) url.searchParams.set("token", token);
  return url.toString();
};

const readDownloadText = async (downloadUrl?: string | null): Promise<string | null> => {
  if (!downloadUrl) return null;
  const response = await fetch(downloadUrl);
  if (!response.ok) return null;
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as {
      summary?: unknown;
      text?: unknown;
      transcript?: unknown;
      data?: { summary?: unknown; text?: unknown; transcript?: unknown };
    };
    const value =
      parsed.summary ??
      parsed.text ??
      parsed.transcript ??
      parsed.data?.summary ??
      parsed.data?.text ??
      parsed.data?.transcript;
    if (typeof value === "string") return value;
  } catch {
    // Plain text summaries are expected.
  }
  return text;
};

const runWorkersAiSummary = async (
  env: Env,
  eventTitle: string,
  realtimeKitSummary: string,
  transcript: string | null
): Promise<string> => {
  try {
    const content = [
      `RealtimeKit summary:\n${realtimeKitSummary}`,
      transcript ? `Transcript excerpt:\n${transcript.slice(0, 12000)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const response = (await env.AI.run("@cf/meta/llama-3.1-8b-instruct" as never, {
      messages: [
        {
          role: "system",
          content:
            "Write concise post-meeting notes in Markdown for the meeting host. Include key points, decisions, and action items. Do not invent details.",
        },
        {
          role: "user",
          content: `Meeting: ${eventTitle}\n\n${content}`,
        },
      ],
    } as never)) as { response?: string };
    return response.response?.trim() || realtimeKitSummary;
  } catch (err) {
    console.error("[realtimekit] Workers AI summary failed", err);
    return realtimeKitSummary;
  }
};

const handleRealtimeKitWebhook = async (env: Env, request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const expectedToken = summaryWebhookToken(env);
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length)
    : "";
  if (expectedToken && url.searchParams.get("token") !== expectedToken && bearer !== expectedToken) {
    return json({ error: "unauthorized" }, 401);
  }

  const payload = (await request.json().catch(() => null)) as {
    event?: string;
    meetingId?: string;
    sessionId?: string;
    summaryDownloadUrl?: string;
    transcriptDownloadUrl?: string;
  } | null;
  if (!payload?.event || !payload.meetingId) return json({ error: "invalid webhook" }, 400);
  if (payload.event !== "meeting.summary") return json({ ok: true, ignored: payload.event });

  await ensureEventsSchema(env);
  const event = await getEventByMeetingId(env, payload.meetingId);
  if (!event) return json({ ok: true, skipped: "event not found" });
  if (
    (payload.sessionId && event.ai_summary_session_id === payload.sessionId) ||
    (!payload.sessionId && event.ai_summary_sent_at)
  ) {
    return json({ ok: true, skipped: "already sent" });
  }

  const realtimeKitSummary = await readDownloadText(payload.summaryDownloadUrl);
  if (!realtimeKitSummary) return json({ error: "summary unavailable" }, 502);
  const transcript = await readDownloadText(payload.transcriptDownloadUrl);
  const summary = await runWorkersAiSummary(
    env,
    event.title,
    escapeSummaryText(realtimeKitSummary),
    transcript ? escapeSummaryText(transcript) : null
  );
  await sendMeetingSummaryEmail(env, event, summary, payload.transcriptDownloadUrl ?? null);
  await markMeetingSummarySent(env, event.id, payload.sessionId ?? null);
  return json({ ok: true });
};


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

const mailAppUrl = (env: Env, path: string): string =>
  new URL(path, env.MAIL_APP_URL ?? MAIL_STATIC_ORIGIN).toString();

async function readAuthError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string; error?: string; code?: string };
    return j.message || j.error || j.code || "Authentication failed";
  } catch {
    return "Authentication failed";
  }
}

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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

    if (url.pathname === "/api/auth/sign-out" && request.method === "POST") {
      const session = await getCurrentSession(env, request, auth);
      const headers = new Headers();

      if (session?.source === "mail" && session.authCookie) {
        try {
          const mailRes = await fetch(mailAppUrl(env, "/api/auth/sign-out"), {
            method: "POST",
            headers: {
              accept: "application/json",
              cookie: `${session.authCookie.name}=${session.authCookie.value}`,
            },
          });
          appendSetCookieHeaders(headers, mailRes.headers);
        } catch (err) {
          console.warn("[auth] mail sign-out failed", err);
        }
      }

      const localRes = await auth.handler(request);
      appendSetCookieHeaders(headers, localRes.headers);
      return new Response(null, { status: 200, headers });
    }

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

      if (!isSignup) {
        const mailRes = await fetch(mailAppUrl(env, "/api/auth/sign-in/email"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (mailRes.ok) {
          const headers = new Headers();
          headers.set("location", "/");
          appendSetCookieHeaders(headers, mailRes.headers);
          return new Response(null, { status: 303, headers });
        }
        return html(loginPage("signin", await readAuthError(mailRes)), mailRes.status);
      }

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
      const msg = await readAuthError(innerRes);
      return html(loginPage(isSignup ? "signup" : "signin", msg), innerRes.status);
    }

    if (url.pathname === "/sync/webhook" && request.method === "POST") {
      return handleSyncWebhook(env, request);
    }

    if (url.pathname === "/api/realtimekit/webhook" && request.method === "POST") {
      return handleRealtimeKitWebhook(env, request);
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

    const session = await getCurrentSession(env, request, auth);

    if (url.pathname === "/") {
      if (!session) {
        const mode = url.searchParams.get("mode") === "signup" ? "signup" : "signin";
        return html(loginPage(mode));
      }
      const { year, month } = parseMonth(url.searchParams.get("ym"));
      const { start, end } = monthRange(year, month);
      const events = await listEventsInRange(env, session.user.id, start, end, session);
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

    if (url.pathname === "/tasks") {
      if (!session) {
        const mode = url.searchParams.get("mode") === "signup" ? "signup" : "signin";
        return html(loginPage(mode));
      }
      return html(tasksView({ userEmail: session.user.email }));
    }

    if (url.pathname === "/tasks-data") {
      if (!session) return json({ error: "unauthorized" }, 401);
      if (request.method === "GET") {
        return json({ tasks: await listSharedTasks(env, session.user.email) });
      }
      if (request.method === "POST") {
        const body = (await request.json().catch(() => null)) as {
          title?: string;
          date?: string | null;
          scheduledTime?: string | null;
          plannedTime?: number | null;
        } | null;
        if (!body) return json({ error: "invalid input" }, 400);
        const title = body.title?.trim();
        if (!title) return json({ error: "title required" }, 400);
        if (body.date && !isValidTaskDate(body.date)) return json({ error: "invalid date" }, 400);
        if (body.scheduledTime && !isValidTaskTime(body.scheduledTime)) return json({ error: "invalid time" }, 400);
        const task = await createSharedTask(env, session.user.email, session.user.name, {
          title,
          date: body.date,
          scheduledTime: body.scheduledTime,
          plannedTime: body.plannedTime,
        });
        return json({ task }, 201);
      }
      return json({ error: "method not allowed" }, 405);
    }

    if (url.pathname.startsWith("/tasks-data/")) {
      if (!session) return json({ error: "unauthorized" }, 401);
      const rest = url.pathname.slice("/tasks-data/".length);
      if (rest.endsWith("/complete") && request.method === "POST") {
        const id = rest.slice(0, -"/complete".length);
        const task = await toggleSharedTask(env, session.user.email, decodeURIComponent(id));
        return task ? json({ task }) : json({ error: "not found" }, 404);
      }
      if (request.method === "DELETE") {
        const ok = await archiveSharedTask(env, session.user.email, decodeURIComponent(rest));
        return json({ ok }, ok ? 200 : 404);
      }
      return json({ error: "method not allowed" }, 405);
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
          date,
          session
        );
        return json(events);
      }
      if (request.method === "POST") {
        await ensureEventsSchema(env);
        const body = (await request.json().catch(() => null)) as {
          event_date?: string;
          title?: string;
          start_time?: string | null;
          description?: string | null;
          location?: string | null;
          invitee_email?: string | null;
          meeting_id?: string | null;
          waiting_room_enabled?: boolean | number | null;
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
          meeting_id: body.meeting_id ? body.meeting_id.slice(0, 80) : null,
          host_email: session.user.email,
          waiting_room_enabled: Boolean(body.waiting_room_enabled),
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
        waiting_room_enabled?: boolean;
      } | null;
      const title = (body?.title || "Calendar video call").slice(0, 100);
      try {
        if (body?.waiting_room_enabled) {
          await ensureRealtimeKitWaitingRoomPreset(env);
        }
        const meeting = await createRealtimeKitMeeting(env, title);
        ctx.waitUntil(
          ensureRealtimeKitWebhook(env, webhookUrl(env, url.origin)).catch((err) => {
            console.error("[realtimekit] webhook setup failed", err);
          })
        );
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
      await ensureEventsSchema(env);
      const event = await getEventByMeetingId(env, meetingId);
      if (!session && !isValidEmail(guestEmail)) {
        return html(loginPage("signin", "Sign in to join the video call"), 401);
      }
      try {
        const isHost = Boolean(
          session &&
            event &&
            (event.user_id === session.user.id || event.host_email === session.user.email)
        );
        const participant = await addRealtimeKitParticipant(env, meetingId, {
          id: session?.user.id ?? "guest",
          email: session?.user.email ?? guestEmail,
          name: session?.user.name ?? guestEmail,
          role: isHost ? "host" : "participant",
          waitingRoomEnabled: Boolean(event?.waiting_room_enabled),
        });
        return html(meetingPage({ authToken: participant.token, meetingId, isHost }));
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

    if (url.pathname.startsWith("/api/realtimekit/recording/") && request.method === "POST") {
      if (!session) return json({ error: "unauthorized" }, 401);
      const parts = url.pathname.split("/");
      const meetingId = parts[4];
      const action = parts[5] as "start" | "pause" | "resume" | "stop" | undefined;
      if (!meetingId || !action) return json({ error: "missing recording action" }, 400);
      await ensureEventsSchema(env);
      const event = await getEventByMeetingId(env, meetingId);
      const isHost = Boolean(event && (event.user_id === session.user.id || event.host_email === session.user.email));
      if (!isHost) return json({ error: "forbidden" }, 403);
      try {
        if (action === "start") {
          const recording = await startRealtimeKitRecording(env, meetingId);
          return json({ recording });
        }
        if (action === "pause" || action === "resume" || action === "stop") {
          const active = await getActiveRealtimeKitRecording(env, meetingId);
          if (!active) return json({ error: "no active recording" }, 404);
          const recording = await updateRealtimeKitRecording(env, active.id, action);
          return json({ recording });
        }
        return json({ error: "invalid recording action" }, 400);
      } catch (err) {
        console.error("[realtimekit] recording action failed", err);
        return json(
          {
            error:
              err instanceof Error ? err.message : "Could not update recording",
          },
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
