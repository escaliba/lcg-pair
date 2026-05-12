import type { FcmCredentials } from "./fcm";

const DEFAULT_LCG_BASE = "https://lcg.heroinhound.cc";

export type ExchangePayload = {
  code: string;
  rustplusAuthToken: string;
  expoPushToken: string;
  fcmCredentials: FcmCredentials;
};

export async function exchangePairCode(
  payload: ExchangePayload,
  baseUrl = process.env.LCG_BASE_URL ?? DEFAULT_LCG_BASE,
): Promise<{ steamId: string }> {
  const res = await fetch(`${baseUrl}/api/fcm/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`lcg: exchange ${res.status}: ${text}`);
  }
  return (await res.json()) as { steamId: string };
}
