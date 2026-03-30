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
  UpdateOdometerReadingSchema,
  UpdateOdometerReadingInput,
  CreateSavedTripSchema,
  CreateSavedTripInput,
  UpdateSavedTripSchema,
  UpdateSavedTripInput,
  CreateAlertConfigSchema,
  CreateAlertConfigInput,
  UpdateAlertConfigSchema,
  UpdateAlertConfigInput,
  InviteMemberSchema,
  InviteMemberInput,
} from "../validation/schemas";
import { getLeases, createLease, getLease, updateLease, deleteLease } from "../db/leases";
import { getReadings, createOdometerReading, getReading, getMaxOdometerExcluding, updateOdometerReading, deleteOdometerReading } from "../db/readings";
import { createLeaseMember, getLeaseMember, getLeaseMembers, leaseExists, acceptLeaseMember } from "../db/leaseMembers";
import { createDefaultAlertConfigs, getAlertConfigs, createAlertConfig, getAlertConfig, updateAlertConfig, deleteAlertConfig } from "../db/alertConfigs";
import { getReservedTripMiles, getTrips, createTrip, getTrip, updateTrip, deleteTrip } from "../db/savedTrips";
import { getUserByEmail } from "../db/users";
import { computeLeaseSummary } from "../utils/leaseCalculations";
import { ApiError } from "../utils/ApiError";
import { sendPushNotification } from "../services/pushNotifications";

const leasesRouter = express.Router();

// Schema for the POST readings body — lease_id comes from the URL param, not the body.
const CreateReadingBodySchema = CreateOdometerReadingSchema.omit({ lease_id: true });
type CreateReadingBodyInput = Omit<CreateOdometerReadingInput, "lease_id">;

// Schema for the POST trips body — lease_id comes from the URL param, not the body.
const CreateTripBodySchema = CreateSavedTripSchema.omit({ lease_id: true });
type CreateTripBodyInput = Omit<CreateSavedTripInput, "lease_id">;

// Schema for the POST alerts body — lease_id comes from the URL param, not the body.
const CreateAlertConfigBodySchema = CreateAlertConfigSchema.omit({ lease_id: true });
type CreateAlertConfigBodyInput = Omit<CreateAlertConfigInput, "lease_id">;

// Schema for the POST members body — lease_id comes from the URL param, not the body.
const InviteMemberBodySchema = InviteMemberSchema.omit({ lease_id: true });
type InviteMemberBodyInput = Omit<InviteMemberInput, "lease_id">;

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
 * GET /api/leases/:leaseId/members
 * Returns all members of the lease including their display_name and email.
 * Requires at least 'viewer' role.
 */
