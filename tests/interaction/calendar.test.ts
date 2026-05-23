import { beforeEach, describe, expect, it, vi } from "vitest";
import { monthView } from "../../src/views";
import type { CalEvent } from "../../src/events";

const event = (overrides: Partial<CalEvent> = {}): CalEvent => ({
  id: "evt-1",
  user_id: "user-1",
  event_date: "2026-05-22",
  start_time: "10:00",
  title: "Ship tests",
  description: "Cover calendar interactions",
  created_at: 1,
  updated_at: 1,
  dp_task_id: null,
  completed: 0,
  ...overrides,
});

const renderInteractiveMonth = () => {
  const html = monthView({
    userEmail: "aloe@example.com",
    year: 2026,
    month: 5,
    events: [event()],
    today: { y: 2026, m: 5, d: 22 },
  });
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  if (!script) throw new Error("monthView script was not rendered");

  document.open();
  document.write(html);
  document.close();

  window.HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  window.HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  });

  window.eval(script);
};

describe("calendar month interactions", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/events?date=")) {
          return Response.json([event()]);
        }
        if (url === "/events" && init?.method === "POST") {
          return Response.json(event({ title: "New event" }), { status: 201 });
        }
        if (url.startsWith("/events/") && init?.method === "DELETE") {
          return Response.json({ ok: true });
        }
        if (url === "/api/auth/sign-out") {
          return Response.json({ ok: true });
        }
        return Response.json({ error: "unexpected request" }, { status: 500 });
      })
    );
  });

  it("opens the day dialog and loads events for the clicked date", async () => {
    renderInteractiveMonth();

    document.querySelector<HTMLElement>('[data-date="2026-05-22"]')?.click();
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/events?date=2026-05-22",
        expect.objectContaining({ credentials: "include" })
      );
      expect(document.getElementById("day-dialog")?.hasAttribute("open")).toBe(true);
      expect(document.getElementById("dlg-title")?.textContent).toBe("2026-05-22");
      expect(document.getElementById("dlg-events")?.textContent).toContain("Ship tests");
    });
  });

  it("submits a new event from the day dialog", async () => {
    renderInteractiveMonth();
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      configurable: true,
    });

    document.querySelector<HTMLElement>('[data-date="2026-05-22"]')?.click();
    await vi.waitFor(() => expect(document.getElementById("day-dialog")?.hasAttribute("open")).toBe(true));

    const form = document.getElementById("add-form") as HTMLFormElement;
    (form.elements.namedItem("title") as HTMLInputElement).value = "New event";
    (form.elements.namedItem("start_time") as HTMLInputElement).value = "14:15";
    (form.elements.namedItem("description") as HTMLTextAreaElement).value = "From interaction test";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/events",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
        })
      );
      const postCall = vi.mocked(fetch).mock.calls.find(([url, init]) => url === "/events" && init?.method === "POST");
      expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
        event_date: "2026-05-22",
        title: "New event",
        start_time: "14:15",
        description: "From interaction test",
      });
      expect(reload).toHaveBeenCalled();
    });
  });
});
