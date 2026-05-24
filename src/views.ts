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
<meta name="theme-color" content="#5a5a61" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<title>${esc(title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Aleo:wght@600;700&family=JetBrains+Mono:wght@500;600&family=Nunito:wght@400;500;600;700;800&display=swap');
  :root {
    color-scheme: light dark;
    --background: oklch(0.9764 0.0013 286.3755);
    --foreground: oklch(0.3538 0.0068 286.0445);
    --card: oklch(1 0 0);
    --muted: oklch(0.961 0.0029 264.5419);
    --muted-foreground: oklch(0.5399 0.0077 286.1392);
    --accent: oklch(0.9482 0.0034 247.8593);
    --accent-foreground: oklch(0.3538 0.0068 286.0445);
    --primary: oklch(0.3538 0.0068 286.0445);
    --primary-foreground: oklch(0.9764 0.0013 286.3755);
    --border: oklch(0.9137 0.004 286.3196);
    --input: oklch(0.9137 0.004 286.3196);
    --sidebar: oklch(0.961 0.0029 264.5419);
    --sidebar-border: oklch(0.9137 0.004 286.3196);
    --font-sans: Nunito, ui-sans-serif, sans-serif, system-ui;
    --font-serif: Aleo, ui-serif, serif;
    --font-mono: JetBrains Mono, ui-monospace, monospace;
    --radius: 0.5rem;
    --shadow-sm: 0px 4px 10px 0px hsl(0 0% 0% / 0.05), 0px 1px 2px -1px hsl(0 0% 0% / 0.05);
    --shadow-lg: 0px 4px 10px 0px hsl(0 0% 0% / 0.05), 0px 4px 6px -1px hsl(0 0% 0% / 0.05);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --background: oklch(0.3538 0.0068 286.0445);
      --foreground: oklch(0.98 0.016 73.684);
      --card: oklch(0.4106 0.0066 286.1057);
      --muted: oklch(0.4106 0.0066 286.1057);
      --muted-foreground: oklch(0.7587 0.0071 286.2303);
      --accent: oklch(0.4697 0.0096 286.0254);
      --accent-foreground: oklch(0.901 0.076 70.697);
      --primary: oklch(0.9152 0.0046 258.3255);
      --primary-foreground: oklch(0.3538 0.0068 286.0445);
      --border: oklch(0.4331 0.0081 286.055);
      --input: oklch(0.4331 0.0081 286.055);
      --sidebar: oklch(0.3147 0.0071 285.9873);
      --sidebar-border: oklch(0.4331 0.0081 286.055);
      --shadow-sm: 0px 8px 15px 0px hsl(0 0% 0% / 0.3), 0px 1px 2px -1px hsl(0 0% 0% / 0.3);
      --shadow-lg: 0px 8px 15px 0px hsl(0 0% 0% / 0.3), 0px 4px 6px -1px hsl(0 0% 0% / 0.3);
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body { background: var(--background); color: var(--foreground); font: 15px/1.45 var(--font-sans); letter-spacing: 0; -webkit-font-smoothing: antialiased; }
  a { color: inherit; text-decoration: none; }
  a:hover { text-decoration: none; }
  .signout-link { position: fixed; z-index: 30; top: 14px; right: 14px; display: inline-grid; place-items: center; width: 34px; height: 34px; color: var(--foreground); opacity: 0.42; cursor: default; transition: opacity 160ms ease, transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1); }
  .signout-link:hover, .signout-link:focus-visible { opacity: 0.9; cursor: pointer; transform: translateY(-1px); }
  .signout-link:focus-visible { outline: 2px solid color-mix(in srgb, var(--foreground) 45%, transparent); outline-offset: 3px; border-radius: 999px; }
  .signout-link svg { width: 18px; height: 18px; stroke: currentColor; stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
  main { max-width: 1180px; margin: 0 auto; padding: 1.25rem 1rem 2rem; }
  main.auth-shell { max-width: none; width: 100%; }
  .auth-shell { min-height: 100vh; display: grid; place-items: center; padding: 24px; overflow-x: hidden; }
  .auth-card { width: min(390px, calc(100vw - 32px)); max-width: calc(100vw - 32px); min-width: 0; padding: 1.35rem; border: 1px solid color-mix(in srgb, var(--border) 88%, transparent); border-radius: var(--radius); background: var(--card); box-shadow: var(--shadow-lg); }
  .auth-card .auth-brand { display: flex; align-items: center; gap: 0.75rem; min-width: 0; margin-bottom: 1rem; }
  .auth-card .auth-brand img { width: 42px; height: 42px; border-radius: 12px; box-shadow: var(--shadow-sm); }
  .auth-card h2 { min-width: 0; margin: 0; font-family: var(--font-serif); font-size: 1.35rem; line-height: 1.15; overflow-wrap: anywhere; }
  .auth-card label { display: block; margin: 0.8rem 0 0.3rem; color: var(--muted-foreground); font-size: 0.82rem; font-weight: 700; }
  .auth-card input { width: 100%; padding: 0.68rem 0.75rem; border: 1px solid var(--input); border-radius: var(--radius); background: var(--background); color: inherit; font: inherit; outline: none; transition: border-color 160ms ease, box-shadow 160ms ease; }
  .auth-card input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 12%, transparent); }
  .auth-card button { margin-top: 1rem; width: 100%; padding: 0.72rem; border: 1px solid var(--primary); border-radius: var(--radius); background: var(--primary); color: var(--primary-foreground); font: inherit; font-weight: 800; cursor: pointer; transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 160ms ease; }
  .auth-card button:hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); }
  .auth-card .switch { margin-top: 1rem; color: var(--muted-foreground); font-size: 0.87rem; text-align: center; }
  .auth-card .switch a { color: var(--foreground); font-weight: 800; }
  .auth-card .err { color: var(--destructive, #d33); font-size: 0.85rem; margin-top: 0.75rem; min-height: 1em; }

  .toolbar { display: flex; align-items: center; gap: 0.55rem; margin-bottom: 0.85rem; }
  .toolbar h2 { margin: 0 0.35rem; font-family: var(--font-serif); font-size: clamp(1.3rem, 2vw, 1.75rem); line-height: 1.1; }
  .toolbar .spacer { flex: 1; }
  .toolbar a.btn, .toolbar button { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 0.45rem 0.75rem; border: 1px solid color-mix(in srgb, var(--border) 84%, transparent); border-radius: 999px; background: var(--card); color: inherit; font: inherit; font-weight: 700; cursor: pointer; box-shadow: var(--shadow-sm); transition: background-color 160ms ease, transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1); }
  .toolbar a.btn:hover, .toolbar button:hover { background: var(--accent); transform: translateY(-1px); }

  .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
  .dow { padding: 0.35rem; color: var(--muted-foreground); font-size: 0.73rem; font-weight: 800; text-transform: uppercase; text-align: center; }
  .cell { background: var(--card); min-height: 102px; padding: 0.55rem; position: relative; cursor: pointer; border: 1px solid color-mix(in srgb, var(--border) 35%, transparent); border-radius: var(--radius); box-shadow: var(--shadow-sm); transition: background-color 140ms ease-out, border-color 160ms ease-out, box-shadow 200ms ease-out, transform 180ms cubic-bezier(0.4, 0, 0.2, 1), opacity 400ms ease-out; }
  .cell:hover, .cell:focus-within { z-index: 20; border-color: color-mix(in srgb, var(--border) 70%, transparent); transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,0.16); }
  .cell.muted { opacity: 0.48; }
  .cell.today { border-color: color-mix(in srgb, var(--primary) 34%, var(--border)); }
  .cell.today .daynum { background: var(--primary); color: var(--primary-foreground); }
  .daynum { display: inline-grid; place-items: center; min-width: 1.85em; height: 1.85em; border-radius: 999px; font-size: 0.82rem; font-weight: 800; }
  .events { margin-top: 0.35rem; display: flex; flex-direction: column; gap: 4px; }
  .pill { background: var(--accent); color: var(--accent-foreground); border: 1px solid color-mix(in srgb, var(--border) 70%, transparent); border-radius: calc(var(--radius) - 2px); padding: 2px 6px; font-size: 0.72rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cell .tooltip { display: none; position: absolute; z-index: 10; top: calc(100% + 6px); left: 0.5rem; min-width: 210px; max-width: 290px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.55rem 0.65rem; box-shadow: var(--shadow-lg); font-size: 0.85rem; }
  .cell:hover .tooltip { display: block; }
  .tooltip .ev { padding: 3px 0; border-bottom: 1px dashed var(--border); }
  .tooltip .ev:last-child { border-bottom: 0; }
  .tooltip .ev-title { font-weight: 800; }
  .tooltip .ev-meta { color: var(--muted-foreground); font-size: 0.78rem; }
  .tooltip .empty { color: var(--muted-foreground); font-style: italic; }

  dialog { border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; max-width: 390px; width: 90%; background: var(--card); color: inherit; box-shadow: var(--shadow-lg); }
  dialog::backdrop { background: rgba(0,0,0,0.4); }
  dialog h3 { margin: 0 0 0.75rem; font-family: var(--font-serif); }
  dialog label { display: block; margin: 0.55rem 0 0.2rem; color: var(--muted-foreground); font-size: 0.8rem; font-weight: 800; }
  dialog input, dialog textarea { width: 100%; padding: 0.58rem 0.65rem; border: 1px solid var(--input); border-radius: var(--radius); background: var(--background); color: inherit; font: inherit; outline: none; }
  dialog input:focus, dialog textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 12%, transparent); }
  dialog .location-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.45rem; align-items: center; }
  dialog .location-row button { white-space: nowrap; padding-inline: 0.7rem; }
  dialog .field-note { min-height: 1.1em; margin-top: 0.2rem; color: var(--muted-foreground); font-size: 0.76rem; }
  dialog .actions { display: flex; gap: 0.5rem; margin-top: 1rem; justify-content: flex-end; }
  dialog button { padding: 0.48rem 0.85rem; border: 1px solid var(--border); border-radius: 999px; background: var(--card); color: inherit; font: inherit; font-weight: 800; cursor: pointer; }
  dialog button.primary { background: var(--primary); border-color: var(--primary); color: var(--primary-foreground); }
  .day-events { margin-top: 0.5rem; max-height: 180px; overflow-y: auto; }
  .day-events .row { display: flex; gap: 0.5rem; align-items: center; padding: 4px 0; border-bottom: 1px dashed var(--border); }
  .day-events .row:last-child { border-bottom: 0; }
  .day-events .row .meta { flex: 1; font-size: 0.85rem; }
  .day-events .row a { color: var(--foreground); font-weight: 800; text-decoration: underline; text-underline-offset: 2px; }
  .day-events .row button { font-size: 0.75rem; padding: 0.2rem 0.5rem; }
  @media (max-width: 760px) {
    main { padding: 1rem 0.6rem 1.5rem; }
    .auth-shell { justify-items: start; padding: 16px; }
    .auth-card { width: min(358px, calc(100vw - 32px)); }
    .toolbar { flex-wrap: wrap; }
    .toolbar h2 { order: -1; width: 100%; margin: 0 0 0.35rem; }
    .grid { gap: 4px; }
    .cell { min-height: 76px; padding: 0.35rem; }
    .pill { display: none; }
    .cell .tooltip { display: none; }
    .dow { font-size: 0.66rem; }
    dialog .location-row { grid-template-columns: minmax(0, 1fr); }
  }
