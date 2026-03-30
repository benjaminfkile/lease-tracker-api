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
import { verifyGooglePurchase } from "../services/googlePlayVerify";
import { upsertSubscription, getSubscriptionStatus } from "../db/subscriptions";
import { ApiError } from "../utils/ApiError";

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

      const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
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

export default subscriptionsRouter;
