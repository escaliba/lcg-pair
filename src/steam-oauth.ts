import * as ChromeLauncher from "chrome-launcher";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pairPageHTML } from "./pair-page";

type LaunchedChrome = Awaited<ReturnType<typeof ChromeLauncher.launch>>;

function findChromiumPath(): string | undefined {
  if (process.env.LCG_BROWSER_PATH && existsSync(process.env.LCG_BROWSER_PATH)) {
    return process.env.LCG_BROWSER_PATH;
  }
  const candidates: string[] = [];
  if (process.platform === "win32") {
    const pf = process.env["ProgramFiles"] ?? "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const local = process.env["LOCALAPPDATA"] ?? "";
    candidates.push(
      `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${pf}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      `${pf86}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      local && `${local}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
      `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
      local && `${local}\\Google\\Chrome\\Application\\chrome.exe`,
      `${pf}\\Chromium\\Application\\chromium.exe`,
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    );
  } else {
    candidates.push(
      "/usr/bin/microsoft-edge",
      "/usr/bin/microsoft-edge-stable",
      "/usr/bin/brave-browser",
      "/usr/bin/brave",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    );
  }
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return undefined;
}

function freshProfileDir(): string {
  return mkdtempSync(join(tmpdir(), "lcg-pair-chrome-"));
}

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

// the parent at 127.0.0.1 writes ReactNativeWebView into the facepunch popup — needs --disable-web-security
export async function captureSteamAuthToken(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let server: ReturnType<typeof Bun.serve> | null = null;
    let chromeInstance: LaunchedChrome | null = null;
    const profileDir = freshProfileDir();
    const nonce = crypto.randomUUID();

    const cleanup = async () => {
      if (server) {
        try { await server.stop(true); } catch {}
      }
      if (chromeInstance) {
        try { await chromeInstance.kill(); } catch {}
      }
      try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
    };

    server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req): Promise<Response> {
        const url = new URL(req.url);
        const localPort = server!.port ?? 0;
        if (url.pathname === "/" || url.pathname === "/index.html") {
          return new Response(pairPageHTML(localPort, nonce), {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        if (url.pathname === "/callback") {
          const givenNonce = url.searchParams.get("n") ?? "";
          if (!safeEq(givenNonce, nonce)) {
            return new Response("bad nonce", { status: 403 });
          }
          const token = url.searchParams.get("token");
          const err = url.searchParams.get("error");
          setTimeout(() => {
            cleanup().finally(() => {
              if (token) resolve(token);
              else reject(new Error(err ?? "Steam token missing from callback"));
            });
          }, 100);
          if (token) {
            return new Response(
              "<html><body style='font-family:sans-serif;background:#0a0a0a;color:#fafafa;padding:32px'>Steam linked. You can close this window.</body></html>",
              { headers: { "content-type": "text/html" } },
            );
          }
          return new Response(
            `<html><body style='font-family:sans-serif;background:#0a0a0a;color:#f43f5e;padding:32px'>Pairing failed: ${err ?? "no token"}</body></html>`,
            { status: 400, headers: { "content-type": "text/html" } },
          );
        }
        return new Response("not found", { status: 404 });
      },
    });

    const port = server.port;
    console.log(`[steam-oauth] local server on http://127.0.0.1:${port}`);

    const browserPath = findChromiumPath();
    ChromeLauncher.launch({
      chromePath: browserPath,
      chromeFlags: [
        `--app=http://127.0.0.1:${port}`,
        "--disable-web-security",
        "--disable-popup-blocking",
        "--disable-site-isolation-trials",
        "--no-first-run",
        "--no-default-browser-check",
        "--user-data-dir=" + profileDir,
      ],
      handleSIGINT: false,
    })
      .then((c: LaunchedChrome) => {
        chromeInstance = c;
        const which = browserPath ? browserPath.split(/[\\/]/).pop() : "chrome";
        console.log(`[steam-oauth] launched ${which} — sign in via Steam`);
      })
      .catch((err: unknown) => {
        cleanup().finally(() =>
          reject(
            new Error(
              `Chromium-based browser failed to launch — install Microsoft Edge, Brave, or Google Chrome and try again (${String(err)})`,
            ),
          ),
        );
      });
  });
}
