import { verify, X509Certificate } from "crypto";
import { ApiError } from "../utils/ApiError";
import { getAppConfigValue } from "../aws/getAppConfig";

// ---------------------------------------------------------------------------
// Apple notification payload types (App Store Server Notifications v2)
// ---------------------------------------------------------------------------

export interface AppleJWSTransactionDecodedPayload {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: number;
  originalPurchaseDate: number;
  expiresDate?: number;
  type: string;
  inAppOwnershipType: string;
  signedDate: number;
  environment: string;
  [key: string]: unknown;
}

export interface AppleJWSRenewalInfoDecodedPayload {
  originalTransactionId: string;
  productId: string;
  autoRenewProductId: string;
  autoRenewStatus: number;
  environment: string;
  signedDate: number;
  [key: string]: unknown;
}

export interface AppleNotificationData {
  environment: string;
  bundleId: string;
  appAppleId?: number;
  bundleVersion?: string;
  signedTransactionInfo?: string;
  signedRenewalInfo?: string;
}

export interface DecodedAppleNotification {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  data: AppleNotificationData;
  version: string;
  signedDate: number;
  transactionInfo?: AppleJWSTransactionDecodedPayload;
  renewalInfo?: AppleJWSRenewalInfoDecodedPayload;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decodes a JWS payload without re-verifying the signature.
 * Used for nested `signedTransactionInfo` and `signedRenewalInfo`, whose
 * authenticity is already guaranteed by the verified outer signedPayload.
 */
function decodeJWSPayloadUnsafe(jws: string): unknown {
  const parts = jws.split(".");
  if (parts.length !== 3) {
    throw new ApiError(400, "Invalid nested JWS format");
  }
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

/**
 * Returns the Apple Root CA PEM from the APPLE_ROOT_CA_PEM environment
 * variable. Throws a configuration error if the variable is not set.
 *
 * Download the Apple Root CA - G3 certificate from Apple's PKI page:
 * https://www.apple.com/certificateauthority/
 * and set its PEM content in the APPLE_ROOT_CA_PEM environment variable.
 */
async function getAppleRootCaPem(): Promise<string> {
  const pem = await getAppConfigValue("APPLE_ROOT_CA_PEM", {
    required: true,
  });
  if (!pem) {
    throw new ApiError(
      500,
      "Apple Root CA PEM is not configured. " +
        "Set the APPLE_ROOT_CA_PEM environment variable to the PEM-encoded " +
        "Apple Root CA - G3 certificate (available at https://www.apple.com/certificateauthority/)."
    );
  }
  return pem;
}

// ---------------------------------------------------------------------------
// Public — verify and decode an Apple App Store signed payload (JWS)
// ---------------------------------------------------------------------------

/**
 * Verifies an Apple App Store Server Notification `signedPayload` and returns
 * the decoded notification.
 *
 * Verification steps:
 *  1. Parse the JWS (header.payload.signature)
 *  2. Extract the x5c certificate chain from the header
 *  3. Verify each certificate is signed by the next in the chain
 *  4. Verify the chain root against the Apple Root CA (from APPLE_ROOT_CA_PEM)
 *  5. Verify the JWS signature with the leaf certificate's public key (ES256)
 *  6. Decode the notification payload and any nested JWS payloads
 */
export async function verifyAppleSignedPayload(signedPayload: string): Promise<DecodedAppleNotification> {
  // 1. Split the compact JWS serialisation
  const parts = signedPayload.split(".");
  if (parts.length !== 3) {
    throw new ApiError(400, "Invalid Apple signed payload format");
  }
  const [headerB64, payloadB64, sigB64] = parts;

  // 2. Decode header and extract the x5c certificate chain
  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as {
    alg?: string;
    x5c?: string[];
  };

  const x5c = header.x5c;
  if (!x5c || x5c.length < 2) {
    throw new ApiError(400, "Invalid certificate chain in Apple signed payload");
  }

  // 3. Build X509Certificate objects from DER-encoded base64 values in x5c
  let certs: X509Certificate[];
  try {
    certs = x5c.map((der) => new X509Certificate(Buffer.from(der, "base64")));
  } catch (err) {
    throw new ApiError(
      400,
      `Failed to parse Apple certificate chain: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 4. Verify internal chain: each cert must be signed by the next
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].verify(certs[i + 1].publicKey)) {
      throw new ApiError(400, "Apple certificate chain verification failed");
    }
  }

  // 5. Verify the chain root against the configured Apple Root CA
  const rootCaPem = await getAppleRootCaPem();
  let appleRoot: X509Certificate;
  try {
    appleRoot = new X509Certificate(rootCaPem);
  } catch (err) {
    throw new ApiError(
      500,
      `Failed to parse configured Apple Root CA certificate: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const chainRoot = certs[certs.length - 1];
  if (chainRoot.fingerprint256 !== appleRoot.fingerprint256) {
    throw new ApiError(400, "Certificate chain root does not match Apple Root CA");
  }

  // 6. Verify the JWS signature with the leaf certificate (ES256 = ECDSA P-256 SHA-256)
  // The JWS uses the ieee-p1363 (raw R||S) signature encoding, supported by
  // Node.js 16+ via the dsaEncoding option.
  const message = Buffer.from(`${headerB64}.${payloadB64}`);
  const sig = Buffer.from(sigB64, "base64url");

  const isValid = verify(
    "SHA256",
    message,
    { key: certs[0].publicKey, dsaEncoding: "ieee-p1363" },
    sig
  );

  if (!isValid) {
    throw new ApiError(400, "Apple signed payload signature verification failed");
  }

  // 7. Decode the notification payload
  const notification = JSON.parse(
    Buffer.from(payloadB64, "base64url").toString("utf8")
  ) as DecodedAppleNotification;

  if (!notification.notificationType) {
    throw new ApiError(400, "Invalid Apple notification: missing notificationType");
  }

  // 8. Decode nested JWS payloads (already authenticated by the outer payload)
  if (notification.data?.signedTransactionInfo) {
    notification.transactionInfo = decodeJWSPayloadUnsafe(
      notification.data.signedTransactionInfo
    ) as AppleJWSTransactionDecodedPayload;
  }

  if (notification.data?.signedRenewalInfo) {
    notification.renewalInfo = decodeJWSPayloadUnsafe(
      notification.data.signedRenewalInfo
    ) as AppleJWSRenewalInfoDecodedPayload;
  }

  return notification;
}
