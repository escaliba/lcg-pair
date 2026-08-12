#!/usr/bin/env bun
import { captureSteamAuthToken } from "./steam-oauth";
import { registerFcmDevice } from "./fcm";
import { getExpoPushToken, registerWithRustCompanion } from "./facepunch";
import { exchangePairCode } from "./lcg";

function log(stage: string, msg: string) {
  console.log(`[${stage}] ${msg}`);
}

function readLine(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  return new Promise<string>((resolve) => {
    const onData = (chunk: Buffer) => {
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
      resolve(chunk.toString().replace(/[\r\n]+$/, ""));
    };
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

// keep the console open on windows so errors stay readable
async function waitForKey(): Promise<void> {
  process.stdout.write("\nPress Enter to close…");
  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });
}

async function main(): Promise<void> {
  console.log("=".repeat(56));
  console.log("  lcg-pair — connect Steam for in-game auto-pairing");
  console.log("=".repeat(56));
  console.log();

  let code = (process.argv[2] ?? "").trim();
  if (!code) {
    console.log("Open https://lcg.heroinhound.cc/dashboard, click");
    console.log('"Connect for auto-pairing", and copy the 8-character code.');
    console.log();
    code = (await readLine("Pair code: ")).trim();
  }
  if (!code) throw new Error("pair code is required");

  log("oauth", "launching browser (Edge / Brave / Chrome) — sign in with Steam in the popup that opens");
  const rustplusAuthToken = await captureSteamAuthToken();
  log("oauth", `got Steam Auth Token (${rustplusAuthToken.length} chars)`);

  log("fcm", "registering fake Android device with Google FCM");
  const fcmCredentials = await registerFcmDevice();
  log("fcm", "registered — got androidId + securityToken");

  log("expo", "exchanging FCM token for Expo push token");
  const expoPushToken = await getExpoPushToken(fcmCredentials.fcm.token);
  log("expo", "got Expo push token");

  log("facepunch", "registering with Rust Companion API");
  await registerWithRustCompanion({ authToken: rustplusAuthToken, expoPushToken });
  log("facepunch", "registered");

  log("lcg", "uploading credentials to lcg");
  const { steamId } = await exchangePairCode({
    code,
    rustplusAuthToken,
    expoPushToken,
    fcmCredentials,
  });
  log("lcg", `linked to steamId ${steamId}`);

  console.log();
  console.log("Done.");
  console.log();
  console.log("In Rust: press Esc -> Pairing -> Enable.");
  console.log("Within a few seconds the server will appear at");
  console.log("https://lcg.heroinhound.cc/dashboard");
  console.log();
  console.log("Source + checksums: https://git.fable.bz/zyu/lcg-pair");
}

main()
  .then(async () => {
    await waitForKey();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error();
    console.error("pairing failed:", err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) {
      console.error();
      console.error(err.stack);
    }
    await waitForKey();
    process.exit(1);
  });
