import { getDb } from "./db";

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
