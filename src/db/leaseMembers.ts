import { ILeaseMember } from "../interfaces";
import { getDb } from "./db";

export async function getLeaseMember(
  leaseId: string,
  userId: string
): Promise<ILeaseMember | undefined> {
  return getDb()<ILeaseMember>("lease_members")
    .where({ lease_id: leaseId, user_id: userId })
    .first();
}

export async function leaseExists(leaseId: string): Promise<boolean> {
  const row = await getDb()("leases").where({ id: leaseId }).first();
  return row !== undefined;
}
