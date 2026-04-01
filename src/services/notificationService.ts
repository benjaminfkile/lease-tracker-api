import {
  SNSClient,
  CreatePlatformEndpointCommand,
  PublishCommand,
} from "@aws-sdk/client-sns";
import { getUserById } from "../db/users";
import { getAppSecrets } from "../aws/getAppSecrets";

// ---------------------------------------------------------------------------
// Singleton SNS client
// ---------------------------------------------------------------------------

let snsClient: SNSClient | undefined;

function getSnsClient(): SNSClient {
  if (!snsClient) {
    snsClient = new SNSClient({ region: process.env.AWS_REGION });
  }
  return snsClient;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Platform = "apns" | "fcm";

export interface ParsedToken {
  platform: Platform;
  rawToken: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parses a push token with a platform prefix.
 *   "apns:<64-hex-device-token>" → iOS / APNs
 *   "fcm:<FCM-registration-id>"  → Android / FCM
 * Returns null when the prefix is absent or unrecognised.
 */
export function parseToken(pushToken: string): ParsedToken | null {
  if (pushToken.startsWith("apns:")) {
    return { platform: "apns", rawToken: pushToken.slice(5) };
  }
  if (pushToken.startsWith("fcm:")) {
    return { platform: "fcm", rawToken: pushToken.slice(4) };
  }
  return null;
}

/**
 * Builds the SNS message payload with per-platform JSON encoding required
 * when `MessageStructure` is "json".
 */
export function buildSnsMessage(
  platform: Platform,
  title: string,
  body: string,
  data?: Record<string, unknown>
): string {
  if (platform === "apns") {
    const apnsPayload = JSON.stringify({
      aps: { alert: { title, body }, sound: "default" },
      ...(data ? { data } : {}),
    });
    return JSON.stringify({
      APNS: apnsPayload,
      APNS_SANDBOX: apnsPayload,
    });
  }

  // FCM
  const fcmPayload = JSON.stringify({
    notification: { title, body },
    data: data ?? {},
  });
  return JSON.stringify({ GCM: fcmPayload });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sends a push notification to the given user.
 *
 * 1. Looks up the user's `push_token`.
 * 2. Determines the target platform from the token prefix ("apns:" / "fcm:").
 * 3. Fetches SNS platform-application ARNs from Secrets Manager.
 * 4. Creates (or reuses) an SNS device endpoint.
 * 5. Publishes the notification to that endpoint.
 *
 * Resolves silently when the user has no push token or the token format is
 * unrecognised — this prevents callers from having to guard every call site.
 */
export async function send(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const user = await getUserById(userId);

  if (!user?.push_token) {
    return;
  }

  const parsed = parseToken(user.push_token);
  if (!parsed) {
    console.warn(
      `[NOTIFICATION] Unrecognised push token format for user ${userId}`
    );
    return;
  }

  const secrets = await getAppSecrets();
  const platformArn =
    parsed.platform === "apns"
      ? secrets.SNS_APNS_PLATFORM_ARN
      : secrets.SNS_FCM_PLATFORM_ARN;

  const client = getSnsClient();

  const endpointResult = await client.send(
    new CreatePlatformEndpointCommand({
      PlatformApplicationArn: platformArn,
      Token: parsed.rawToken,
    })
  );

  const endpointArn = endpointResult.EndpointArn;
  if (!endpointArn) {
    throw new Error("SNS did not return an EndpointArn");
  }

  await client.send(
    new PublishCommand({
      TargetArn: endpointArn,
      Message: buildSnsMessage(parsed.platform, title, body, data),
      MessageStructure: "json",
    })
  );
}
