import type { Env } from "./env";

export interface SyncEventPayload {
  op: "upsert" | "delete";
  from: "cal" | "daily-planner";
  user_email: string;
  source_id: string;
  target_id: string | null;
  updated_at: number;
  event?: {
    title: string;
    event_date: string;
    start_time: string | null;
    description: string | null;
    completed: boolean;
  };
}

const isValidDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

const dpTaskToCalEvent = (
  task: { startDate: string | null; scheduledTime: string | null }
): { event_date: string; start_time: string | null } | null => {
  if (!task.startDate) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(task.startDate);
  if (!match) return null;
  const event_date = match[1];
  let start_time: string | null = null;
  if (task.scheduledTime) {
    const tm = /^(\d{1,2}:\d{2})/.exec(task.scheduledTime);
    start_time = tm ? tm[1] : null;
  } else {
    const tm = /\b(\d{2}:\d{2})/.exec(task.startDate);
    start_time = tm ? tm[1] : null;
  }
  return { event_date, start_time };
};

export const sendWebhook = async (
  env: Env,
  payload: SyncEventPayload
): Promise<void> => {
  if (!env.SYNC_SECRET || !env.DP_WEBHOOK_URL) return;
  try {
    await fetch(env.DP_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.SYNC_SECRET}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[sync] webhook send failed", err);
  }
};

export const handleSyncWebhook = async (
  env: Env,
  request: Request
): Promise<Response> => {
  const auth = request.headers.get("authorization") ?? "";
  if (!env.SYNC_SECRET || auth !== `Bearer ${env.SYNC_SECRET}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const payload = (await request.json().catch(() => null)) as SyncEventPayload | null;
  if (!payload || payload.from !== "daily-planner") {
    return new Response(JSON.stringify({ error: "invalid payload" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const userRow = await env.DB.prepare(
    `SELECT id FROM user WHERE lower(email) = lower(?)`
  )
    .bind(payload.user_email)
    .first<{ id: string }>();
  if (!userRow) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_user" }), {
      headers: { "content-type": "application/json" },
    });
  }
  const userId = userRow.id;

  if (payload.op === "delete") {
    if (payload.target_id) {
      await env.DB.prepare(
        `DELETE FROM cal_event WHERE id = ? AND user_id = ?`
      )
        .bind(payload.target_id, userId)
        .run();
    } else {
      await env.DB.prepare(
        `DELETE FROM cal_event WHERE dp_task_id = ? AND user_id = ?`
      )
        .bind(payload.source_id, userId)
        .run();
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  if (!payload.event || !isValidDate(payload.event.event_date)) {
    if (payload.target_id || payload.source_id) {
      await env.DB.prepare(
        `DELETE FROM cal_event WHERE (id = ? OR dp_task_id = ?) AND user_id = ?`
      )
        .bind(payload.target_id ?? "", payload.source_id, userId)
        .run();
    }
    return new Response(JSON.stringify({ ok: true, skipped: "no_date" }), {
      headers: { "content-type": "application/json" },
    });
  }

  const existing = payload.target_id
    ? await env.DB.prepare(
        `SELECT id, updated_at FROM cal_event WHERE id = ? AND user_id = ?`
      )
        .bind(payload.target_id, userId)
        .first<{ id: string; updated_at: number }>()
    : await env.DB.prepare(
        `SELECT id, updated_at FROM cal_event WHERE dp_task_id = ? AND user_id = ?`
      )
        .bind(payload.source_id, userId)
        .first<{ id: string; updated_at: number }>();

  const now = Date.now();
  if (existing) {
    if ((existing.updated_at ?? 0) > payload.updated_at) {
      return new Response(
        JSON.stringify({ ok: true, target_id: existing.id, skipped: "older" }),
        { headers: { "content-type": "application/json" } }
      );
    }
    await env.DB.prepare(
      `UPDATE cal_event SET title = ?, event_date = ?, start_time = ?, description = ?, completed = ?, dp_task_id = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    )
      .bind(
        payload.event.title,
        payload.event.event_date,
        payload.event.start_time,
        payload.event.description,
        payload.event.completed ? 1 : 0,
        payload.source_id,
        now,
        existing.id,
        userId
      )
      .run();
    return new Response(
      JSON.stringify({ ok: true, target_id: existing.id }),
      { headers: { "content-type": "application/json" } }
    );
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO cal_event (id, user_id, event_date, start_time, title, description, created_at, updated_at, dp_task_id, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      userId,
      payload.event.event_date,
      payload.event.start_time,
      payload.event.title,
      payload.event.description,
      now,
      now,
      payload.source_id,
      payload.event.completed ? 1 : 0
    )
    .run();
  return new Response(JSON.stringify({ ok: true, target_id: id }), {
    headers: { "content-type": "application/json" },
  });
};

export const dpTaskDateFields = dpTaskToCalEvent;
