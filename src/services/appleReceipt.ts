import { ApiError } from "../utils/ApiError";
import { getAppSecrets } from "../aws/getAppSecrets";

// ---------------------------------------------------------------------------
// Types for Apple's verifyReceipt API
// ---------------------------------------------------------------------------

interface AppleLatestReceiptInfo {
  expires_date_ms: string;
  product_id: string;
  transaction_id: string;
  original_transaction_id?: string;
  [key: string]: unknown;
}

interface AppleVerifyReceiptResponse {
  status: number;
  latest_receipt_info?: AppleLatestReceiptInfo[];
  latest_receipt?: string;
  [key: string]: unknown;
}

export interface AppleReceiptResult {
  is_active: boolean;
  expires_at: Date;
  product_id: string;
  transaction_id: string;
  original_transaction_id: string | undefined;
  environment: "production" | "sandbox";
  raw_receipt: string;
}

// ---------------------------------------------------------------------------
// Internal helper — calls one Apple endpoint and returns parsed JSON
// ---------------------------------------------------------------------------

async function callAppleVerifyReceipt(
  receiptData: string,
  sandbox: boolean
): Promise<AppleVerifyReceiptResponse> {
  const url = sandbox
    ? "https://sandbox.itunes.apple.com/verifyReceipt"
    : "https://buy.itunes.apple.com/verifyReceipt";

  const { APPLE_SHARED_SECRET: password } = await getAppSecrets();

  if (!password) {
    throw new ApiError(500, "Apple shared secret is not configured");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      "receipt-data": receiptData,
      password,
      "exclude-old-transactions": true,
    }),
  });

  if (!response.ok) {
    throw new ApiError(502, "Apple receipt verification service unavailable", {
      http_status: response.status,
    });
  }

  return response.json() as Promise<AppleVerifyReceiptResponse>;
}

// ---------------------------------------------------------------------------
// Public — verify an Apple receipt, production first with sandbox fallback
// ---------------------------------------------------------------------------

export async function verifyAppleReceipt(
  receiptData: string
): Promise<AppleReceiptResult> {
  // Try production endpoint first
  let appleResponse = await callAppleVerifyReceipt(receiptData, false);
  let environment: "production" | "sandbox" = "production";

  // Status 21007 means a sandbox receipt was sent to production — retry
  if (appleResponse.status === 21007) {
    appleResponse = await callAppleVerifyReceipt(receiptData, true);
    environment = "sandbox";
  }

  if (appleResponse.status !== 0) {
    throw new ApiError(
      400,
      `Apple receipt verification failed`,
      { apple_status: appleResponse.status }
    );
  }

  const latestReceiptInfo = appleResponse.latest_receipt_info;
  if (!latestReceiptInfo || latestReceiptInfo.length === 0) {
    throw new ApiError(400, "No receipt info returned by Apple");
  }

  // Pick the entry with the highest expires_date_ms (most recent renewal)
  const latest = latestReceiptInfo.reduce((best, cur) =>
    parseInt(cur.expires_date_ms, 10) > parseInt(best.expires_date_ms, 10)
      ? cur
      : best
  );

  const expiresAt = new Date(parseInt(latest.expires_date_ms, 10));
  const isActive = expiresAt > new Date();

  return {
    is_active: isActive,
    expires_at: expiresAt,
    product_id: latest.product_id,
    transaction_id: latest.transaction_id,
    original_transaction_id: latest.original_transaction_id,
    environment,
    raw_receipt: appleResponse.latest_receipt ?? receiptData,
  };
}
