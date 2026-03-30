import express, { NextFunction, Request, Response } from "express";
import { authAndLoad } from "../middleware/authAndLoad";
import { validate } from "../middleware/validate";
import { VerifyAppleReceiptSchema, VerifyAppleReceiptInput } from "../validation/schemas";
import { verifyAppleReceipt } from "../services/appleReceipt";
import { upsertSubscription } from "../db/subscriptions";

const subscriptionsRouter = express.Router();

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

export default subscriptionsRouter;
