import request from "supertest";
import express from "express";
import { IUser } from "../src/interfaces";
import { ILeaseWithRole } from "../src/interfaces";

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

jest.mock("../src/db/leases", () => ({
  getLeases: jest.fn(),
}));

// Import after mocks are in place.
import cognitoVerifier from "../src/auth/cognitoVerifier";
import { upsertUser } from "../src/db/users";
import { getLeases } from "../src/db/leases";
import leasesRouter from "../src/routers/leasesRouter";

const mockVerify = cognitoVerifier.verify as jest.Mock;
const mockUpsertUser = upsertUser as jest.Mock;
const mockGetLeases = getLeases as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/leases", leasesRouter);
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

const fakeLease: ILeaseWithRole = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  user_id: fakeUser.id,
  display_name: "My Tesla",
  make: "Tesla",
  model: "Model 3",
  year: 2024,
  trim: "Long Range",
  color: "White",
  vin: "5YJ3E1EA1NF000001",
  license_plate: "TEST123",
  lease_start_date: "2024-01-01",
  lease_end_date: "2027-01-01",
  total_miles_allowed: 36000,
  miles_per_year: 12000,
  starting_odometer: 0,
  current_odometer: 5000,
  overage_cost_per_mile: "0.2500",
  monthly_payment: "450.00",
  dealer_name: "Tesla Motors",
  dealer_phone: "555-1234",
  contract_number: "CONT-001",
  notes: null,
  is_active: true,
  created_at: new Date("2024-01-01T00:00:00Z"),
  updated_at: new Date("2024-01-01T00:00:00Z"),
  role: "owner",
};

const fakeSharedLease: ILeaseWithRole = {
  ...fakeLease,
  id: "bbbbbbbb-0000-0000-0000-000000000002",
  user_id: "00000000-0000-0000-0000-000000000099",
  lease_end_date: "2026-06-01",
  role: "viewer",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/leases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp()).get("/api/leases");

    expect(res.status).toBe(401);
  });

  it("returns 401 when token is invalid", async () => {
    mockVerify.mockRejectedValueOnce(new Error("Invalid signature"));

    const res = await request(buildApp())
      .get("/api/leases")
      .set("Authorization", "Bearer bad.token");

    expect(res.status).toBe(401);
  });

  it("returns 403 when token is expired", async () => {
    const expiredError = Object.assign(new Error("Token is expired"), {
      name: "JwtExpiredError",
    });
    mockVerify.mockRejectedValueOnce(expiredError);

    const res = await request(buildApp())
      .get("/api/leases")
      .set("Authorization", "Bearer expired.token");

    expect(res.status).toBe(403);
  });

  it("returns 200 with an empty array when the user has no leases", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockGetLeases.mockResolvedValueOnce([]);

    const res = await request(buildApp())
      .get("/api/leases")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 200 with owned leases including role 'owner'", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockGetLeases.mockResolvedValueOnce([fakeLease]);

    const res = await request(buildApp())
      .get("/api/leases")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(fakeLease.id);
    expect(res.body[0].role).toBe("owner");
  });

  it("returns 200 with shared leases including the member's role", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockGetLeases.mockResolvedValueOnce([fakeSharedLease]);

    const res = await request(buildApp())
      .get("/api/leases")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(fakeSharedLease.id);
    expect(res.body[0].role).toBe("viewer");
  });

  it("returns 200 with both owned and shared leases", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    // shared lease ends sooner, so it comes first when ordered by lease_end_date ASC
    mockGetLeases.mockResolvedValueOnce([fakeSharedLease, fakeLease]);

    const res = await request(buildApp())
      .get("/api/leases")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe(fakeSharedLease.id);
    expect(res.body[1].id).toBe(fakeLease.id);
  });

  it("calls getLeases with the authenticated user's id", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockGetLeases.mockResolvedValueOnce([]);

    await request(buildApp())
      .get("/api/leases")
      .set("Authorization", "Bearer valid.token");

    expect(mockGetLeases).toHaveBeenCalledWith(fakeUser.id);
  });

  it("returns 500 when getLeases throws", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockGetLeases.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .get("/api/leases")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(500);
  });
});
