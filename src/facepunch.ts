const COMPANION_API = "https://companion-rust.facepunch.com:443/api/push/register";
const EXPO_API = "https://exp.host/--/api/v2/push/getExpoPushToken";

const RUST_COMPANION_PROJECT_ID = "49451aca-a822-41e6-ad59-955718d0ff9c";
const RUST_COMPANION_APP_ID = "com.facepunch.rust.companion";

export async function getExpoPushToken(fcmToken: string): Promise<string> {
  const payload = JSON.stringify({
    type: "fcm",
    deviceId: crypto.randomUUID(),
    development: false,
    appId: RUST_COMPANION_APP_ID,
    deviceToken: fcmToken,
    projectId: RUST_COMPANION_PROJECT_ID,
  });

  let lastStatus = 0;
  let lastBody = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(EXPO_API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "okhttp/4.9.0",
      },
      body: payload,
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: { expoPushToken?: string } };
      const tok = body.data?.expoPushToken;
      if (!tok) throw new Error("expo: no expoPushToken in response");
      return tok;
    }
    lastStatus = res.status;
    lastBody = (await res.text().catch(() => "")).slice(0, 400);
    if (res.status < 500 || res.status > 599) break;
    const wait = Math.min(8000, 500 * 2 ** attempt);
    console.log(`[expo] ${res.status} on attempt ${attempt + 1}/5 — retrying in ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error(`expo: getExpoPushToken ${lastStatus}: ${lastBody || "(empty body)"}`);
}

export async function registerWithRustCompanion(args: {
  authToken: string;
  expoPushToken: string;
}): Promise<void> {
  // pushkind=3 is expo. fixed deviceid so re-registers overwrite instead of stack
  const res = await fetch(COMPANION_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      AuthToken: args.authToken,
      DeviceId: "lcg-pair",
      PushKind: 3,
      PushToken: args.expoPushToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`facepunch: register ${res.status}: ${text}`);
  }
}
