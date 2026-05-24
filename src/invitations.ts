import type { CalEvent } from "./events";
import type { Env } from "./env";

const DEFAULT_FROM = "calendar@fly.pm";

export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const escapeIcs = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c] ?? c);

const ymdCompact = (date: string): string => date.replace(/-/g, "");

const nextDate = (date: string): string => {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, "0")}${String(next.getUTCDate()).padStart(2, "0")}`;
};

const inviteUrl = (location: string, inviteeEmail: string, origin: string): string => {
  if (!/^https?:\/\//i.test(location)) return origin;
  const url = new URL(location);
  url.searchParams.set("email", inviteeEmail);
  return url.toString();
};

const addMinutes = (date: string, time: string, minutes: number): string => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day, hour, minute + minutes));
  return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, "0")}${String(next.getUTCDate()).padStart(2, "0")}T${String(next.getUTCHours()).padStart(2, "0")}${String(next.getUTCMinutes()).padStart(2, "0")}00`;
};

const eventDateTime = (event: CalEvent): { text: string; dtStart: string; dtEnd: string } => {
  if (!event.start_time) {
    return {
      text: event.event_date,
      dtStart: `DTSTART;VALUE=DATE:${ymdCompact(event.event_date)}`,
      dtEnd: `DTEND;VALUE=DATE:${nextDate(event.event_date)}`,
    };
  }
  const start = `${ymdCompact(event.event_date)}T${event.start_time.replace(":", "")}00`;
  return {
    text: `${event.event_date} at ${event.start_time}`,
    dtStart: `DTSTART:${start}`,
    dtEnd: `DTEND:${addMinutes(event.event_date, event.start_time, 30)}`,
  };
};

const buildIcs = (
  event: CalEvent,
  ownerEmail: string,
  inviteeEmail: string,
  origin: string
): string => {
  const { dtStart, dtEnd } = eventDateTime(event);
  const location = event.location ?? "";
  const eventUrl = inviteUrl(location, inviteeEmail, origin);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//fly.pm//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.id}@cal.fly.pm`,
    `DTSTAMP:${new Date(event.created_at).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
    dtStart,
    dtEnd,
    `SUMMARY:${escapeIcs(event.title)}`,
    location ? `LOCATION:${escapeIcs(location)}` : "",
    event.description ? `DESCRIPTION:${escapeIcs(event.description)}` : "",
    `URL:${eventUrl}`,
    `ORGANIZER;CN=${escapeIcs(ownerEmail)}:mailto:${ownerEmail}`,
    `ATTENDEE;CN=${escapeIcs(inviteeEmail)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${inviteeEmail}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
};

export const sendCalendarInvite = async (
  env: Env,
  event: CalEvent,
  ownerEmail: string,
  origin: string
): Promise<{ sent: boolean; error?: string }> => {
  const inviteeEmail = event.invitee_email;
  if (!inviteeEmail) return { sent: false };
  if (!env.INVITE_EMAIL) {
    return { sent: false, error: "Invitation email is not configured" };
  }

  const { text: when } = eventDateTime(event);
  const location = event.location || "No location provided";
  const eventUrl = inviteUrl(event.location ?? "", inviteeEmail, origin);
  const ics = buildIcs(event, ownerEmail, inviteeEmail, origin);
  await env.INVITE_EMAIL.send({
    from: env.INVITE_EMAIL_FROM || DEFAULT_FROM,
    to: inviteeEmail,
    replyTo: ownerEmail,
    subject: `Invitation: ${event.title}`,
    text: [
      `${ownerEmail} invited you to ${event.title}.`,
      "",
      `When: ${when}`,
      `Location: ${location}`,
      `Join: ${eventUrl}`,
      event.description ? `Notes: ${event.description}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    html: `<p>${escapeHtml(ownerEmail)} invited you to <strong>${escapeHtml(event.title)}</strong>.</p><p><strong>When:</strong> ${escapeHtml(when)}<br><strong>Location:</strong> ${escapeHtml(location)}</p><p><a href="${escapeHtml(eventUrl)}">Join video call</a></p>`,
    attachments: [
      {
        disposition: "attachment",
        filename: "invite.ics",
        type: "text/calendar; method=REQUEST; charset=utf-8",
        content: ics,
      },
    ],
  });
  return { sent: true };
};
