import { ILeaseMember, ILeaseMemberWithUser } from "../interfaces";
import { TLeaseRole } from "../types";
import { getDb } from "./db";

export async function getLeaseMember(
  leaseId: string,
  userId: string
): Promise<ILeaseMember | undefined> {
  return getDb()<ILeaseMember>("lease_members")
    .where({ lease_id: leaseId, user_id: userId })
    .first();
}

export async function getLeaseMembers(
  leaseId: string
): Promise<ILeaseMemberWithUser[]> {
  return getDb()<ILeaseMemberWithUser>("lease_members")
    .join("users", "lease_members.user_id", "users.id")
    .where("lease_members.lease_id", leaseId)
    .select(
      "lease_members.*",
      "users.display_name",
      "users.email"
    );
}

export async function leaseExists(leaseId: string): Promise<boolean> {
  const row = await getDb()("leases").where({ id: leaseId }).first();
  return row !== undefined;
}

export async function createLeaseMember(
  leaseId: string,
  userId: string,
  role: TLeaseRole,
  invitedBy?: string
): Promise<ILeaseMember> {
  const [member] = await getDb()<ILeaseMember>("lease_members")
    .insert({ lease_id: leaseId, user_id: userId, role, invited_by: invitedBy ?? null })
    .returning("*");

  return member;
}
