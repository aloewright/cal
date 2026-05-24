import type { Env } from "./env";

export interface SharedTask {
  id: string;
  title: string;
  startDate: string | null;
  scheduledTime: string | null;
  plannedTime: number;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SharedTaskRow {
  id: string;
  title: string;
  startDate: string | null;
  scheduledTime: string | null;
  plannedTime: number | null;
  completed: number | boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSharedTaskInput {
  title: string;
  date?: string | null;
  scheduledTime?: string | null;
  plannedTime?: number | null;
}

const nowSql = (): string => new Date().toISOString().replace("T", " ").slice(0, 19);

const normalizeTask = (row: SharedTaskRow): SharedTask => ({
  id: row.id,
  title: row.title,
  startDate: row.startDate,
  scheduledTime: row.scheduledTime,
  plannedTime: row.plannedTime ?? 0,
  completed: Boolean(row.completed),
  completedAt: row.completedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const today = (): string => new Date().toISOString().slice(0, 10);

export const isValidTaskDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

export const isValidTaskTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export async function ensureTaskUser(env: Env, email: string, name?: string | null): Promise<string> {
  const existing = await env.DP_DB.prepare('SELECT id FROM "User" WHERE lower(email) = lower(?) LIMIT 1')
    .bind(email)
    .first<{ id: string }>();
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  const now = nowSql();
  try {
    await env.DP_DB.prepare('INSERT INTO "User" (id, email, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
      .bind(id, email, name || email.split("@")[0], now, now)
      .run();
    return id;
  } catch {
    const raced = await env.DP_DB.prepare('SELECT id FROM "User" WHERE lower(email) = lower(?) LIMIT 1')
      .bind(email)
      .first<{ id: string }>();
    if (raced) return raced.id;
    throw new Error("Unable to create task user");
  }
}

export async function listSharedTasks(env: Env, email: string): Promise<SharedTask[]> {
  const userId = await ensureTaskUser(env, email);
  const { results } = await env.DP_DB.prepare(
    `SELECT id, title, startDate, scheduledTime, plannedTime, completed, completedAt, createdAt, updatedAt
     FROM "Task"
     WHERE userId = ? AND archived = 0
     ORDER BY completed ASC,
       CASE WHEN startDate IS NULL THEN 1 ELSE 0 END ASC,
       startDate ASC,
       createdAt DESC
     LIMIT 200`
  )
    .bind(userId)
    .all<SharedTaskRow>();
  return (results ?? []).map(normalizeTask);
}

export async function getSharedTask(env: Env, email: string, id: string): Promise<SharedTask | null> {
  const userId = await ensureTaskUser(env, email);
  const row = await env.DP_DB.prepare(
    `SELECT id, title, startDate, scheduledTime, plannedTime, completed, completedAt, createdAt, updatedAt
     FROM "Task"
     WHERE id = ? AND userId = ? AND archived = 0
     LIMIT 1`
  )
    .bind(id, userId)
    .first<SharedTaskRow>();
  return row ? normalizeTask(row) : null;
}

export async function createSharedTask(
  env: Env,
  email: string,
  name: string | null | undefined,
  input: CreateSharedTaskInput
): Promise<SharedTask> {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new Error("title-required");
  const scheduledTime = input.scheduledTime || null;
  if (scheduledTime && !isValidTaskTime(scheduledTime)) throw new Error("invalid-time");
  const date = input.date || (scheduledTime ? today() : null);
  if (date && !isValidTaskDate(date)) throw new Error("invalid-date");

  const userId = await ensureTaskUser(env, email, name);
  const id = crypto.randomUUID();
  const now = nowSql();
  const plannedTime = Math.max(0, Math.min(1440, Math.trunc(input.plannedTime ?? (scheduledTime ? 30 : 0))));
  const startDate = date ? `${date} ${scheduledTime ?? "00:00"}:00` : null;

  await env.DP_DB.prepare(
    `INSERT INTO "Task"
      (id, title, description, notes, startDate, scheduledTime, plannedTime, actualTime,
       completed, completedAt, priority, backlogStatus, sortOrder, archived, userId, createdAt, updatedAt)
     VALUES (?, ?, '', '', ?, ?, ?, 0, 0, NULL, 'normal', ?, 0, 0, ?, ?, ?)`
  )
    .bind(id, title, startDate, scheduledTime, plannedTime, startDate ? null : "backlog", userId, now, now)
    .run();

  const task = await getSharedTask(env, email, id);
  if (!task) throw new Error("create-failed");
  return task;
}

export async function toggleSharedTask(env: Env, email: string, id: string): Promise<SharedTask | null> {
  const userId = await ensureTaskUser(env, email);
  const existing = await getSharedTask(env, email, id);
  if (!existing) return null;

  const now = nowSql();
  const completed = existing.completed ? 0 : 1;
  await env.DP_DB.prepare(
    `UPDATE "Task" SET completed = ?, completedAt = ?, updatedAt = ? WHERE id = ? AND userId = ?`
  )
    .bind(completed, completed ? now : null, now, id, userId)
    .run();

  return getSharedTask(env, email, id);
}

export async function archiveSharedTask(env: Env, email: string, id: string): Promise<boolean> {
  const userId = await ensureTaskUser(env, email);
  const result = await env.DP_DB.prepare(
    `UPDATE "Task" SET archived = 1, updatedAt = ? WHERE id = ? AND userId = ? AND archived = 0`
  )
    .bind(nowSql(), id, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function listTimedTasksInRange(
  env: Env,
  email: string,
  startDate: string,
  endDate: string
): Promise<SharedTask[]> {
  const userId = await ensureTaskUser(env, email);
  const { results } = await env.DP_DB.prepare(
    `SELECT id, title, startDate, scheduledTime, plannedTime, completed, completedAt, createdAt, updatedAt
     FROM "Task"
     WHERE userId = ?
       AND archived = 0
       AND startDate IS NOT NULL
       AND scheduledTime IS NOT NULL
       AND substr(startDate, 1, 10) >= ?
       AND substr(startDate, 1, 10) <= ?
     ORDER BY startDate ASC`
  )
    .bind(userId, startDate, endDate)
    .all<SharedTaskRow>();
  return (results ?? []).map(normalizeTask);
}
