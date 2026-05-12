import protobuf from "protobufjs";
import Long from "long";

protobuf.util.Long = Long;
protobuf.configure();

const RUST_COMPANION_FCM = {
  apiKey: "AIzaSyB5y2y-Tzqb4-I4Qnlsh_9naYv_TD8pCvY",
  projectId: "rust-companion-app",
  gcmSenderId: "976529667804",
  gmsAppId: "1:976529667804:android:d6f1ddeb4403b338fea619",
  androidPackageName: "com.facepunch.rust.companion",
  androidPackageCert: "E28D05345FB78A7A1A63D70F4A302DBF426CA5AD",
};

export type FcmCredentials = {
  gcm: { androidId: string; securityToken: string };
  fcm: { token: string };
};

// inlined so the compiled binary doesn't need to read .proto files at runtime
const PROTO_TEXT = `
syntax = "proto2";
package checkin_proto;
option optimize_for = LITE_RUNTIME;

message ChromeBuildProto {
  enum Platform {
    PLATFORM_WIN = 1;
    PLATFORM_MAC = 2;
    PLATFORM_LINUX = 3;
    PLATFORM_CROS = 4;
    PLATFORM_IOS = 5;
    PLATFORM_ANDROID = 6;
  }
  enum Channel {
    CHANNEL_STABLE = 1;
    CHANNEL_BETA = 2;
    CHANNEL_DEV = 3;
    CHANNEL_CANARY = 4;
    CHANNEL_UNKNOWN = 5;
  }
  optional Platform platform = 1;
  optional string chrome_version = 2;
  optional Channel channel = 3;
}

enum DeviceType {
  DEVICE_ANDROID_OS = 1;
  DEVICE_IOS_OS = 2;
  DEVICE_CHROME_BROWSER = 3;
  DEVICE_CHROME_OS = 4;
}

message AndroidCheckinProto {
  optional int64 last_checkin_msec = 2;
  optional string cell_operator = 6;
  optional string sim_operator = 7;
  optional string roaming = 8;
  optional int32 user_number = 9;
  optional DeviceType type = 12 [default = DEVICE_ANDROID_OS];
  optional ChromeBuildProto chrome_build = 13;
}

message GservicesSetting {
  required bytes name = 1;
  required bytes value = 2;
}

message AndroidCheckinRequest {
  optional string imei = 1;
  optional string meid = 10;
  repeated string mac_addr = 9;
  repeated string mac_addr_type = 19;
  optional string serial_number = 16;
  optional string esn = 17;
  optional int64 id = 2;
  optional int64 logging_id = 7;
  optional string digest = 3;
  optional string locale = 6;
  required AndroidCheckinProto checkin = 4;
  optional string desired_build = 5;
  optional string market_checkin = 8;
  repeated string account_cookie = 11;
  optional string time_zone = 12;
  optional fixed64 security_token = 13;
  optional int32 version = 14;
  repeated string ota_cert = 15;
  optional int32 fragment = 20;
  optional string user_name = 21;
  optional int32 user_serial_number = 22;
}

message AndroidCheckinResponse {
  required bool stats_ok = 1;
  optional int64 time_msec = 3;
  optional string digest = 4;
  optional bool settings_diff = 9;
  repeated string delete_setting = 10;
  repeated GservicesSetting setting = 5;
  optional bool market_ok = 6;
  optional fixed64 android_id = 7;
  optional fixed64 security_token = 8;
  optional string version_info = 11;
}
`;

const root = protobuf.parse(PROTO_TEXT, { keepCase: false }).root;
const AndroidCheckinRequest = root.lookupType("checkin_proto.AndroidCheckinRequest");
const AndroidCheckinResponse = root.lookupType("checkin_proto.AndroidCheckinResponse");

function generateFirebaseFID(): string {
  const buf = new Uint8Array(17);
  crypto.getRandomValues(buf);
  // first 4 bits are 0b0111 — firebase fid header
  buf[0] = 0b01110000 | (buf[0]! & 0b00001111);
  return Buffer.from(buf).toString("base64").replace(/=/g, "");
}

