import express, { NextFunction, Request, Response } from "express";
import { authAndLoad } from "../middleware/authAndLoad";
import { validate } from "../middleware/validate";
import { requireLeaseAccess } from "../middleware/requireLeaseAccess";
import {
  CreateLeaseSchema,
  CreateLeaseInput,
  UpdateLeaseSchema,
  UpdateLeaseInput,
  CreateOdometerReadingSchema,
  CreateOdometerReadingInput,
} from "../validation/schemas";
import { getLeases, createLease, getLease, updateLease, deleteLease } from "../db/leases";
import { getReadings, createOdometerReading } from "../db/readings";
import { createLeaseMember } from "../db/leaseMembers";
import { createDefaultAlertConfigs } from "../db/alertConfigs";
import { getReservedTripMiles } from "../db/savedTrips";
import { computeLeaseSummary } from "../utils/leaseCalculations";
import { ApiError } from "../utils/ApiError";

const leasesRouter = express.Router();

// Schema for the POST readings body — lease_id comes from the URL param, not the body.
const CreateReadingBodySchema = CreateOdometerReadingSchema.omit({ lease_id: true });
type CreateReadingBodyInput = Omit<CreateOdometerReadingInput, "lease_id">;

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
 * GET /api/leases/:leaseId/readings
 * Returns all odometer readings for the lease ordered by reading_date DESC.
 * Supports optional query params:
 *   ?limit=<n>       – cap the number of results returned
 *   ?before=<date>   – only return readings with reading_date < date (YYYY-MM-DD)
 * Requires at least 'viewer' role.
 */
leasesRouter.get(
  "/:leaseId/readings",
  authAndLoad,
  requireLeaseAccess("viewer"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, before } = req.query;

      let parsedLimit: number | undefined;
      if (limit !== undefined) {
        parsedLimit = parseInt(String(limit), 10);
        if (isNaN(parsedLimit) || parsedLimit < 1) {
          next(new ApiError(400, "limit must be a positive integer"));
          return;
        }
      }

      let parsedBefore: string | undefined;
      if (before !== undefined) {
        parsedBefore = String(before);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedBefore)) {
          next(new ApiError(400, "before must be a valid date (YYYY-MM-DD)"));
          return;
        }
      }

      const readings = await getReadings(req.params.leaseId, {
        limit: parsedLimit,
        before: parsedBefore,
      });
      res.status(200).json(readings);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/leases/:leaseId/readings
 * Records a new odometer reading for the lease.
 * Business rules enforced:
 *   - reading_date must be on or after the lease start date
 *   - odometer must be >= the lease's starting_odometer
 *   - odometer must not go backward (must be >= current_odometer cache)
 * After inserting the row the lease's current_odometer cache is updated if
 * the new value is the highest recorded so far.
 * Requires at least 'editor' role.
 */
leasesRouter.post(
  "/:leaseId/readings",
  authAndLoad,
  requireLeaseAccess("editor"),
  validate(CreateReadingBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leaseId } = req.params;
      const data = req.body as CreateReadingBodyInput;

      const lease = await getLease(leaseId);
      if (!lease) {
        next(new ApiError(404, "Lease not found"));
        return;
      }

      if (data.reading_date < lease.lease_start_date) {
        next(
          new ApiError(
            400,
            "reading_date must be on or after the lease start date"
          )
        );
        return;
      }

      if (data.odometer < lease.starting_odometer) {
        next(
          new ApiError(
            400,
            "odometer must be greater than or equal to the lease starting odometer"
          )
        );
        return;
      }

      if (
        lease.current_odometer !== null &&
        data.odometer < lease.current_odometer
      ) {
        next(new ApiError(400, "odometer reading cannot go backward"));
        return;
      }

      const reading = await createOdometerReading(leaseId, req.dbUser!.id, data);
      res.status(201).json(reading);
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
