import { ILease, ILeaseWithRole, ILeaseWithMembers, ILeaseMember } from "../interfaces";
import { CreateLeaseInput } from "../validation/schemas";
import { getDb } from "./db";

/**
 * Shape used when inserting a new lease row. Decimal fields are stored as
 * numbers on insert; PostgreSQL returns them as strings when reading back.
 */
type NewLeaseRecord = CreateLeaseInput & {
  user_id: string;
  starting_odometer: number;
  is_active: boolean;
};

/**
 * Inserts a new lease row and returns the created record.
 */
export async function createLease(
  userId: string,
  data: CreateLeaseInput
): Promise<ILease> {
  const [lease] = await getDb()<ILease>("leases")
    .insert({
      user_id: userId,
      ...data,
      starting_odometer: data.starting_odometer ?? 0,
      is_active: data.is_active ?? true,
    } as unknown as Partial<ILease>)
    .returning("*");

  return lease;
}

/**
 * Returns a single active lease by id together with its full member list.
 * Returns undefined when no lease with the given id exists.
 */
export async function getLease(
  leaseId: string
): Promise<ILeaseWithMembers | undefined> {
  const db = getDb();
  const lease = await db<ILease>("leases").where({ id: leaseId }).first();

  if (!lease) return undefined;

  const members = await db<ILeaseMember>("lease_members").where({
    lease_id: leaseId,
  });

  return { ...lease, members };
}

/**
 * Returns all active leases for the given user — both leases they own
 * and leases they have been added to via lease_members — ordered by
 * lease_end_date ASC (soonest ending first).
 *
 * The `role` field is set to "owner" for owned leases and to the
 * lease_members.role value for shared leases.
 */
export async function getLeases(userId: string): Promise<ILeaseWithRole[]> {
  const db = getDb();
  return db
    .select<ILeaseWithRole[]>(
      "l.*",
      db.raw(
        "CASE WHEN l.user_id = ? THEN 'owner'::text ELSE lm.role END AS role",
        [userId]
      )
    )
    .from("leases as l")
    .leftJoin("lease_members as lm", function () {
      this.on("l.id", "=", "lm.lease_id").andOnVal("lm.user_id", userId);
    })
    .where("l.is_active", true)
    .where(function () {
      this.where("l.user_id", userId).orWhereNotNull("lm.user_id");
    })
    .orderBy("l.lease_end_date", "asc");
}
