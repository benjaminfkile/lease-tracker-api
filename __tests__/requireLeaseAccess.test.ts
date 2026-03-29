import { Request, Response, NextFunction } from "express";
import { requireLeaseAccess } from "../src/middleware/requireLeaseAccess";
import { ApiError } from "../src/utils/ApiError";
import { IUser, ILeaseMember } from "../src/interfaces";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("../src/db/leaseMembers", () => ({
  getLeaseMember: jest.fn(),
  leaseExists: jest.fn(),
}));

import { getLeaseMember, leaseExists } from "../src/db/leaseMembers";

const mockGetLeaseMember = getLeaseMember as jest.Mock;
const mockLeaseExists = leaseExists as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEASE_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_ID = "bbbbbbbb-0000-0000-0000-000000000002";

const fakeUser: IUser = {
  id: USER_ID,
  cognito_user_id: "us-east-1_TEST:sub-001",
  email: "test@example.com",
  display_name: null,
  subscription_tier: "free",
  subscription_expires_at: null,
  push_token: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

function fakeMember(role: ILeaseMember["role"]): ILeaseMember {
  return {
    id: "cccccccc-0000-0000-0000-000000000003",
    lease_id: LEASE_ID,
    user_id: USER_ID,
    role,
    invited_by: null,
    accepted_at: null,
    created_at: new Date("2026-01-01T00:00:00Z"),
  };
}

function mockReqResNext(leaseId = LEASE_ID): {
  req: Request;
  res: Response;
  next: jest.Mock;
} {
  const req = {
    params: { leaseId },
    dbUser: fakeUser,
  } as unknown as Request;
  const res = {} as Response;
  const next = jest.fn();
  return { req, res, next };
}

// ---------------------------------------------------------------------------
// requireLeaseAccess middleware
// ---------------------------------------------------------------------------

describe("requireLeaseAccess middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Lease not found (404)
  // -------------------------------------------------------------------------

  describe("lease does not exist", () => {
    it("calls next with 404 ApiError when lease is not found", async () => {
      mockGetLeaseMember.mockResolvedValueOnce(undefined);
      mockLeaseExists.mockResolvedValueOnce(false);

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("viewer")(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const err = next.mock.calls[0][0] as ApiError;
      expect(err.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // User not a member (403)
  // -------------------------------------------------------------------------

  describe("user is not a member", () => {
    it("calls next with 403 ApiError when lease exists but user has no membership", async () => {
      mockGetLeaseMember.mockResolvedValueOnce(undefined);
      mockLeaseExists.mockResolvedValueOnce(true);

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("viewer")(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const err = next.mock.calls[0][0] as ApiError;
      expect(err.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Insufficient role (403)
  // -------------------------------------------------------------------------

  describe("insufficient role", () => {
    it("calls next with 403 when viewer tries to access editor-protected resource", async () => {
      mockGetLeaseMember.mockResolvedValueOnce(fakeMember("viewer"));

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("editor")(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const err = next.mock.calls[0][0] as ApiError;
      expect(err.statusCode).toBe(403);
    });

    it("calls next with 403 when viewer tries to access owner-protected resource", async () => {
      mockGetLeaseMember.mockResolvedValueOnce(fakeMember("viewer"));

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("owner")(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const err = next.mock.calls[0][0] as ApiError;
      expect(err.statusCode).toBe(403);
    });

    it("calls next with 403 when editor tries to access owner-protected resource", async () => {
      mockGetLeaseMember.mockResolvedValueOnce(fakeMember("editor"));

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("owner")(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const err = next.mock.calls[0][0] as ApiError;
      expect(err.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Sufficient role (passes through)
  // -------------------------------------------------------------------------

  describe("sufficient role", () => {
    it("calls next with no arguments when viewer accesses viewer-protected resource", async () => {
      mockGetLeaseMember.mockResolvedValueOnce(fakeMember("viewer"));

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("viewer")(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });

    it("calls next with no arguments when editor accesses viewer-protected resource", async () => {
      mockGetLeaseMember.mockResolvedValueOnce(fakeMember("editor"));

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("viewer")(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });

    it("calls next with no arguments when editor accesses editor-protected resource", async () => {
      mockGetLeaseMember.mockResolvedValueOnce(fakeMember("editor"));

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("editor")(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });

    it("calls next with no arguments when owner accesses viewer-protected resource", async () => {
      mockGetLeaseMember.mockResolvedValueOnce(fakeMember("owner"));

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("viewer")(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });

    it("calls next with no arguments when owner accesses editor-protected resource", async () => {
      mockGetLeaseMember.mockResolvedValueOnce(fakeMember("owner"));

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("editor")(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });

    it("calls next with no arguments when owner accesses owner-protected resource", async () => {
      mockGetLeaseMember.mockResolvedValueOnce(fakeMember("owner"));

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("owner")(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // -------------------------------------------------------------------------
  // req.leaseMember attachment
  // -------------------------------------------------------------------------

  describe("req.leaseMember attachment", () => {
    it("attaches the membership record to req.leaseMember on success", async () => {
      const member = fakeMember("editor");
      mockGetLeaseMember.mockResolvedValueOnce(member);

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("editor")(req, res, next as NextFunction);

      expect(req.leaseMember).toEqual(member);
    });

    it("does not attach req.leaseMember when access is denied", async () => {
      mockGetLeaseMember.mockResolvedValueOnce(fakeMember("viewer"));

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("editor")(req, res, next as NextFunction);

      expect(req.leaseMember).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // leaseExists is not called when member record is found
  // -------------------------------------------------------------------------

  describe("DB call optimisation", () => {
    it("does not call leaseExists when membership record is found", async () => {
      mockGetLeaseMember.mockResolvedValueOnce(fakeMember("viewer"));

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("viewer")(req, res, next as NextFunction);

      expect(mockLeaseExists).not.toHaveBeenCalled();
    });

    it("calls leaseExists with the correct leaseId when member is not found", async () => {
      mockGetLeaseMember.mockResolvedValueOnce(undefined);
      mockLeaseExists.mockResolvedValueOnce(false);

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("viewer")(req, res, next as NextFunction);

      expect(mockLeaseExists).toHaveBeenCalledWith(LEASE_ID);
    });
  });

  // -------------------------------------------------------------------------
  // Database error propagation
  // -------------------------------------------------------------------------

  describe("database error propagation", () => {
    it("forwards getLeaseMember errors to next", async () => {
      const dbError = new Error("DB unavailable");
      mockGetLeaseMember.mockRejectedValueOnce(dbError);

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("viewer")(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledWith(dbError);
    });

    it("forwards leaseExists errors to next", async () => {
      mockGetLeaseMember.mockResolvedValueOnce(undefined);
      const dbError = new Error("DB unavailable");
      mockLeaseExists.mockRejectedValueOnce(dbError);

      const { req, res, next } = mockReqResNext();
      await requireLeaseAccess("viewer")(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });
});
