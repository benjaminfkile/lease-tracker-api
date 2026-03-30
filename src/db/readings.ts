import { IOdometerReading } from "../interfaces";
import { getDb } from "./db";

/**
 * Returns all odometer readings for the given lease, ordered by
 * reading_date DESC (most recent first).
 *
 * @param leaseId  - UUID of the lease
 * @param options.limit  - Maximum number of records to return
 * @param options.before - ISO date string (YYYY-MM-DD); only readings with
 *                         reading_date strictly before this date are returned
 */
export async function getReadings(
  leaseId: string,
  options: { limit?: number; before?: string } = {}
): Promise<IOdometerReading[]> {
  const db = getDb();
  let query = db<IOdometerReading>("odometer_readings")
    .where({ lease_id: leaseId })
    .orderBy("reading_date", "desc");

  if (options.before) {
    query = query.where("reading_date", "<", options.before);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  return query;
}
