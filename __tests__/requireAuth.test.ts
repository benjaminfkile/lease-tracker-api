import { Request, Response, NextFunction } from "express";
import { requireAuth } from "../src/middleware/requireAuth";
import { ApiError } from "../src/utils/ApiError";
import cognitoVerifier from "../src/auth/cognitoVerifier";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// __esModule: true is required so TypeScript's esModuleInterop __importDefault
// helper returns the correct .default value when requireAuth.ts imports this.
jest.mock("../src/auth/cognitoVerifier", () => ({
  __esModule: true,
  default: { verify: jest.fn() },
}));

const mockVerify = cognitoVerifier.verify as jest.Mock;

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

// ---------------------------------------------------------------------------
// requireAuth middleware
// ---------------------------------------------------------------------------

describe("requireAuth middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("missing or malformed Authorization header", () => {
    it("calls next with 401 ApiError when Authorization header is absent", async () => {
      const { req, res, next } = mockReqResNext();
      await requireAuth(req, res, next as NextFunction);
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const err = next.mock.calls[0][0] as ApiError;
      expect(err.statusCode).toBe(401);
    });

    it("calls next with 401 ApiError when Authorization header does not start with 'Bearer '", async () => {
      const { req, res, next } = mockReqResNext({ authorization: "Basic abc123" });
      await requireAuth(req, res, next as NextFunction);
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const err = next.mock.calls[0][0] as ApiError;
      expect(err.statusCode).toBe(401);
    });

    it("calls next with 401 ApiError when Authorization header is 'Bearer' with no token", async () => {
      const { req, res, next } = mockReqResNext({ authorization: "Bearer" });
      await requireAuth(req, res, next as NextFunction);
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const err = next.mock.calls[0][0] as ApiError;
      expect(err.statusCode).toBe(401);
    });
  });

  describe("valid token", () => {
    it("calls the cognitoVerifier with the extracted token", async () => {
      const claims = { sub: "user-123", email: "test@example.com" };
      mockVerify.mockResolvedValueOnce(claims);

      const { req, res, next } = mockReqResNext({ authorization: "Bearer valid.token.here" });
      await requireAuth(req, res, next as NextFunction);

      expect(mockVerify).toHaveBeenCalledWith("valid.token.here");
    });

    it("attaches decoded claims to req.cognitoUser", async () => {
      const claims = { sub: "user-123", email: "test@example.com" };
      mockVerify.mockResolvedValueOnce(claims);

      const { req, res, next } = mockReqResNext({ authorization: "Bearer valid.token.here" });
      await requireAuth(req, res, next as NextFunction);

      expect(req.cognitoUser).toEqual(claims);
    });

    it("calls next with no arguments on success", async () => {
      mockVerify.mockResolvedValueOnce({ sub: "user-abc" });

      const { req, res, next } = mockReqResNext({ authorization: "Bearer valid.token.here" });
      await requireAuth(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe("token verification failure", () => {
    it("calls next with 403 ApiError when the token is expired (JwtExpiredError)", async () => {
      const expiredError = Object.assign(new Error("Token is expired"), {
        name: "JwtExpiredError",
      });
      mockVerify.mockRejectedValueOnce(expiredError);

      const { req, res, next } = mockReqResNext({ authorization: "Bearer expired.token" });
      await requireAuth(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const err = next.mock.calls[0][0] as ApiError;
      expect(err.statusCode).toBe(403);
    });

    it("calls next with 401 ApiError for any other verification error", async () => {
      const invalidError = new Error("Invalid signature");
      mockVerify.mockRejectedValueOnce(invalidError);

      const { req, res, next } = mockReqResNext({ authorization: "Bearer tampered.token" });
      await requireAuth(req, res, next as NextFunction);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const err = next.mock.calls[0][0] as ApiError;
      expect(err.statusCode).toBe(401);
    });

    it("does not attach cognitoUser when verification fails", async () => {
      mockVerify.mockRejectedValueOnce(new Error("Invalid"));

      const { req, res, next } = mockReqResNext({ authorization: "Bearer bad.token" });
      await requireAuth(req, res, next as NextFunction);

      expect(req.cognitoUser).toBeUndefined();
    });
  });
});