async function installRequest(): Promise<string> {
  const res = await fetch(
    `https://firebaseinstallations.googleapis.com/v1/projects/${RUST_COMPANION_FCM.projectId}/installations`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Android-Package": RUST_COMPANION_FCM.androidPackageName,
        "X-Android-Cert": RUST_COMPANION_FCM.androidPackageCert,
        "x-firebase-client":
          "android-min-sdk/23 fire-core/20.0.0 device-name/a21snnxx device-brand/samsung device-model/a21s android-installer/com.android.vending fire-android/30 fire-installations/17.0.0 fire-fcm/22.0.0 android-platform/ kotlin/1.9.23 android-target-sdk/34",
        "x-firebase-client-log-type": "3",
        "x-goog-api-key": RUST_COMPANION_FCM.apiKey,
        "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 11; SM-A217F Build/RP1A.200720.012)",
      },
      body: JSON.stringify({
        fid: generateFirebaseFID(),
        appId: RUST_COMPANION_FCM.gmsAppId,
        authVersion: "FIS_v2",
        sdkVersion: "a:17.0.0",
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`firebase install ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { authToken?: { token?: string } };
  if (!data.authToken?.token) {
    throw new Error(`firebase install: no authToken in response (${JSON.stringify(data)})`);
  }
  return data.authToken.token;
}

async function gcmCheckIn(): Promise<{ androidId: string; securityToken: string }> {
  const payload = {
    userSerialNumber: 0,
    checkin: {
      type: 3,
      chromeBuild: { platform: 2, chromeVersion: "63.0.3234.0", channel: 1 },
    },
    version: 3,
  };
  const errMsg = AndroidCheckinRequest.verify(payload);
  if (errMsg) throw new Error(`checkin payload invalid: ${errMsg}`);
  const message = AndroidCheckinRequest.create(payload);
  const buf = AndroidCheckinRequest.encode(message).finish();

  const res = await fetch("https://android.clients.google.com/checkin", {
    method: "POST",
    headers: { "Content-Type": "application/x-protobuf" },
    body: buf,
  });
  if (!res.ok) {
    throw new Error(`gcm checkin ${res.status}: ${await res.text()}`);
  }
  const respBytes = new Uint8Array(await res.arrayBuffer());
  const decoded = AndroidCheckinResponse.decode(respBytes);
  const obj = AndroidCheckinResponse.toObject(decoded, {
    longs: String,
    enums: String,
    bytes: String,
  }) as { androidId?: string; securityToken?: string };
  if (!obj.androidId || !obj.securityToken) {
    throw new Error(`gcm checkin: missing androidId/securityToken (${JSON.stringify(obj)})`);
  }
  return { androidId: obj.androidId, securityToken: obj.securityToken };
}

async function gcmRegister(args: {
  androidId: string;
  securityToken: string;
  installationAuthToken: string;
}): Promise<string> {
  const form = new URLSearchParams({
    device: args.androidId,
    app: RUST_COMPANION_FCM.androidPackageName,
    cert: RUST_COMPANION_FCM.androidPackageCert,
    app_ver: "1",
    "X-subtype": RUST_COMPANION_FCM.gcmSenderId,
    "X-app_ver": "1",
    "X-osv": "29",
    "X-cliv": "fiid-21.1.1",
    "X-gmsv": "220217001",
    "X-scope": "*",
    "X-Goog-Firebase-Installations-Auth": args.installationAuthToken,
    "X-gms_app_id": RUST_COMPANION_FCM.gmsAppId,
    "X-Firebase-Client":
      "android-min-sdk/23 fire-core/20.0.0 device-name/a21snnxx device-brand/samsung device-model/a21s android-installer/com.android.vending fire-android/30 fire-installations/17.0.0 fire-fcm/22.0.0 android-platform/ kotlin/1.9.23 android-target-sdk/34",
    "X-Firebase-Client-Log-Type": "1",
    "X-app_ver_name": "1",
    target_ver: "31",
    sender: RUST_COMPANION_FCM.gcmSenderId,
  });

  // gcm register sometimes returns a transient PHONE_REGISTRATION_ERROR
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch("https://android.clients.google.com/c2dm/register3", {
      method: "POST",
      headers: {
        Authorization: `AidLogin ${args.androidId}:${args.securityToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const text = await res.text();
    if (text.includes("Error")) {
      if (attempt === 5) throw new Error(`gcm register failed after 6 tries: ${text}`);
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    // response is "token=ADRZ..."
    const token = text.split("=")[1]?.trim();
    if (!token) throw new Error(`gcm register: malformed response: ${text}`);
    return token;
  }
  throw new Error("unreachable");
}



export async function registerFcmDevice(): Promise<FcmCredentials> {
  const installationAuthToken = await installRequest();
  const { androidId, securityToken } = await gcmCheckIn();
  const fcmToken = await gcmRegister({ androidId, securityToken, installationAuthToken });
  return {
    gcm: { androidId, securityToken },
    fcm: { token: fcmToken },
  };
}
