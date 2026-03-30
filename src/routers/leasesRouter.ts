import express, { NextFunction, Request, Response } from "express";
import { authAndLoad } from "../middleware/authAndLoad";
import { validate } from "../middleware/validate";
import { CreateLeaseSchema, CreateLeaseInput } from "../validation/schemas";
import { getLeases, createLease } from "../db/leases";
import { createLeaseMember } from "../db/leaseMembers";
import { createDefaultAlertConfigs } from "../db/alertConfigs";

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

/**
 * POST /api/leases
 * Creates a new lease for the authenticated user, auto-creates an owner
 * record in lease_members, and seeds default alert configs.
 */
leasesRouter.post(
  "/",
  authAndLoad,
  validate(CreateLeaseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req.body as CreateLeaseInput;
      const lease = await createLease(req.dbUser!.id, data);
      await createLeaseMember(lease.id, req.dbUser!.id, "owner");
      await createDefaultAlertConfigs(lease.id, req.dbUser!.id);
      res.status(201).json(lease);
    } catch (err) {
      next(err);
    }
  }
);

export default leasesRouter;
