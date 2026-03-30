import { getDb } from "./db";
import { ISavedTrip } from "../interfaces";
import { CreateSavedTripInput, UpdateSavedTripInput } from "../validation/schemas";

/**
 * Returns the sum of estimated_miles for all active (not completed) saved
 * trips belonging to the given lease. Returns 0 when no active trips exist.
 */
export async function getReservedTripMiles(leaseId: string): Promise<number> {
  const db = getDb();
  const result = await db("saved_trips")
    .where({ lease_id: leaseId, is_completed: false })
    .sum("estimated_miles as total")
    .first<{ total: string | number | null }>();

  return Number(result?.total ?? 0);
}

/**
 * Returns all saved trips for the given lease ordered by trip_date ASC NULLS LAST.
 */
export async function getTrips(leaseId: string): Promise<ISavedTrip[]> {
  const db = getDb();
  return db("saved_trips")
    .where({ lease_id: leaseId })
    .orderByRaw("trip_date ASC NULLS LAST");
}

/**
 * Inserts a new saved trip for the given lease.
 *
 * @param leaseId - UUID of the lease
 * @param userId  - UUID of the user creating the trip
 * @param data    - Validated trip payload (without lease_id)
 */
export async function createTrip(
  leaseId: string,
  userId: string,
  data: Omit<CreateSavedTripInput, "lease_id">
): Promise<ISavedTrip> {
  const db = getDb();
  const [trip] = await db<ISavedTrip>("saved_trips")
    .insert({
      lease_id: leaseId,
      user_id: userId,
      name: data.name,
      estimated_miles: data.estimated_miles,
      trip_date: data.trip_date ?? null,
      notes: data.notes ?? null,
      is_completed: data.is_completed ?? false,
    })
    .returning("*");
  return trip;
}

/**
 * Returns a single saved trip by lease and trip id.
 * Returns undefined when no matching trip exists.
 */
export async function getTrip(
  leaseId: string,
  tripId: string
): Promise<ISavedTrip | undefined> {
  const db = getDb();
  return db<ISavedTrip>("saved_trips")
    .where({ id: tripId, lease_id: leaseId })
    .first();
}

/**
 * Updates the specified fields of an existing saved trip and returns the
 * updated record. Returns undefined when no matching trip exists.
 */
export async function updateTrip(
  leaseId: string,
  tripId: string,
  data: Omit<UpdateSavedTripInput, "lease_id">
): Promise<ISavedTrip | undefined> {
  const db = getDb();
  const [trip] = await db<ISavedTrip>("saved_trips")
    .where({ id: tripId, lease_id: leaseId })
    .update({ ...data, updated_at: db.fn.now() } as unknown as Partial<ISavedTrip>)
    .returning("*");
  return trip;
}