leasesRouter.get(
  "/:leaseId/members",
  authAndLoad,
  requireLeaseAccess("viewer"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const members = await getLeaseMembers(req.params.leaseId);
      res.status(200).json(members);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/leases/:leaseId/members
 * Invites a registered user (by email) to the lease as a viewer or editor.
 * Creates a lease_members row with accepted_at = NULL.
 * Sends a push notification to the invitee if they have a push_token.
 * Requires 'owner' role.
 */
leasesRouter.post(
  "/:leaseId/members",
  authAndLoad,
  requireLeaseAccess("owner"),
  validate(InviteMemberBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leaseId } = req.params;
      const { email, role } = req.body as InviteMemberBodyInput;

      const invitee = await getUserByEmail(email);
      if (!invitee) {
        next(new ApiError(404, "User not found"));
        return;
      }

      const existing = await getLeaseMember(leaseId, invitee.id);
      if (existing) {
        next(new ApiError(409, "User is already a member of this lease"));
        return;
      }

      const member = await createLeaseMember(
        leaseId,
        invitee.id,
        role ?? "viewer",
        req.dbUser!.id
      );

      if (invitee.push_token) {
        await sendPushNotification(
          invitee.push_token,
          "Lease Invitation",
          "You have been invited to access a lease."
        );
      }

      res.status(201).json(member);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/leases/:leaseId/members/accept
 * Accepts an outstanding invitation for the current user by setting
 * accepted_at = NOW(). Returns 404 if no invitation exists, 409 if
 * the invitation has already been accepted.
 */
leasesRouter.post(
  "/:leaseId/members/accept",
  authAndLoad,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leaseId } = req.params;
      const userId = req.dbUser!.id;

      const invitation = await getLeaseMember(leaseId, userId);
      if (!invitation) {
        const exists = await leaseExists(leaseId);
        const message = exists ? "Invitation not found" : "Lease not found";
        next(new ApiError(404, message));
        return;
      }

      if (invitation.accepted_at !== null) {
        next(new ApiError(409, "Invitation already accepted"));
        return;
      }

      const member = await acceptLeaseMember(leaseId, userId);
      res.status(200).json(member);
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
 * GET /api/leases/:leaseId/alerts
 * Returns all alert configs for the lease, ordered by created_at ASC.
 * Requires at least 'viewer' role.
 */
leasesRouter.get(
  "/:leaseId/alerts",
  authAndLoad,
  requireLeaseAccess("viewer"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alerts = await getAlertConfigs(req.params.leaseId);
      res.status(200).json(alerts);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/leases/:leaseId/alerts
 * Creates a custom alert config for the lease.
 * Requires at least 'editor' role.
 */
leasesRouter.post(
  "/:leaseId/alerts",
  authAndLoad,
  requireLeaseAccess("editor"),
  validate(CreateAlertConfigBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req.body as CreateAlertConfigBodyInput;
      const alert = await createAlertConfig(req.params.leaseId, req.dbUser!.id, data);
      res.status(201).json(alert);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/leases/:leaseId/alerts/:alertId
 * Toggles is_enabled and/or adjusts threshold_value on an existing alert config.
 * Requires at least 'editor' role.
 */
leasesRouter.put(
  "/:leaseId/alerts/:alertId",
  authAndLoad,
  requireLeaseAccess("editor"),
  validate(UpdateAlertConfigSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leaseId, alertId } = req.params;
      const data = req.body as UpdateAlertConfigInput;

      const existing = await getAlertConfig(leaseId, alertId);
      if (!existing) {
        next(new ApiError(404, "Alert config not found"));
        return;
      }

      const updated = await updateAlertConfig(leaseId, alertId, data);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/leases/:leaseId/alerts/:alertId
 * Deletes an alert config for the lease. Requires at least 'editor' role.
 */
leasesRouter.delete(
  "/:leaseId/alerts/:alertId",
  authAndLoad,
  requireLeaseAccess("editor"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leaseId, alertId } = req.params;
      const alert = await deleteAlertConfig(leaseId, alertId);
      if (!alert) {
        next(new ApiError(404, "Alert config not found"));
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/leases/:leaseId/trips
 * Returns all saved trips for the lease separated into active and completed,
 * ordered by trip_date ASC NULLS LAST.
 * Requires at least 'viewer' role.
 */
leasesRouter.get(
  "/:leaseId/trips",
  authAndLoad,
  requireLeaseAccess("viewer"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const trips = await getTrips(req.params.leaseId);
      const active = trips.filter((t) => !t.is_completed);
      const completed = trips.filter((t) => t.is_completed);
      res.status(200).json({ active, completed });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/leases/:leaseId/trips
 * Creates a new saved trip for the lease.
 * estimated_miles must be >= 1.
 * Requires at least 'editor' role.
 */
leasesRouter.post(
  "/:leaseId/trips",
  authAndLoad,
  requireLeaseAccess("editor"),
  validate(CreateTripBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req.body as CreateTripBodyInput;
      const trip = await createTrip(req.params.leaseId, req.dbUser!.id, data);
      res.status(201).json(trip);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/leases/:leaseId/trips/:tripId
 * Updates an existing saved trip.
 * Updatable fields: name, estimated_miles, trip_date, notes, is_completed.
 * Requires at least 'editor' role.
 */
leasesRouter.put(
  "/:leaseId/trips/:tripId",
  authAndLoad,
  requireLeaseAccess("editor"),
  validate(UpdateSavedTripSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leaseId, tripId } = req.params;
      const data = req.body as UpdateSavedTripInput;

      const existing = await getTrip(leaseId, tripId);
      if (!existing) {
        next(new ApiError(404, "Trip not found"));
        return;
      }

      const updated = await updateTrip(leaseId, tripId, data);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/leases/:leaseId/trips/:tripId
 * Deletes a saved trip. Requires at least 'editor' role.
 */
leasesRouter.delete(
  "/:leaseId/trips/:tripId",
  authAndLoad,
  requireLeaseAccess("editor"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leaseId, tripId } = req.params;
      const trip = await deleteTrip(leaseId, tripId);
      if (!trip) {
        next(new ApiError(404, "Trip not found"));
        return;
      }
      res.status(204).send();
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
 * PUT /api/leases/:leaseId/readings/:readingId
 * Updates an existing odometer reading.
 * Notes and reading_date may be edited freely.
 * When odometer is updated it must still pass:
 *   - the minimum validation (>= lease's starting_odometer)
 *   - the ordering validation (>= the highest odometer among all other readings)
 * After updating, the lease's current_odometer cache is recomputed with MAX(odometer).
 * Requires at least 'editor' role.
 */
leasesRouter.put(
  "/:leaseId/readings/:readingId",
  authAndLoad,
  requireLeaseAccess("editor"),
  validate(UpdateOdometerReadingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leaseId, readingId } = req.params;
      const data = req.body as UpdateOdometerReadingInput;

      const lease = await getLease(leaseId);
      if (!lease) {
        next(new ApiError(404, "Lease not found"));
        return;
      }

      const existing = await getReading(leaseId, readingId);
      if (!existing) {
        next(new ApiError(404, "Reading not found"));
        return;
      }

      if (data.odometer !== undefined) {
        if (data.odometer < lease.starting_odometer) {
          next(
            new ApiError(
              400,
              "odometer must be greater than or equal to the lease starting odometer"
            )
          );
          return;
        }

        const maxOther = await getMaxOdometerExcluding(leaseId, readingId);
        if (maxOther !== null && data.odometer < maxOther) {
          next(new ApiError(400, "odometer reading cannot go backward"));
          return;
        }
      }

      const updated = await updateOdometerReading(leaseId, readingId, data);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/leases/:leaseId/readings/:readingId
 * Deletes an odometer reading and recomputes the lease's current_odometer cache
 * using MAX(odometer) from remaining readings, or starting_odometer if none remain.
 * Requires at least 'editor' role.
 */
leasesRouter.delete(
  "/:leaseId/readings/:readingId",
  authAndLoad,
  requireLeaseAccess("editor"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leaseId, readingId } = req.params;
      const reading = await deleteOdometerReading(leaseId, readingId);
      if (!reading) {
        next(new ApiError(404, "Reading not found"));
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

/**
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
