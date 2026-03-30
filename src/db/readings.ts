import { IOdometerReading } from "../interfaces";
import { CreateOdometerReadingInput, UpdateOdometerReadingInput } from "../validation/schemas";
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

/**
 * Returns a single odometer reading by id for the given lease.
 * Returns undefined when no matching reading is found.
 *
 * @param leaseId   - UUID of the lease
 * @param readingId - UUID of the reading
 */
export async function getReading(
  leaseId: string,
  readingId: string
): Promise<IOdometerReading | undefined> {
  const db = getDb();
  return db<IOdometerReading>("odometer_readings")
    .where({ id: readingId, lease_id: leaseId })
    .first();
}

/**
 * Returns the highest odometer value recorded for a lease, excluding the
 * specified reading. Used to enforce ordering during updates.
 * Returns null when no other readings exist.
 *
 * @param leaseId          - UUID of the lease
 * @param excludeReadingId - UUID of the reading to exclude
 */
export async function getMaxOdometerExcluding(
  leaseId: string,
  excludeReadingId: string
): Promise<number | null> {
  const db = getDb();
  const result = await db("odometer_readings")
    .where({ lease_id: leaseId })
    .whereNot({ id: excludeReadingId })
    .max("odometer as max_odometer")
    .first<{ max_odometer: number | null }>();
  return result?.max_odometer ?? null;
}

/**
 * Updates an odometer reading and recomputes the lease's current_odometer
 * cache using MAX(odometer) across all readings for the lease.
 *
 * @param leaseId   - UUID of the lease
 * @param readingId - UUID of the reading to update
 * @param data      - Validated partial update payload
 */
export async function updateOdometerReading(
  leaseId: string,
  readingId: string,
  data: UpdateOdometerReadingInput
): Promise<IOdometerReading> {
  const db = getDb();

  const updates: Record<string, unknown> = {};
  if (data.odometer !== undefined) updates.odometer = data.odometer;
  if (data.reading_date !== undefined) updates.reading_date = data.reading_date;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.source !== undefined) updates.source = data.source;

  let reading: IOdometerReading;
  if (Object.keys(updates).length > 0) {
    const [updated] = await db<IOdometerReading>("odometer_readings")
      .where({ id: readingId, lease_id: leaseId })
      .update(updates)
      .returning("*");
    reading = updated;
  } else {
    reading = (await db<IOdometerReading>("odometer_readings")
      .where({ id: readingId, lease_id: leaseId })
      .first()) as IOdometerReading;
  }

  // Recompute current_odometer cache using MAX(odometer).
  await db("leases")
    .where({ id: leaseId })
    .update({
      current_odometer: db.raw(
        "(SELECT MAX(odometer) FROM odometer_readings WHERE lease_id = ?)",
        [leaseId]
      ),
      updated_at: db.fn.now(),
    });

  return reading;
}
