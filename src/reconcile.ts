import type { Env } from "./env";

interface UserPair {
  cal_user_id: string;
  cal_email: string;
  dp_user_id: string;
}

interface DpTaskRow {
  id: string;
  title: string;
  description: string | null;
  startDate: string | null;
  scheduledTime: string | null;
  completed: number;
  cal_event_id: string | null;
  updatedAt: string | null;
  userId: string;
}

interface CalEventRow {
  id: string;
  user_id: string;
  event_date: string;
  start_time: string | null;
  title: string;
  description: string | null;
  completed: number;
  dp_task_id: string | null;
  updated_at: number;
}

const sqliteTextToMs = (s: string | null): number => {
  if (!s) return 0;
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

const taskDateFields = (
  task: DpTaskRow
): { event_date: string; start_time: string | null } | null => {
  if (!task.startDate) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(task.startDate);
  if (!m) return null;
  let start_time: string | null = null;
  if (task.scheduledTime) {
    const tm = /^(\d{1,2}:\d{2})/.exec(task.scheduledTime);
    if (tm) {
      const [hh, mm] = tm[1].split(":");
      start_time = `${hh.padStart(2, "0")}:${mm}`;
    }
  }
  return { event_date: m[1], start_time };
};

const eventToSqliteStartDate = (
  event_date: string,
  start_time: string | null
): string => {
  const time = start_time ?? "00:00";
  return `${event_date} ${time}:00`;
};

const findUserPairs = async (env: Env): Promise<UserPair[]> => {
  const { results: calUsers } = await env.DB.prepare(
    `SELECT id, email FROM user`
  ).all<{ id: string; email: string }>();
  if (!calUsers || calUsers.length === 0) return [];
  const pairs: UserPair[] = [];
  for (const cu of calUsers) {
    const dp = await env.DP_DB.prepare(
      `SELECT id FROM User WHERE lower(email) = lower(?) LIMIT 1`
    )
      .bind(cu.email)
      .first<{ id: string }>();
    if (dp) {
      pairs.push({
        cal_user_id: cu.id,
        cal_email: cu.email,
        dp_user_id: dp.id,
      });
    }
  }
  return pairs;
};

const fmtNow = (): string =>
  new Date().toISOString().replace("T", " ").substring(0, 19);

export const reconcile = async (env: Env): Promise<{
  pairs: number;
  cal_created: number;
  dp_created: number;
  cal_updated: number;
  dp_updated: number;
}> => {
  const pairs = await findUserPairs(env);
  let cal_created = 0;
  let dp_created = 0;
  let cal_updated = 0;
  let dp_updated = 0;

  for (const pair of pairs) {
    const { results: dpTasks } = await env.DP_DB.prepare(
      `SELECT id, title, description, startDate, scheduledTime, completed, cal_event_id, updatedAt, userId FROM Task WHERE userId = ? AND archived = 0`
    )
      .bind(pair.dp_user_id)
      .all<DpTaskRow>();

    const { results: calEvents } = await env.DB.prepare(
      `SELECT id, user_id, event_date, start_time, title, description, completed, dp_task_id, updated_at FROM cal_event WHERE user_id = ?`
    )
      .bind(pair.cal_user_id)
      .all<CalEventRow>();

    const calById = new Map<string, CalEventRow>(
      (calEvents ?? []).map((e) => [e.id, e])
    );
    const calByDpId = new Map<string, CalEventRow>();
    for (const e of calEvents ?? []) {
      if (e.dp_task_id) calByDpId.set(e.dp_task_id, e);
    }
    const dpById = new Map<string, DpTaskRow>(
      (dpTasks ?? []).map((t) => [t.id, t])
    );

    for (const task of dpTasks ?? []) {
      const dates = taskDateFields(task);
      if (!dates) {
        if (task.cal_event_id && calById.has(task.cal_event_id)) {
          await env.DB.prepare(
            `DELETE FROM cal_event WHERE id = ? AND user_id = ?`
          )
            .bind(task.cal_event_id, pair.cal_user_id)
            .run();
        }
        if (task.cal_event_id) {
          await env.DP_DB.prepare(
            `UPDATE Task SET cal_event_id = NULL WHERE id = ?`
          )
            .bind(task.id)
            .run();
        }
        continue;
      }

      const existing =
        (task.cal_event_id && calById.get(task.cal_event_id)) ||
        calByDpId.get(task.id);

      const taskUpdatedMs = sqliteTextToMs(task.updatedAt);

      if (!existing) {
        const newId = crypto.randomUUID();
        const now = Date.now();
        await env.DB.prepare(
          `INSERT INTO cal_event (id, user_id, event_date, start_time, title, description, created_at, updated_at, dp_task_id, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            newId,
            pair.cal_user_id,
            dates.event_date,
            dates.start_time,
            task.title,
            task.description,
            now,
            now,
            task.id,
            task.completed ? 1 : 0
          )
          .run();
        await env.DP_DB.prepare(
          `UPDATE Task SET cal_event_id = ? WHERE id = ?`
        )
          .bind(newId, task.id)
          .run();
        cal_created += 1;
        continue;
      }

      const driftCal =
        existing.title !== task.title ||
        existing.event_date !== dates.event_date ||
        existing.start_time !== dates.start_time ||
        (existing.description ?? null) !== (task.description ?? null) ||
        (existing.completed ? 1 : 0) !== (task.completed ? 1 : 0);

      if (driftCal && taskUpdatedMs >= existing.updated_at) {
        const now = Date.now();
        await env.DB.prepare(
          `UPDATE cal_event SET title = ?, event_date = ?, start_time = ?, description = ?, completed = ?, dp_task_id = ?, updated_at = ? WHERE id = ?`
        )
          .bind(
            task.title,
            dates.event_date,
            dates.start_time,
            task.description,
            task.completed ? 1 : 0,
            task.id,
            now,
            existing.id
          )
          .run();
        cal_updated += 1;
      } else if (driftCal) {
        await env.DP_DB.prepare(
          `UPDATE Task SET title = ?, description = ?, startDate = ?, scheduledTime = ?, completed = ?, completedAt = ?, cal_event_id = ?, updatedAt = ? WHERE id = ?`
        )
          .bind(
            existing.title,
            existing.description,
            eventToSqliteStartDate(existing.event_date, existing.start_time),
            existing.start_time,
            existing.completed,
            existing.completed ? fmtNow() : null,
            existing.id,
            fmtNow(),
            task.id
          )
          .run();
        dp_updated += 1;
      }

      if (existing.dp_task_id !== task.id) {
        await env.DB.prepare(
          `UPDATE cal_event SET dp_task_id = ? WHERE id = ?`
        )
          .bind(task.id, existing.id)
          .run();
      }
    }

    for (const ev of calEvents ?? []) {
      if (ev.dp_task_id && dpById.has(ev.dp_task_id)) continue;
      const newId = crypto.randomUUID();
      const startDateSql = eventToSqliteStartDate(ev.event_date, ev.start_time);
      const now = fmtNow();
      await env.DP_DB.prepare(
        `INSERT INTO Task (id, title, description, notes, startDate, scheduledTime, plannedTime, actualTime, completed, completedAt, priority, sortOrder, archived, userId, cal_event_id, createdAt, updatedAt) VALUES (?, ?, ?, '', ?, ?, 0, 0, ?, ?, 'normal', 0, 0, ?, ?, ?, ?)`
      )
        .bind(
          newId,
          ev.title,
          ev.description ?? "",
          startDateSql,
          ev.start_time,
          ev.completed ? 1 : 0,
          ev.completed ? now : null,
          pair.dp_user_id,
          ev.id,
          now,
          now
        )
        .run();
      await env.DB.prepare(
        `UPDATE cal_event SET dp_task_id = ? WHERE id = ?`
      )
        .bind(newId, ev.id)
        .run();
      dp_created += 1;
    }
  }

  return { pairs: pairs.length, cal_created, dp_created, cal_updated, dp_updated };
};
