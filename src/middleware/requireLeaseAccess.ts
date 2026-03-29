import { Request, Response, NextFunction } from "express";
import { TLeaseRole } from "../types";
import { ApiError } from "../utils/ApiError";
import { getLeaseMember, leaseExists } from "../db/leaseMembers";

const ROLE_RANK: Record<TLeaseRole, number> = {
  viewer: 0,
  editor: 1,
  owner: 2,
};

export function requireLeaseAccess(minRole: TLeaseRole) {
  return async function (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const { leaseId } = req.params;
    const userId = req.dbUser!.id;

    try {
      const member = await getLeaseMember(leaseId, userId);

      if (!member) {
        const exists = await leaseExists(leaseId);
        if (!exists) {
          next(new ApiError(404, "Lease not found"));
          return;
        }
        next(new ApiError(403, "Forbidden"));
        return;
      }

      if (ROLE_RANK[member.role] < ROLE_RANK[minRole]) {
        next(new ApiError(403, "Forbidden"));
        return;
      }

      req.leaseMember = member;
      next();
    } catch (err) {
      next(err);
    }
  };
}