</style>
</head>
<body>
${body}
</body>
</html>`;

export const loginPage = (mode: "signin" | "signup" = "signin", error?: string): string => {
  const isSignup = mode === "signup";
  const action = isSignup ? "/auth/sign-up" : "/auth/sign-in";
  return layout(
    isSignup ? "cal · sign up" : "cal · sign in",
    `<main class="auth-shell">
<form class="auth-card" method="post" action="${action}">
  <div class="auth-brand">
    <img src="/logo.png" alt="" width="42" height="42" />
    <h2>${isSignup ? "Create your cal account" : "Sign in to cal"}</h2>
  </div>
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
  <div class="err">${esc(error ?? "")}</div>
  <div class="switch">
    ${
      isSignup
        ? `Have an account? <a href="/?mode=signin">Sign in</a>`
        : `New here? <a href="/?mode=signup">Sign up</a>`
    }
  </div>
</form>
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

  const body = `<a href="#" id="signout" class="signout-link" aria-label="Sign out" title="Sign out">
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <path d="M16 17l5-5-5-5"></path>
    <path d="M21 12H9"></path>
  </svg>
</a>
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
    <label>Location</label>
    <div class="location-row">
      <input name="location" maxlength="500" placeholder="Place, address, or video call link" />
      <button type="button" id="create-call">Video call</button>
    </div>
    <div class="field-note" id="call-status"></div>
    <label>Invite by email (optional)</label><input name="invitee_email" type="email" autocomplete="email" maxlength="320" />
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
  const createCallButton = document.getElementById('create-call');
  const callStatus = document.getElementById('call-status');

  function fmtMeta(ev) {
    return [
      ev.start_time || '',
      ev.description || '',
      ev.location ? 'Location: ' + ev.location : '',
      ev.invitee_email ? 'Invite: ' + ev.invitee_email : '',
    ].filter(Boolean).join(' · ');
  }

  function renderEvents(list) {
    if (!list.length) {
      dlgEvents.innerHTML = '<div class="empty" style="opacity:.6;font-style:italic">No events yet.</div>';
      return;
    }
    dlgEvents.innerHTML = list.map(ev => {
      const location = ev.location ? renderLocation(ev.location) : '';
      return '<div class="row" data-id="' + ev.id + '">' +
        '<div class="meta"><div><strong>' + escapeHtml(ev.title) + '</strong></div>' +
        '<div style="opacity:.7;font-size:.78rem">' + escapeHtml(fmtMeta(ev)) + '</div>' +
        (location ? '<div style="font-size:.78rem">' + location + '</div>' : '') + '</div>' +
        '<button type="button" data-del="' + ev.id + '">Delete</button>' +
        '</div>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function isSafeHref(s) {
    const lower = String(s).toLowerCase();
    return lower.startsWith('https://') || lower.startsWith('http://') || String(s).startsWith('/meet/');
  }

  function renderLocation(location) {
    if (!isSafeHref(location)) return escapeHtml(location);
    return '<a href="' + escapeHtml(location) + '" target="_blank" rel="noopener">Open location</a>';
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
      callStatus.textContent = '';
      addForm.elements.event_date.value = date;
      const list = await fetchDay(date);
      renderEvents(list);
      dialog.showModal();
    });
  });

  document.getElementById('dlg-close').addEventListener('click', () => dialog.close());

  createCallButton.addEventListener('click', async () => {
    const title = addForm.elements.title.value || 'Calendar video call';
    createCallButton.disabled = true;
    callStatus.textContent = 'Creating video call...';
    try {
      const res = await fetch('/api/realtimekit/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not create video call');
      addForm.elements.location.value = data.url;
      callStatus.textContent = 'Video call link added. Recording starts when someone joins.';
    } catch (err) {
      callStatus.textContent = err instanceof Error ? err.message : 'Could not create video call';
    } finally {
      createCallButton.disabled = false;
    }
  });

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(addForm);
    const body = {
      event_date: fd.get('event_date'),
      title: fd.get('title'),
      start_time: fd.get('start_time') || null,
      description: fd.get('description') || null,
      location: fd.get('location') || null,
      invitee_email: fd.get('invitee_email') || null,
    };
    const res = await fetch('/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.invite && data.invite.sent === false && data.invite.error) {
        alert(data.invite.error);
      }
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
    const res = await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      credentials: 'include',
    });
    if (res.ok) window.location.href = '/';
  });
})();
</script>`;

  return layout("Calendar", body);
};

