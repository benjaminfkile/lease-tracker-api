import express, { NextFunction, Request, Response } from "express";
import { authAndLoad } from "../middleware/authAndLoad";
import { validate } from "../middleware/validate";
import { requireLeaseAccess } from "../middleware/requireLeaseAccess";
import { CreateLeaseSchema, CreateLeaseInput, UpdateLeaseSchema, UpdateLeaseInput } from "../validation/schemas";
import { getLeases, createLease, getLease, updateLease, deleteLease } from "../db/leases";
import { createLeaseMember } from "../db/leaseMembers";
import { createDefaultAlertConfigs } from "../db/alertConfigs";
import { getReservedTripMiles } from "../db/savedTrips";
import { computeLeaseSummary } from "../utils/leaseCalculations";
import { ApiError } from "../utils/ApiError";

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

/**
 * GET /api/leases/:leaseId
 * Returns a single lease with its member list. Requires at least 'viewer' role.
 */
leasesRouter.get(
  "/:leaseId",
  authAndLoad,
  requireLeaseAccess("viewer"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lease = await getLease(req.params.leaseId);
      if (!lease) {
        next(new ApiError(404, "Lease not found"));
        return;
      }
      res.status(200).json(lease);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/leases/:leaseId
 * Updates lease fields. Requires at least 'editor' role.
 */
leasesRouter.put(
  "/:leaseId",
  authAndLoad,
  requireLeaseAccess("editor"),
  validate(UpdateLeaseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req.body as UpdateLeaseInput;
      const lease = await updateLease(req.params.leaseId, data);
      if (!lease) {
        next(new ApiError(404, "Lease not found"));
        return;
      }
      res.status(200).json(lease);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/leases/:leaseId/summary
 * Returns computed analytics for the lease: mileage, pace, projections, and
 * trip-reservation totals. Requires at least 'viewer' role.
 */
leasesRouter.get(
  "/:leaseId/summary",
  authAndLoad,
  requireLeaseAccess("viewer"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lease = await getLease(req.params.leaseId);
      if (!lease) {
        next(new ApiError(404, "Lease not found"));
        return;
      }
      const reservedTripMiles = await getReservedTripMiles(req.params.leaseId);
      const summary = computeLeaseSummary(
        lease,
        reservedTripMiles,
        req.dbUser!.subscription_tier
      );
      res.status(200).json(summary);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/leases/:leaseId
 * Soft-deletes a lease by setting is_active = false. Only the lease owner
 * may delete. Preserves history — no data is permanently removed.
 */
leasesRouter.delete(
  "/:leaseId",
  authAndLoad,
  requireLeaseAccess("owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lease = await deleteLease(req.params.leaseId);
      if (!lease) {
        next(new ApiError(404, "Lease not found"));
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default leasesRouter;
