import express, { NextFunction, Request, Response } from "express";
import { authAndLoad } from "../middleware/authAndLoad";
import { validate } from "../middleware/validate";
import {
  VerifyAppleReceiptSchema,
  VerifyAppleReceiptInput,
  VerifyGoogleReceiptSchema,
  VerifyGoogleReceiptInput,
} from "../validation/schemas";
import { verifyAppleReceipt } from "../services/appleReceipt";
import { verifyAppleSignedPayload } from "../services/appleWebhook";
import { verifyGooglePurchase } from "../services/googlePlayVerify";
import {
  upsertSubscription,
  getSubscriptionStatus,
  handleAppleNotification,
  handleGoogleNotification,
} from "../db/subscriptions";
import { ApiError } from "../utils/ApiError";
import { getAppSecrets } from "../aws/getAppSecrets";

const subscriptionsRouter = express.Router();

/**
 * GET /api/subscriptions/status
 * Returns current subscription status for the authenticated user.
 * Re-checks expiry against NOW() so stale is_active flags are not trusted.
 */
subscriptionsRouter.get(
  "/status",
  authAndLoad,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await getSubscriptionStatus(req.dbUser!.id);
      res.status(200).json(status);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/subscriptions/apple/verify
 * Verifies an Apple App Store receipt, upserts the subscription record,
 * and upgrades the user's tier to "premium".
 * Body: { receipt_data: string, product_id: string }
 * Returns: { is_active, expires_at, product_id }
 */
subscriptionsRouter.post(
  "/apple/verify",
  authAndLoad,
  validate(VerifyAppleReceiptSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { receipt_data } = req.body as VerifyAppleReceiptInput;

      const result = await verifyAppleReceipt(receipt_data);

      await upsertSubscription(req.dbUser!.id, {
        platform: "apple",
        product_id: result.product_id,
        transaction_id: result.transaction_id,
        ...(result.original_transaction_id != null && {
          original_transaction_id: result.original_transaction_id,
        }),
        is_active: result.is_active,
        expires_at: result.expires_at,
        environment: result.environment,
        raw_receipt: result.raw_receipt,
      });

      res.status(200).json({
        is_active: result.is_active,
        expires_at: result.expires_at,
        product_id: result.product_id,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/subscriptions/google/verify
 * Verifies a Google Play purchase token, upserts the subscription record,
 * and upgrades the user's tier to "premium".
 * Body: { product_id: string, purchase_token: string }
 * Returns: { is_active, expires_at, product_id }
 */
subscriptionsRouter.post(
  "/google/verify",
  authAndLoad,
  validate(VerifyGoogleReceiptSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { product_id, purchase_token } = req.body as VerifyGoogleReceiptInput;

      const { GOOGLE_PLAY_PACKAGE_NAME: packageName } = await getAppSecrets();
      if (!packageName) {
        throw new ApiError(500, "Google Play package name is not configured");
      }

      const result = await verifyGooglePurchase(packageName, product_id, purchase_token);

      await upsertSubscription(req.dbUser!.id, {
        platform: "google",
        product_id: result.product_id,
        transaction_id: result.order_id,
        purchase_token: result.purchase_token,
        is_active: result.is_active,
        expires_at: result.expires_at,
        environment: result.environment,
        raw_receipt: result.raw_receipt,
      });

      res.status(200).json({
        is_active: result.is_active,
        expires_at: result.expires_at,
        product_id: result.product_id,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/subscriptions/apple/webhook
 * Receives signed JWT (JWS) notifications from Apple's App Store Server
 * Notifications service for events such as renewals, cancellations, billing
 * retries, and grace periods.
 *
 * The signedPayload is verified against Apple's certificate chain and the
 * subscription record is updated accordingly.
 *
 * Always returns 200 — Apple retries on any non-2xx response.
 */
subscriptionsRouter.post(
  "/apple/webhook",
  async (req: Request, res: Response) => {
    try {
      const { signedPayload } = req.body as { signedPayload?: unknown };

      if (signedPayload && typeof signedPayload === "string") {
        const notification = await verifyAppleSignedPayload(signedPayload);
        await handleAppleNotification(notification);
      }
    } catch (err) {
      console.error("[apple/webhook] error processing notification:", err);
    }

    res.status(200).json({ received: true });
  }
);

// ---------------------------------------------------------------------------
// Google Pub/Sub push message types
// ---------------------------------------------------------------------------

interface GoogleSubscriptionNotification {
  version: string;
  notificationType: number;
  purchaseToken: string;
  subscriptionId: string;
}

interface GoogleDeveloperNotification {
  version: string;
  packageName: string;
  eventTimeMillis: string;
  subscriptionNotification?: GoogleSubscriptionNotification;
}

/**
 * POST /api/subscriptions/google/webhook
 * Receives Pub/Sub push notifications from Google Play billing for events
 * such as renewals, cancellations, and expirations.
 *
 * The Pub/Sub message `data` field is base64-decoded to obtain the
 * DeveloperNotification.  For `subscriptionNotification` events the purchase
 * token is re-verified against the Google Play Developer API and the
 * subscription record and user tier are updated accordingly.
 *
 * Always returns 200 — Google retries on any non-2xx response.
 */
subscriptionsRouter.post(
  "/google/webhook",
  async (req: Request, res: Response) => {
    try {
      const body = req.body as { message?: { data?: unknown } };
      const rawData = body.message?.data;

      if (rawData && typeof rawData === "string") {
        let notification: GoogleDeveloperNotification;
        try {
          notification = JSON.parse(
            Buffer.from(rawData, "base64").toString("utf8")
          ) as GoogleDeveloperNotification;
        } catch {
          // Malformed base64/JSON payload — nothing actionable
          res.status(200).json({ received: true });
          return;
        }

        const sn = notification.subscriptionNotification;
        if (sn?.purchaseToken && sn.subscriptionId) {
          const { GOOGLE_PLAY_PACKAGE_NAME: packageName } = await getAppSecrets();
          if (packageName) {
            const verifyResult = await verifyGooglePurchase(
              packageName,
              sn.subscriptionId,
              sn.purchaseToken
            );
            await handleGoogleNotification(sn.purchaseToken, verifyResult);
          }
        }
      }
    } catch (err) {
      console.error("[google/webhook] error processing notification:", err);
    }

    res.status(200).json({ received: true });
  }
);

export default subscriptionsRouter;
