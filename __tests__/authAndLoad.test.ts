import { Request, Response, NextFunction } from "express";
import { authAndLoad } from "../src/middleware/authAndLoad";
import { ApiError } from "../src/utils/ApiError";
import { IUser } from "../src/interfaces";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// __esModule: true ensures esModuleInterop resolves the default export.
jest.mock("../src/auth/cognitoVerifier", () => ({
  __esModule: true,
  default: { verify: jest.fn() },
}));

jest.mock("../src/db/users", () => ({
  upsertUser: jest.fn(),
}));

import cognitoVerifier from "../src/auth/cognitoVerifier";
import { upsertUser } from "../src/db/users";

const mockVerify = cognitoVerifier.verify as jest.Mock;
const mockUpsertUser = upsertUser as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockReqResNext(headers: Record<string, string> = {}): {
  req: Request;
  res: Response;
  next: jest.Mock;
} {
  const req = { headers } as unknown as Request;
  const res = {} as Response;
  const next = jest.fn();
  return { req, res, next };
}

const fakeUser: IUser = {
  id: "00000000-0000-0000-0000-000000000001",
  cognito_user_id: "us-east-1_TEST:sub-001",
  email: "test@example.com",
  display_name: null,
  subscription_tier: "free",
  subscription_expires_at: null,
  push_token: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

// ---------------------------------------------------------------------------
// authAndLoad middleware
// ---------------------------------------------------------------------------

describe("authAndLoad middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("auth failure propagation", () => {
    it("forwards 401 to next when Authorization header is absent", async () => {
      const { req, res, next } = mockReqResNext();
      await authAndLoad(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const err = next.mock.calls[0][0] as ApiError;
      expect(err.statusCode).toBe(401);
    });

    it("forwards 401 to next when token is invalid", async () => {
      mockVerify.mockRejectedValueOnce(new Error("Invalid signature"));
      const { req, res, next } = mockReqResNext({
        authorization: "Bearer bad.token",
      });
      await authAndLoad(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const err = next.mock.calls[0][0] as ApiError;
      expect(err.statusCode).toBe(401);
    });

    it("forwards 403 to next when token is expired", async () => {
      const expiredError = Object.assign(new Error("Token is expired"), {
        name: "JwtExpiredError",
      });
      mockVerify.mockRejectedValueOnce(expiredError);
      const { req, res, next } = mockReqResNext({
        authorization: "Bearer expired.token",
      });
      await authAndLoad(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const err = next.mock.calls[0][0] as ApiError;
      expect(err.statusCode).toBe(403);
    });

    it("does not call upsertUser when auth fails", async () => {
      const { req, res, next } = mockReqResNext();
      await authAndLoad(req, res, next as NextFunction);

      expect(mockUpsertUser).not.toHaveBeenCalled();
    });
  });

  describe("successful auth and DB load", () => {
    it("calls upsertUser with cognito_user_id and email from the token claims", async () => {
      const claims = { sub: "us-east-1_TEST:sub-001", email: "test@example.com" };
      mockVerify.mockResolvedValueOnce(claims);
      mockUpsertUser.mockResolvedValueOnce(fakeUser);

      const { req, res, next } = mockReqResNext({
        authorization: "Bearer valid.token",
      });
      await authAndLoad(req, res, next as NextFunction);

      expect(mockUpsertUser).toHaveBeenCalledWith(
        "us-east-1_TEST:sub-001",
        "test@example.com"
      );
    });

    it("attaches the returned user row to req.dbUser", async () => {
      const claims = { sub: "us-east-1_TEST:sub-001", email: "test@example.com" };
      mockVerify.mockResolvedValueOnce(claims);
      mockUpsertUser.mockResolvedValueOnce(fakeUser);

      const { req, res, next } = mockReqResNext({
        authorization: "Bearer valid.token",
      });
      await authAndLoad(req, res, next as NextFunction);

      expect((req as any).dbUser).toEqual(fakeUser);
    });

    it("calls next with no arguments on full success", async () => {
      mockVerify.mockResolvedValueOnce({ sub: "sub-abc", email: "a@b.com" });
      mockUpsertUser.mockResolvedValueOnce(fakeUser);

      const { req, res, next } = mockReqResNext({
        authorization: "Bearer valid.token",
      });
      await authAndLoad(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });

    it("still attaches req.cognitoUser from requireAuth", async () => {
      const claims = { sub: "sub-xyz", email: "xyz@example.com" };
      mockVerify.mockResolvedValueOnce(claims);
      mockUpsertUser.mockResolvedValueOnce(fakeUser);

      const { req, res, next } = mockReqResNext({
        authorization: "Bearer valid.token",
      });
      await authAndLoad(req, res, next as NextFunction);

      expect((req as any).cognitoUser).toEqual(claims);
    });
  });

  describe("upsertUser failure", () => {
    it("forwards database errors to next", async () => {
      const claims = { sub: "sub-abc", email: "a@b.com" };
      mockVerify.mockResolvedValueOnce(claims);
      const dbError = new Error("DB unavailable");
      mockUpsertUser.mockRejectedValueOnce(dbError);

      const { req, res, next } = mockReqResNext({
        authorization: "Bearer valid.token",
      });
      await authAndLoad(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledWith(dbError);
    });

    it("does not attach req.dbUser when upsertUser throws", async () => {
      const claims = { sub: "sub-abc", email: "a@b.com" };
      mockVerify.mockResolvedValueOnce(claims);
      mockUpsertUser.mockRejectedValueOnce(new Error("DB error"));

      const { req, res, next } = mockReqResNext({
        authorization: "Bearer valid.token",
      });
      await authAndLoad(req, res, next as NextFunction);

      expect((req as any).dbUser).toBeUndefined();
    });
  });
});
