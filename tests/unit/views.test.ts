// @vitest-environment node

import { describe, expect, it } from "vitest";
import { loginPage, monthView } from "../../src/views";
import type { CalEvent } from "../../src/events";

const event = (overrides: Partial<CalEvent> = {}): CalEvent => ({
  id: "evt-1",
  user_id: "user-1",
  event_date: "2026-05-22",
  start_time: "09:30",
  title: "Planning",
  description: "Review launch list",
  created_at: 1,
  updated_at: 1,
  dp_task_id: null,
  completed: 0,
  ...overrides,
});

describe("loginPage", () => {
  it("renders the restored calendar logo and favicon metadata", () => {
    const html = loginPage("signin");

    expect(html).toContain('<link rel="icon" href="/favicon.ico"');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png"');
    expect(html).toContain('<img src="/logo.png" alt="" width="42" height="42" />');
    expect(html).toContain("Sign in to cal");
  });

  it("escapes authentication errors before rendering", () => {
    const html = loginPage("signin", '<script>alert("x")</script>');

    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).not.toContain('<script>alert("x")</script>');
  });
});

describe("monthView", () => {
  it("renders a stable 7-column month grid with adjacent month cells", () => {
    const html = monthView({
      userEmail: "aloe@example.com",
      year: 2026,
      month: 5,
      events: [event()],
      today: { y: 2026, m: 5, d: 22 },
    });

    expect(html.match(/class="dow"/g)).toHaveLength(7);
    expect(html.match(/class="cell/g)).toHaveLength(42);
    expect(html).toContain("May 2026");
    expect(html).toContain('data-date="2026-05-22"');
    expect(html).toContain("Planning");
    expect(html).toContain("Review launch list");
  });

  it("renders the calendar navbar with only the logo as the brand", () => {
    const html = monthView({
      userEmail: "aloe@example.com",
      year: 2026,
      month: 5,
      events: [event()],
      today: { y: 2026, m: 5, d: 22 },
    });

    expect(html).toContain('<img class="brand-mark" src="/logo.png" alt="" width="34" height="34" />');
    expect(html).not.toContain("<h1>cal</h1>");
  });

  it("escapes event and account content in the calendar surface", () => {
    const html = monthView({
      userEmail: 'user"><img src=x onerror=alert(1)>@example.com',
      year: 2026,
      month: 5,
      events: [
        event({
          title: '<img src=x onerror=alert("event")>',
          description: "Use <strong>escaped</strong> notes",
        }),
      ],
      today: { y: 2026, m: 5, d: 1 },
    });

    expect(html).toContain("&lt;img src=x onerror=alert(&quot;event&quot;)&gt;");
    expect(html).toContain("Use &lt;strong&gt;escaped&lt;/strong&gt; notes");
    expect(html).toContain("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;@example.com");
    expect(html).not.toContain("<strong>escaped</strong>");
  });

  it("renders sign-out as the JSON POST Better Auth expects", () => {
    const html = monthView({
      userEmail: "aloe@example.com",
      year: 2026,
      month: 5,
      events: [event()],
      today: { y: 2026, m: 5, d: 22 },
    });

    expect(html).toContain("await fetch('/api/auth/sign-out', {");
    expect(html).toContain("method: 'POST'");
    expect(html).toContain("headers: { 'content-type': 'application/json' }");
    expect(html).toContain("body: '{}'");
    expect(html).toContain("credentials: 'include'");
  });

  it("lifts the hovered day cell above neighboring cards for tooltips", () => {
    const html = monthView({
      userEmail: "aloe@example.com",
      year: 2026,
      month: 5,
      events: [event()],
      today: { y: 2026, m: 5, d: 22 },
    });

    expect(html).toContain(".cell:hover, .cell:focus-within { z-index: 20;");
    expect(html).toContain(".cell .tooltip { display: none; position: absolute; z-index: 10;");
  });
});
