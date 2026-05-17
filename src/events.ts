import type { Env } from "./env";

export interface CalEvent {
  id: string;
  user_id: string;
  event_date: string;
  start_time: string | null;
  title: string;
  description: string | null;
  created_at: number;
}

export const eventsTableDDL = `
CREATE TABLE IF NOT EXISTS cal_event (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_date TEXT NOT NULL,
  start_time TEXT,
  title TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cal_event_user_date_idx ON cal_event (user_id, event_date);
`;

const randomId = (): string => crypto.randomUUID();

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

export const createEvent = async (
  env: Env,
  userId: string,
  input: { event_date: string; title: string; start_time?: string | null; description?: string | null }
): Promise<CalEvent> => {
  const id = randomId();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO cal_event (id, user_id, event_date, start_time, title, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      userId,
      input.event_date,
      input.start_time ?? null,
      input.title,
      input.description ?? null,
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
    created_at: now,
  };
};

export const deleteEvent = async (env: Env, userId: string, id: string): Promise<boolean> => {
  const result = await env.DB.prepare(
    `DELETE FROM cal_event WHERE id = ? AND user_id = ?`
  )
    .bind(id, userId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
};
