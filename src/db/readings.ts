import { IOdometerReading } from "../interfaces";
import { CreateOdometerReadingInput } from "../validation/schemas";
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

/**
 * Inserts a new odometer reading and updates the lease's current_odometer
 * cache when the new value is the highest recorded so far.
 *
 * @param leaseId - UUID of the lease
 * @param userId  - UUID of the user submitting the reading
 * @param data    - Validated reading payload (without lease_id)
 */
export async function createOdometerReading(
  leaseId: string,
  userId: string,
  data: Omit<CreateOdometerReadingInput, "lease_id">
): Promise<IOdometerReading> {
  const db = getDb();

  const [reading] = await db<IOdometerReading>("odometer_readings")
    .insert({
      lease_id: leaseId,
      user_id: userId,
      odometer: data.odometer,
      reading_date: data.reading_date,
      notes: data.notes ?? null,
      source: data.source ?? "manual",
    })
    .returning("*");

  // Update the current_odometer cache only when this reading is the new maximum.
  await db("leases")
    .where({ id: leaseId })
    .where(function () {
      this.whereNull("current_odometer").orWhere(
        "current_odometer",
        "<",
        data.odometer
      );
    })
    .update({ current_odometer: data.odometer, updated_at: db.fn.now() });

  return reading;
}
