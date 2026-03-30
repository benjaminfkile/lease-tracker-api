import express, { NextFunction, Request, Response } from "express";
import { authAndLoad } from "../middleware/authAndLoad";
import { getLeases } from "../db/leases";

const leasesRouter = express.Router();

/**
 * GET /api/leases
 * Returns all active leases for the authenticated user (owned + shared via
 * lease_members), including the user's role per lease, ordered by
 * lease_end_date ASC (soonest ending first).
 */
leasesRouter.get(
  "/",
  authAndLoad,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const leases = await getLeases(req.dbUser!.id);
      res.status(200).json(leases);
    } catch (err) {
      next(err);
    }
  }
);

export default leasesRouter;
