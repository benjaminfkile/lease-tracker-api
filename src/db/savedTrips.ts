import { getDb } from "./db";
import { ISavedTrip } from "../interfaces";

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
