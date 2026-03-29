import express, { Request, Response } from "express";
import { getDb } from "../db/db";
import health from "../db/health";
import { version } from "../../package.json";

const HEALTH_CHECK_TIMEOUT_MS = 3000;

const healthRouter = express.Router();

/**
 * GET /health
 * Performs a database connectivity check and returns the result.
 */
healthRouter.route("/").get(async (req: Request, res: Response) => {
  try {
    const db = getDb();

    const verbose = req.query.verbose === "true";

    let timeoutId!: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("DB health check timed out")),
        HEALTH_CHECK_TIMEOUT_MS
      );
    });

    try {
      const result = await Promise.race([
        health.getDBConnectionHealth(db, verbose),
        timeoutPromise,
      ]);
      clearTimeout(timeoutId);

      res.status(200).json({
        status: "ok",
        version,
        environment: process.env.NODE_ENV ?? "development",
        uptime_seconds: Math.floor(process.uptime()),
        db: { connected: result.connected },
      });
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: true,
      errorMsg: (error as Error).message,
    });
  }
});

export default healthRouter;