export const meetingPage = (authToken: string): string => {
  const tokenJson = JSON.stringify(authToken);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="theme-color" content="#0f172a" />
<title>Video call</title>
<style>
  html, body { margin: 0; width: 100%; height: 100%; background: #111827; }
  body { overflow: hidden; font-family: ui-sans-serif, system-ui, sans-serif; }
  rtk-meeting { display: block; width: 100vw; height: 100vh; }
  .meeting-error { min-height: 100vh; display: grid; place-items: center; padding: 24px; color: white; }
  .meeting-error div { max-width: 420px; line-height: 1.5; }
</style>
<script type="module">
  import { defineCustomElements } from "https://cdn.jsdelivr.net/npm/@cloudflare/realtimekit-ui@latest/loader/index.es2017.js";
  defineCustomElements();
</script>
<script src="https://cdn.jsdelivr.net/npm/@cloudflare/realtimekit@latest/dist/browser.js"></script>
</head>
<body>
  <rtk-meeting id="my-meeting" show-setup-screen="true"></rtk-meeting>
  <script>
    const authToken = ${tokenJson};
    RealtimeKitClient.init({ authToken }).then((meeting) => {
      document.getElementById("my-meeting").meeting = meeting;
    }).catch((error) => {
      document.body.innerHTML = '<main class="meeting-error"><div><h1>Could not join video call</h1><p>' + String(error && error.message ? error.message : error).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) + '</p></div></main>';
    });
  </script>
</body>
</html>`;
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
            (e.start_time || e.description || e.location || e.invitee_email
              ? `<div class="ev-meta">${esc(
                  [e.start_time, e.description, e.location, e.invitee_email ? `Invite: ${e.invitee_email}` : null]
                    .filter(Boolean)
                    .join(" · ")
                )}</div>`
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
