import type { CalEvent } from "./events";

const esc = (s: string | null | undefined): string => {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const layout = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; --accent: #4f46e5; --border: rgba(127,127,127,0.25); }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  header { display: flex; align-items: center; gap: 1rem; padding: 1rem 1.5rem; border-bottom: 1px solid var(--border); }
  header h1 { margin: 0; font-size: 1.1rem; font-weight: 600; }
  header nav { margin-left: auto; display: flex; gap: 1rem; align-items: center; }
  main { max-width: 1100px; margin: 0 auto; padding: 1.5rem; }
  .auth-card { max-width: 360px; margin: 4rem auto; padding: 2rem; border: 1px solid var(--border); border-radius: 12px; }
  .auth-card h2 { margin-top: 0; }
  .auth-card label { display: block; margin: 0.75rem 0 0.25rem; font-size: 0.85rem; opacity: 0.8; }
  .auth-card input { width: 100%; padding: 0.6rem 0.75rem; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: inherit; font: inherit; }
  .auth-card button { margin-top: 1rem; width: 100%; padding: 0.65rem; border: 0; border-radius: 6px; background: var(--accent); color: #fff; font: inherit; cursor: pointer; }
  .auth-card .switch { margin-top: 1rem; font-size: 0.85rem; text-align: center; opacity: 0.8; }
  .auth-card .err { color: #d33; font-size: 0.85rem; margin-top: 0.75rem; min-height: 1em; }

  .toolbar { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
  .toolbar h2 { margin: 0; font-size: 1.25rem; }
  .toolbar .spacer { flex: 1; }
  .toolbar a.btn, .toolbar button { padding: 0.4rem 0.75rem; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: inherit; font: inherit; cursor: pointer; }

  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .dow { background: var(--border); padding: 0.5rem; font-size: 0.75rem; text-transform: uppercase; opacity: 0.7; text-align: center; }
  .cell { background: Canvas; min-height: 92px; padding: 0.4rem 0.5rem; position: relative; cursor: pointer; }
  .cell.muted { opacity: 0.4; }
  .cell.today .daynum { background: var(--accent); color: #fff; }
  .daynum { display: inline-block; min-width: 1.75em; height: 1.75em; line-height: 1.75em; text-align: center; border-radius: 50%; font-size: 0.85rem; }
  .events { margin-top: 0.25rem; display: flex; flex-direction: column; gap: 2px; }
  .pill { background: var(--accent); color: #fff; border-radius: 3px; padding: 1px 5px; font-size: 0.72rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cell .tooltip { display: none; position: absolute; z-index: 10; top: 100%; left: 0.5rem; min-width: 200px; max-width: 280px; background: Canvas; border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.6rem; box-shadow: 0 6px 24px rgba(0,0,0,0.15); font-size: 0.85rem; }
  .cell:hover .tooltip { display: block; }
  .tooltip .ev { padding: 3px 0; border-bottom: 1px dashed var(--border); }
  .tooltip .ev:last-child { border-bottom: 0; }
  .tooltip .ev-title { font-weight: 600; }
  .tooltip .ev-meta { opacity: 0.7; font-size: 0.78rem; }
  .tooltip .empty { opacity: 0.6; font-style: italic; }

  dialog { border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; max-width: 380px; width: 90%; background: Canvas; color: inherit; }
  dialog::backdrop { background: rgba(0,0,0,0.4); }
  dialog h3 { margin: 0 0 0.75rem; }
  dialog label { display: block; margin: 0.5rem 0 0.2rem; font-size: 0.8rem; opacity: 0.8; }
  dialog input, dialog textarea { width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: 5px; background: transparent; color: inherit; font: inherit; }
  dialog .actions { display: flex; gap: 0.5rem; margin-top: 1rem; justify-content: flex-end; }
  dialog button { padding: 0.45rem 0.85rem; border: 1px solid var(--border); border-radius: 5px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
  dialog button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .day-events { margin-top: 0.5rem; max-height: 180px; overflow-y: auto; }
  .day-events .row { display: flex; gap: 0.5rem; align-items: center; padding: 4px 0; border-bottom: 1px dashed var(--border); }
  .day-events .row:last-child { border-bottom: 0; }
  .day-events .row .meta { flex: 1; font-size: 0.85rem; }
  .day-events .row button { font-size: 0.75rem; padding: 0.2rem 0.5rem; }
</style>
</head>
<body>
${body}
</body>
</html>`;

export const loginPage = (mode: "signin" | "signup" = "signin", error?: string): string => {
  const isSignup = mode === "signup";
  return layout(
    isSignup ? "cal · sign up" : "cal · sign in",
    `<main>
<form class="auth-card" id="auth-form" data-mode="${mode}">
  <h2>${isSignup ? "Create your cal account" : "Sign in to cal"}</h2>
  ${
    isSignup
      ? `<label for="name">Name</label><input id="name" name="name" autocomplete="name" required />`
      : ""
  }
  <label for="email">Email</label>
  <input id="email" name="email" type="email" autocomplete="email" required />
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" required minlength="8" />
  <button type="submit">${isSignup ? "Sign up" : "Sign in"}</button>
  <div class="err" id="err">${esc(error ?? "")}</div>
  <div class="switch">
    ${
      isSignup
        ? `Have an account? <a href="/?mode=signin">Sign in</a>`
        : `New here? <a href="/?mode=signup">Sign up</a>`
    }
  </div>
</form>
<script>
(() => {
  const form = document.getElementById('auth-form');
  const errEl = document.getElementById('err');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    const mode = form.dataset.mode;
    const fd = new FormData(form);
    const body = {
      email: fd.get('email'),
      password: fd.get('password'),
    };
    if (mode === 'signup') body.name = fd.get('name');
    const endpoint = mode === 'signup' ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      if (!res.ok) {
        let msg = 'Authentication failed';
        try { const j = await res.json(); msg = j.message || j.error || msg; } catch {}
        errEl.textContent = msg;
        return;
      }
      window.location.href = '/';
    } catch (err) {
      errEl.textContent = 'Network error';
    }
  });
})();
</script>
</main>`
  );
};

interface MonthViewInput {
  userEmail: string;
  year: number;
  month: number;
  events: CalEvent[];
  today: { y: number; m: number; d: number };
}

const monthLabel = (year: number, month: number): string => {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};

const ymd = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const shiftMonth = (y: number, m: number, delta: number): { y: number; m: number } => {
  let nm = m + delta;
  let ny = y;
  while (nm < 1) {
    nm += 12;
    ny -= 1;
  }
  while (nm > 12) {
    nm -= 12;
    ny += 1;
  }
  return { y: ny, m: nm };
};

export const monthView = ({ userEmail, year, month, events, today }: MonthViewInput): string => {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startDow = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prevMonthDays = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();

  const eventsByDate = new Map<string, CalEvent[]>();
  for (const ev of events) {
    const arr = eventsByDate.get(ev.event_date) ?? [];
    arr.push(ev);
    eventsByDate.set(ev.event_date, arr);
  }

  const cells: string[] = [];
  for (let i = 0; i < startDow; i++) {
    const d = prevMonthDays - startDow + 1 + i;
    const prev = shiftMonth(year, month, -1);
    cells.push(renderCell(prev.y, prev.m, d, true, eventsByDate, today));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(renderCell(year, month, d, false, eventsByDate, today));
  }
  const totalSoFar = cells.length;
  const trailing = (7 - (totalSoFar % 7)) % 7;
  for (let i = 1; i <= trailing; i++) {
    const next = shiftMonth(year, month, 1);
    cells.push(renderCell(next.y, next.m, i, true, eventsByDate, today));
  }

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  const dowLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    .map((l) => `<div class="dow">${l}</div>`)
    .join("");

  const body = `<header>
  <h1>cal</h1>
  <nav>
    <span>${esc(userEmail)}</span>
    <a href="#" id="signout">Sign out</a>
  </nav>
</header>
<main>
  <div class="toolbar">
    <a class="btn" href="/?ym=${prev.y}-${String(prev.m).padStart(2, "0")}">‹ Prev</a>
    <h2>${esc(monthLabel(year, month))}</h2>
    <a class="btn" href="/?ym=${next.y}-${String(next.m).padStart(2, "0")}">Next ›</a>
    <a class="btn" href="/">Today</a>
    <span class="spacer"></span>
  </div>
  <div class="grid">${dowLabels}${cells.join("")}</div>
</main>
<dialog id="day-dialog">
  <h3 id="dlg-title">Day</h3>
  <div class="day-events" id="dlg-events"></div>
  <form id="add-form">
    <label>Title</label><input name="title" required maxlength="200" />
    <label>Time (optional, e.g. 09:30)</label><input name="start_time" pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$" />
    <label>Description (optional)</label><textarea name="description" rows="2" maxlength="1000"></textarea>
    <input type="hidden" name="event_date" />
    <div class="actions">
      <button type="button" id="dlg-close">Close</button>
      <button type="submit" class="primary">Add event</button>
    </div>
  </form>
</dialog>
<script>
(() => {
  const dialog = document.getElementById('day-dialog');
  const dlgTitle = document.getElementById('dlg-title');
  const dlgEvents = document.getElementById('dlg-events');
  const addForm = document.getElementById('add-form');

  function fmtMeta(ev) {
    const t = ev.start_time ? ev.start_time + ' · ' : '';
    return t + (ev.description || '');
  }

  function renderEvents(list) {
    if (!list.length) {
      dlgEvents.innerHTML = '<div class="empty" style="opacity:.6;font-style:italic">No events yet.</div>';
      return;
    }
    dlgEvents.innerHTML = list.map(ev => {
      return '<div class="row" data-id="' + ev.id + '">' +
        '<div class="meta"><div><strong>' + escapeHtml(ev.title) + '</strong></div>' +
        '<div style="opacity:.7;font-size:.78rem">' + escapeHtml(fmtMeta(ev)) + '</div></div>' +
        '<button type="button" data-del="' + ev.id + '">Delete</button>' +
        '</div>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function fetchDay(date) {
    const res = await fetch('/events?date=' + encodeURIComponent(date), { credentials: 'include' });
    if (!res.ok) return [];
    return await res.json();
  }

  document.querySelectorAll('.cell[data-date]').forEach(cell => {
    cell.addEventListener('click', async (e) => {
      if (e.target.closest('.tooltip')) return;
      const date = cell.dataset.date;
      dlgTitle.textContent = date;
      addForm.elements.event_date.value = date;
      addForm.reset();
      addForm.elements.event_date.value = date;
      const list = await fetchDay(date);
      renderEvents(list);
      dialog.showModal();
    });
  });

  document.getElementById('dlg-close').addEventListener('click', () => dialog.close());

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(addForm);
    const body = {
      event_date: fd.get('event_date'),
      title: fd.get('title'),
      start_time: fd.get('start_time') || null,
      description: fd.get('description') || null,
    };
    const res = await fetch('/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include',
    });
    if (res.ok) {
      window.location.reload();
    }
  });

  dlgEvents.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-del]');
    if (!btn) return;
    const id = btn.dataset.del;
    const res = await fetch('/events/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' });
    if (res.ok) window.location.reload();
  });

  document.getElementById('signout').addEventListener('click', async (e) => {
    e.preventDefault();
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
    window.location.href = '/';
  });
})();
</script>`;

  return layout(`cal · ${monthLabel(year, month)}`, body);
};

const renderCell = (
  y: number,
  m: number,
  d: number,
  muted: boolean,
  eventsByDate: Map<string, CalEvent[]>,
  today: { y: number; m: number; d: number }
): string => {
  const date = ymd(y, m, d);
  const evs = eventsByDate.get(date) ?? [];
  const isToday = !muted && y === today.y && m === today.m && d === today.d;
  const pills = evs
    .slice(0, 3)
    .map((e) => `<div class="pill" title="${esc(e.title)}">${esc(e.title)}</div>`)
    .join("");
  const tooltipInner = evs.length
    ? evs
        .map(
          (e) =>
            `<div class="ev"><div class="ev-title">${esc(e.title)}</div>` +
            (e.start_time || e.description
              ? `<div class="ev-meta">${esc(e.start_time ?? "")}${e.start_time && e.description ? " · " : ""}${esc(e.description ?? "")}</div>`
              : "") +
            `</div>`
        )
        .join("")
    : `<div class="empty">No events</div>`;
  return `<div class="cell${muted ? " muted" : ""}${isToday ? " today" : ""}" data-date="${date}">
    <span class="daynum">${d}</span>
    <div class="events">${pills}${evs.length > 3 ? `<div class="pill" style="opacity:.7">+${evs.length - 3} more</div>` : ""}</div>
    <div class="tooltip">${tooltipInner}</div>
  </div>`;
};
