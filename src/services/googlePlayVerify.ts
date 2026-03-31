import * as crypto from "crypto";
import { ApiError } from "../utils/ApiError";
import { getAppConfigValue } from "../aws/getAppConfig";

// ---------------------------------------------------------------------------
// Types for Google Play Developer API (purchases.subscriptions.get)
// ---------------------------------------------------------------------------

interface GoogleSubscriptionPurchase {
  kind: string;
  startTimeMillis: string;
  expiryTimeMillis: string;
  autoRenewing: boolean;
  orderId?: string;
  purchaseType?: number; // 0 = test purchase; absent = production
  [key: string]: unknown;
}

export interface GooglePlayVerifyResult {
  is_active: boolean;
  expires_at: Date;
  product_id: string;
  purchase_token: string;
  order_id: string | null;
  environment: "production" | "sandbox";
  raw_receipt: string;
}

// ---------------------------------------------------------------------------
// Internal helpers — service-account JWT auth for Google APIs
// ---------------------------------------------------------------------------

function base64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getGoogleAccessToken(): Promise<string> {
  const keyJson = await getAppConfigValue("GOOGLE_SERVICE_ACCOUNT_KEY", {
    required: true,
  });
  if (!keyJson) {
    throw new ApiError(500, "Google service account key is not configured");
  }

  let key: { client_email: string; private_key: string };
  try {
    key = JSON.parse(keyJson);
  } catch {
    throw new ApiError(500, "Google service account key is malformed");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signatureB64url = base64url(sign.sign(key.private_key));
  const jwt = `${signingInput}.${signatureB64url}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    throw new ApiError(502, "Failed to obtain Google access token");
  }

  const data = (await response.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new ApiError(502, "Failed to obtain Google access token", {
      error: data.error,
    });
  }

  return data.access_token;
}

// ---------------------------------------------------------------------------
// Public — verify a Google Play subscription purchase
// ---------------------------------------------------------------------------

export async function verifyGooglePurchase(
  packageName: string,
  productId: string,
  purchaseToken: string
): Promise<GooglePlayVerifyResult> {
  const accessToken = await getGoogleAccessToken();

  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404) {
    throw new ApiError(400, "Purchase not found on Google Play");
  }

  if (!response.ok) {
    throw new ApiError(502, "Google Play verification service unavailable", {
      http_status: response.status,
    });
  }

  const data = (await response.json()) as GoogleSubscriptionPurchase;

  const expiresAt = new Date(parseInt(data.expiryTimeMillis, 10));
  const isActive = expiresAt > new Date();
  const environment: "production" | "sandbox" =
    data.purchaseType === 0 ? "sandbox" : "production";

  return {
    is_active: isActive,
    expires_at: expiresAt,
    product_id: productId,
    purchase_token: purchaseToken,
    order_id: data.orderId ?? null,
    environment,
    raw_receipt: JSON.stringify(data),
  };
}
