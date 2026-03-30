import express, { NextFunction, Request, Response } from "express";
import { protectedRoute } from "../middleware/protectedRoute";
import { runAlertEvaluator } from "../jobs/alertEvaluator";
import { getDb } from "../db/db";

const internalRouter = express.Router();

/**
 * POST /api/internal/trigger-alerts
 * Triggers the alert evaluator job. Intended to be called by a CloudWatch
 * scheduled event or cron Lambda.
 *
 * Protected via the `protectedRoute` middleware — requires the
 * `x-internal-key` header to match the `INTERNAL_API_KEY` env var.
 */
internalRouter.post(
  "/trigger-alerts",
  protectedRoute,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await runAlertEvaluator(getDb());
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default internalRouter;
