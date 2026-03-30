import { ILeaseWithRole } from "../interfaces";
import { getDb } from "./db";

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
