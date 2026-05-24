import type { Env } from "./env";
import type { AppSession } from "./auth";
import { listTimedTasksInRange } from "./tasks";

export interface CalEvent {
  id: string;
  user_id: string;
  event_date: string;
  start_time: string | null;
  title: string;
  description: string | null;
  location: string | null;
  invitee_email: string | null;
  meeting_id: string | null;
  host_email: string | null;
  waiting_room_enabled: number;
  ai_summary_sent_at: number | null;
  ai_summary_session_id: string | null;
  created_at: number;
  updated_at: number;
  dp_task_id: string | null;
  completed: number;
  source?: "local" | "google" | "task";
  read_only?: number;
  calendar_summary?: string | null;
  calendar_color?: string | null;
  access_role?: string | null;
  writable?: number;
  html_link?: string | null;
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
  meeting_id TEXT,
  host_email TEXT,
  waiting_room_enabled INTEGER NOT NULL DEFAULT 0,
  ai_summary_sent_at INTEGER,
  ai_summary_session_id TEXT,
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
    ["meeting_id", `ALTER TABLE cal_event ADD COLUMN meeting_id TEXT`],
    ["host_email", `ALTER TABLE cal_event ADD COLUMN host_email TEXT`],
    ["waiting_room_enabled", `ALTER TABLE cal_event ADD COLUMN waiting_room_enabled INTEGER NOT NULL DEFAULT 0`],
    ["ai_summary_sent_at", `ALTER TABLE cal_event ADD COLUMN ai_summary_sent_at INTEGER`],
    ["ai_summary_session_id", `ALTER TABLE cal_event ADD COLUMN ai_summary_session_id TEXT`],
  ] as const;
  for (const [column, statement] of additions) {
    if (!columns.has(column)) {
      await env.DB.prepare(statement).run();
    }
  }
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS cal_event_meeting_idx ON cal_event (meeting_id)`
  ).run();
};

export const listEventsInRange = async (
  env: Env,
  userId: string,
  startDate: string,
  endDate: string,
  session?: AppSession
): Promise<CalEvent[]> => {
  const { results } = await env.DB.prepare(
    `SELECT * FROM cal_event WHERE user_id = ? AND event_date >= ? AND event_date <= ? ORDER BY event_date, start_time`
  )
    .bind(userId, startDate, endDate)
    .all<CalEvent>();
  const localEvents = (results ?? [])
    .filter((event) => !event.dp_task_id)
    .map((event) => ({
      ...event,
      source: "local" as const,
      read_only: 0,
      writable: 1,
    }));
  const googleEvents = session?.source === "mail"
    ? await listGoogleEventsInRange(env, session, startDate, endDate)
    : [];
  const taskEvents = session?.user.email
    ? (await listTimedTasksInRange(env, session.user.email, startDate, endDate)).map((task) => ({
        id: `task:${task.id}`,
        user_id: userId,
        event_date: task.startDate?.slice(0, 10) ?? startDate,
        start_time: task.scheduledTime,
        title: task.title,
        description: task.plannedTime > 0 ? `${task.plannedTime} minute task` : null,
        location: null,
        invitee_email: null,
        meeting_id: null,
        host_email: null,
        waiting_room_enabled: 0,
        ai_summary_sent_at: null,
        ai_summary_session_id: null,
        created_at: Date.parse(task.createdAt) || 0,
        updated_at: Date.parse(task.updatedAt) || 0,
        dp_task_id: task.id,
        completed: task.completed ? 1 : 0,
        source: "task" as const,
        read_only: 0,
        writable: 1,
      }))
    : [];
  return [...localEvents, ...taskEvents, ...googleEvents].sort((a, b) => (
    a.event_date.localeCompare(b.event_date) ||
    (a.start_time ?? "").localeCompare(b.start_time ?? "") ||
    a.title.localeCompare(b.title)
  ));
};

interface MailCalendarEvent {
  id: string;
  calendarSummary: string;
  calendarColor: string | null;
  accessRole: string | null;
  writable: boolean;
  title: string;
  description: string | null;
  eventDate: string;
  startTime: string | null;
  htmlLink: string | null;
  source: "google";
}

async function listGoogleEventsInRange(
  env: Env,
  session: AppSession,
  startDate: string,
  endDate: string
): Promise<CalEvent[]> {
  if (!session.authCookie) return [];

  const url = new URL("/api/v1/calendars/events", env.MAIL_APP_URL ?? "https://mail.fly.pm");
  url.searchParams.set("start", startDate);
  url.searchParams.set("end", endDate);

  const res = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      cookie: `${session.authCookie.name}=${session.authCookie.value}`,
    },
  });
  if (!res.ok) {
    console.warn("[google-calendar] mail event fetch failed", res.status);
    return [];
  }

  const data = (await res.json().catch(() => null)) as { events?: MailCalendarEvent[] } | null;
  return (data?.events ?? []).map((event) => ({
    id: `google:${event.id}`,
    user_id: "",
    event_date: event.eventDate,
    start_time: event.startTime,
    title: event.title,
    description: event.description,
    location: null,
    invitee_email: null,
    meeting_id: null,
    host_email: null,
    waiting_room_enabled: 0,
    ai_summary_sent_at: null,
    ai_summary_session_id: null,
    created_at: 0,
    updated_at: 0,
    dp_task_id: null,
    completed: 0,
    source: "google",
    read_only: event.writable ? 0 : 1,
    calendar_summary: event.calendarSummary,
    calendar_color: event.calendarColor,
    access_role: event.accessRole,
    writable: event.writable ? 1 : 0,
    html_link: event.htmlLink,
  }));
}

export const getEventByMeetingId = async (
  env: Env,
  meetingId: string
): Promise<CalEvent | null> => {
  return await env.DB.prepare(
    `SELECT * FROM cal_event WHERE meeting_id = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(meetingId)
    .first<CalEvent>();
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
    meeting_id?: string | null;
    host_email?: string | null;
    waiting_room_enabled?: boolean | number | null;
  }
): Promise<CalEvent> => {
  const id = randomId();
  const now = Date.now();
  const waitingRoomEnabled = input.waiting_room_enabled ? 1 : 0;
  await env.DB.prepare(
    `INSERT INTO cal_event (id, user_id, event_date, start_time, title, description, location, invitee_email, meeting_id, host_email, waiting_room_enabled, created_at, updated_at, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
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
      input.meeting_id ?? null,
      input.host_email ?? null,
      waitingRoomEnabled,
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
    meeting_id: input.meeting_id ?? null,
    host_email: input.host_email ?? null,
    waiting_room_enabled: waitingRoomEnabled,
    ai_summary_sent_at: null,
    ai_summary_session_id: null,
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

export const markMeetingSummarySent = async (
  env: Env,
  eventId: string,
  sessionId: string | null
): Promise<void> => {
  await env.DB.prepare(
    `UPDATE cal_event SET ai_summary_sent_at = ?, ai_summary_session_id = ?, updated_at = ? WHERE id = ?`
  )
    .bind(Date.now(), sessionId, Date.now(), eventId)
    .run();
};
