import { createServer } from "node:http";
import { loginPage } from "../../src/views";

const port = Number(process.env.E2E_PORT ?? 8788);
const mailStaticOrigin = "https://mail.fly.pm";
const assetTypes = new Map<string, string>([
  ["/favicon.ico", "image/vnd.microsoft.icon"],
  ["/favicon-16x16.png", "image/png"],
  ["/favicon-32x32.png", "image/png"],
  ["/apple-touch-icon.png", "image/png"],
  ["/logo.png", "image/png"],
  ["/icon-192.png", "image/png"],
  ["/icon-512.png", "image/png"],
]);
const calendarAssetPaths = new Map<string, string>([
  ["/favicon.ico", "/calendar-favicon.ico"],
  ["/favicon-16x16.png", "/calendar-favicon-16x16.png"],
  ["/favicon-32x32.png", "/calendar-favicon-32x32.png"],
  ["/apple-touch-icon.png", "/calendar-apple-touch-icon.png"],
  ["/logo.png", "/calendar-appicon.png"],
  ["/icon-192.png", "/calendar-icon-192.png"],
  ["/icon-512.png", "/calendar-icon-512.png"],
]);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1:8788"}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname === "/") {
    const mode = url.searchParams.get("mode") === "signup" ? "signup" : "signin";
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, must-revalidate",
    });
    res.end(loginPage(mode));
    return;
  }

  const contentType = assetTypes.get(url.pathname);
  if (contentType) {
    const assetPath = calendarAssetPaths.get(url.pathname) ?? url.pathname;
    const asset = await fetch(`${mailStaticOrigin}${assetPath}`);
    if (!asset.ok || !asset.body) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "public, max-age=86400",
    });
    const body = Buffer.from(await asset.arrayBuffer());
    res.end(body);
    return;
  }

  if (url.pathname === "/site.webmanifest") {
    res.writeHead(200, { "content-type": "application/manifest+json; charset=utf-8" });
    res.end(JSON.stringify({ name: "fly.pm Calendar", short_name: "fly.pm" }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(port, "127.0.0.1");
