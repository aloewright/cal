import type { Env } from "./env";

export interface CalEvent {
  id: string;
  user_id: string;
  event_date: string;
  start_time: string | null;
  title: string;
  description: string | null;
  location: string | null;
  invitee_email: string | null;
  created_at: number;
  updated_at: number;
  dp_task_id: string | null;
  completed: number;
}

export const eventsTableDDL = `
CREATE TABLE IF NOT EXISTS cal_event (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_date TEXT NOT NULL,
  start_time TEXT,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  invitee_email TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  dp_task_id TEXT,
  completed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cal_event_user_date_idx ON cal_event (user_id, event_date);
CREATE INDEX IF NOT EXISTS cal_event_dp_task_idx ON cal_event (dp_task_id);
`;

const randomId = (): string => crypto.randomUUID();

export const ensureEventsSchema = async (env: Env): Promise<void> => {
  const statements = eventsTableDDL
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));

  const { results } = await env.DB.prepare(`PRAGMA table_info(cal_event)`).all<{
    name: string;
  }>();
  const columns = new Set((results ?? []).map((column) => column.name));
  const additions = [
    ["location", `ALTER TABLE cal_event ADD COLUMN location TEXT`],
    ["invitee_email", `ALTER TABLE cal_event ADD COLUMN invitee_email TEXT`],
  ] as const;
  for (const [column, statement] of additions) {
    if (!columns.has(column)) {
      await env.DB.prepare(statement).run();
    }
  }
};

export const listEventsInRange = async (
  env: Env,
  userId: string,
  startDate: string,
  endDate: string
): Promise<CalEvent[]> => {
  const { results } = await env.DB.prepare(
    `SELECT * FROM cal_event WHERE user_id = ? AND event_date >= ? AND event_date <= ? ORDER BY event_date, start_time`
  )
    .bind(userId, startDate, endDate)
    .all<CalEvent>();
  return results ?? [];
};

export const getEventById = async (
  env: Env,
  userId: string,
  id: string
): Promise<CalEvent | null> => {
  return await env.DB.prepare(
    `SELECT * FROM cal_event WHERE id = ? AND user_id = ?`
  )
    .bind(id, userId)
    .first<CalEvent>();
};

export const createEvent = async (
  env: Env,
  userId: string,
  input: {
    event_date: string;
    title: string;
    start_time?: string | null;
    description?: string | null;
    location?: string | null;
    invitee_email?: string | null;
  }
): Promise<CalEvent> => {
  const id = randomId();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cal_event (id, user_id, event_date, start_time, title, description, location, invitee_email, created_at, updated_at, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
  )
    .bind(
      id,
      userId,
      input.event_date,
      input.start_time ?? null,
      input.title,
      input.description ?? null,
      input.location ?? null,
      input.invitee_email ?? null,
      now,
      now
    )
    .run();
  return {
    id,
    user_id: userId,
    event_date: input.event_date,
    start_time: input.start_time ?? null,
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    invitee_email: input.invitee_email ?? null,
    created_at: now,
    updated_at: now,
    dp_task_id: null,
    completed: 0,
  };
};

export const deleteEvent = async (
  env: Env,
  userId: string,
  id: string
): Promise<{ deleted: boolean; dp_task_id: string | null }> => {
  const existing = await env.DB.prepare(
    `SELECT dp_task_id FROM cal_event WHERE id = ? AND user_id = ?`
  )
    .bind(id, userId)
    .first<{ dp_task_id: string | null }>();
  if (!existing) return { deleted: false, dp_task_id: null };
  await env.DB.prepare(`DELETE FROM cal_event WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();
  return { deleted: true, dp_task_id: existing.dp_task_id };
};
