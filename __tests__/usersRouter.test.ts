import request from "supertest";
import express from "express";
import { IUser } from "../src/interfaces";

// ---------------------------------------------------------------------------
// Mocks — jest.mock is hoisted so factories must use inline jest.fn() only.
// __esModule: true is required for default-export modules with esModuleInterop.
// ---------------------------------------------------------------------------

jest.mock("../src/auth/cognitoVerifier", () => ({
  __esModule: true,
  default: { verify: jest.fn() },
}));

jest.mock("../src/db/users", () => ({
  upsertUser: jest.fn(),
}));

// Import after mocks are in place.
import cognitoVerifier from "../src/auth/cognitoVerifier";
import { upsertUser } from "../src/db/users";
import usersRouter from "../src/routers/usersRouter";

const mockVerify = cognitoVerifier.verify as jest.Mock;
const mockUpsertUser = upsertUser as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use("/api/users", usersRouter);
  return app;
}

const fakeUser: IUser = {
  id: "00000000-0000-0000-0000-000000000001",
  cognito_user_id: "us-east-1_TEST:sub-001",
  email: "test@example.com",
  display_name: "Test User",
  subscription_tier: "free",
  subscription_expires_at: null,
  push_token: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/users/me", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp()).get("/api/users/me");

    expect(res.status).toBe(401);
  });

  it("returns 401 when token is invalid", async () => {
    mockVerify.mockRejectedValueOnce(new Error("Invalid signature"));

    const res = await request(buildApp())
      .get("/api/users/me")
      .set("Authorization", "Bearer bad.token");

    expect(res.status).toBe(401);
  });

  it("returns 403 when token is expired", async () => {
    const expiredError = Object.assign(new Error("Token is expired"), {
      name: "JwtExpiredError",
    });
    mockVerify.mockRejectedValueOnce(expiredError);

    const res = await request(buildApp())
      .get("/api/users/me")
      .set("Authorization", "Bearer expired.token");

    expect(res.status).toBe(403);
  });

  it("returns 200 with user profile fields on success", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);

    const res = await request(buildApp())
      .get("/api/users/me")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: fakeUser.id,
      email: fakeUser.email,
      display_name: fakeUser.display_name,
      subscription_tier: fakeUser.subscription_tier,
      subscription_expires_at: null,
    });
  });

  it("does not expose internal fields (cognito_user_id, push_token, etc.)", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);

    const res = await request(buildApp())
      .get("/api/users/me")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("cognito_user_id");
    expect(res.body).not.toHaveProperty("push_token");
    expect(res.body).not.toHaveProperty("created_at");
    expect(res.body).not.toHaveProperty("updated_at");
  });

  it("calls upsertUser with sub and email from the token", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: "us-east-1_TEST:sub-001",
      email: "test@example.com",
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);

    await request(buildApp())
      .get("/api/users/me")
      .set("Authorization", "Bearer valid.token");

    expect(mockUpsertUser).toHaveBeenCalledWith(
      "us-east-1_TEST:sub-001",
      "test@example.com"
    );
  });

  it("returns subscription_expires_at as a string when set", async () => {
    const userWithExpiry: IUser = {
      ...fakeUser,
      subscription_expires_at: new Date("2027-01-01T00:00:00Z"),
    };
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(userWithExpiry);

    const res = await request(buildApp())
      .get("/api/users/me")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body.subscription_expires_at).toBe("2027-01-01T00:00:00.000Z");
  });

  it("returns 500 when upsertUser throws", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockRejectedValueOnce(new Error("DB unavailable"));

    const res = await request(buildApp())
      .get("/api/users/me")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(500);
  });
});
