/**
 * Integration tests — Summary endpoint.
 *
 * These tests exercise GET /api/leases/:leaseId/summary end-to-end through
 * the HTTP layer.  A fixed "today" date is pinned via jest fake timers so
 * that every expected value can be verified against a manual calculation.
 *
 * Seeded lease used throughout:
 *   lease_start_date : "2025-01-01"
 *   lease_end_date   : "2028-01-01"   (1095 days total)
 *   total_miles_allowed : 36 000
 *   miles_per_year      : 12 000
 *   starting_odometer   : 0
 *   overage_cost_per_mile: "0.25"
 *
 * Pinned today: "2026-01-01"
 *   days_elapsed    = 365  (2025 is not a leap year)
 *   days_remaining  = 730  (2026-01-01 → 2028-01-01, neither 2026 nor 2027 is a leap year)
 *
 * All external I/O (Cognito, DB helpers) is mocked so no real database is
 * needed.
 */

import request from "supertest";
import express from "express";
import {
  IUser,
  ILease,
  ILeaseWithMembers,
  ILeaseMember,
} from "../src/interfaces";
import { errorHandler } from "../src/middleware/errorHandler";

// ---------------------------------------------------------------------------
// Mocks — must appear before any import of the modules they replace.
// ---------------------------------------------------------------------------

jest.mock("../src/auth/cognitoVerifier", () => ({
  __esModule: true,
  default: { verify: jest.fn() },
}));

jest.mock("../src/db/users", () => ({
  upsertUser: jest.fn(),
  getUserByEmail: jest.fn(),
}));

jest.mock("../src/db/leases", () => ({
  getLeases: jest.fn(),
  createLease: jest.fn(),
  getLease: jest.fn(),
  updateLease: jest.fn(),
  deleteLease: jest.fn(),
}));

jest.mock("../src/db/leaseMembers", () => ({
  createLeaseMember: jest.fn(),
  getLeaseMember: jest.fn(),
  getLeaseMembers: jest.fn(),
  leaseExists: jest.fn(),
  acceptLeaseMember: jest.fn(),
  updateLeaseMemberRole: jest.fn(),
  deleteLeaseMember: jest.fn(),
}));

jest.mock("../src/db/alertConfigs", () => ({
  createDefaultAlertConfigs: jest.fn(),
  getAlertConfigs: jest.fn(),
  createAlertConfig: jest.fn(),
  getAlertConfig: jest.fn(),
  updateAlertConfig: jest.fn(),
  deleteAlertConfig: jest.fn(),
}));

jest.mock("../src/db/savedTrips", () => ({
  getReservedTripMiles: jest.fn(),
  getTrips: jest.fn(),
  createTrip: jest.fn(),
  getTrip: jest.fn(),
  updateTrip: jest.fn(),
  deleteTrip: jest.fn(),
}));

jest.mock("../src/db/readings", () => ({
  getReadings: jest.fn(),
  createOdometerReading: jest.fn(),
  getReading: jest.fn(),
  getMaxOdometerExcluding: jest.fn(),
  updateOdometerReading: jest.fn(),
  deleteOdometerReading: jest.fn(),
  getReadingsAsc: jest.fn(),
}));

jest.mock("../src/services/pushNotifications", () => ({
  sendPushNotification: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import cognitoVerifier from "../src/auth/cognitoVerifier";
import { upsertUser } from "../src/db/users";
import { getLease } from "../src/db/leases";
import { getLeaseMember, leaseExists } from "../src/db/leaseMembers";
import { getReservedTripMiles } from "../src/db/savedTrips";
import leasesRouter from "../src/routers/leasesRouter";

const mockVerify = cognitoVerifier.verify as jest.Mock;
const mockUpsertUser = upsertUser as jest.Mock;
const mockGetLease = getLease as jest.Mock;
const mockGetLeaseMember = getLeaseMember as jest.Mock;
const mockLeaseExists = leaseExists as jest.Mock;
const mockGetReservedTripMiles = getReservedTripMiles as jest.Mock;

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/leases", leasesRouter);
  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// Pinned date
// ---------------------------------------------------------------------------

// All summary calculations in these tests use 2026-01-01 as "today".
const PINNED_TODAY = new Date("2026-01-01T00:00:00.000Z");

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const freeUser: IUser = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  cognito_user_id: "us-east-1_TEST:sub-free",
  email: "free@example.com",
  display_name: "Free User",
  subscription_tier: "free",
  subscription_expires_at: null,
  push_token: null,
  created_at: new Date("2025-01-01T00:00:00Z"),
  updated_at: new Date("2025-01-01T00:00:00Z"),
};

const premiumUser: IUser = {
  id: "bbbbbbbb-0000-0000-0000-000000000002",
  cognito_user_id: "us-east-1_TEST:sub-premium",
  email: "premium@example.com",
  display_name: "Premium User",
  subscription_tier: "premium",
  subscription_expires_at: new Date("2027-01-01T00:00:00Z"),
  push_token: null,
  created_at: new Date("2025-01-01T00:00:00Z"),
  updated_at: new Date("2025-01-01T00:00:00Z"),
};

const leaseId = "cccccccc-0000-0000-0000-000000000003";

const ownerMember: ILeaseMember = {
  id: "dddddddd-0000-0000-0000-000000000004",
  lease_id: leaseId,
  user_id: freeUser.id,
  role: "owner",
  invited_by: null,
  accepted_at: new Date("2025-01-01T00:00:00Z"),
  created_at: new Date("2025-01-01T00:00:00Z"),
};

/**
 * Seeded lease:
 *   start  2025-01-01   end  2028-01-01   total_miles 36 000
 *   miles_per_year 12 000   starting_odometer 0
 */
const seededLease: ILease = {
  id: leaseId,
  user_id: freeUser.id,
  display_name: "Seeded Honda",
  make: "Honda",
  model: "Civic",
  year: 2025,
  trim: null,
  color: null,
  vin: null,
  license_plate: null,
  lease_start_date: "2025-01-01",
  lease_end_date: "2028-01-01",
  total_miles_allowed: 36000,
  miles_per_year: 12000,
  starting_odometer: 0,
  current_odometer: 6000,
  overage_cost_per_mile: "0.25",
  monthly_payment: null,
  dealer_name: null,
  dealer_phone: null,
  contract_number: null,
  notes: null,
  is_active: true,
  created_at: new Date("2025-01-01T00:00:00Z"),
  updated_at: new Date("2025-01-01T00:00:00Z"),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Queue Cognito + upsertUser mocks for one authenticated request. */
function authAs(user: IUser) {
  mockVerify.mockResolvedValueOnce({ sub: user.cognito_user_id, email: user.email });
  mockUpsertUser.mockResolvedValueOnce(user);
}

// ===========================================================================
// Summary — behind-pace scenario (free user, current_odometer = 6 000)
//
// Manual calculations (today = 2026-01-01):
//   lease_length_days      = 1095  (2025-01-01 → 2028-01-01; 3 × 365)
//   days_elapsed           = 365   (2025-01-01 → 2026-01-01; 2025 not a leap year)
//   days_remaining         = 730   (2026-01-01 → 2028-01-01; neither 2026 nor 2027 is a leap year)
//   miles_driven           = 6000  (6000 − 0)
//   miles_remaining        = 29500 (36000 − 6000 − 500 reserved)
//   expected_miles_to_date = 12000 (36000 / 1095 × 365 = 36000 / 3 = 12000)
//   miles_over_under_pace  = −6000 (6000 − 12000)
//   pace_status            = "behind" (−6000 < −(36000 × 0.01) = −360)
//   projected_miles_at_end = 18000 (6000 / 365 × 1095 = 6000 × 3)
//   projected_overage      = 0     (18000 < 36000)
//   projected_overage_cost = 0
//   current_pace_per_month ≈ 500.38 (6000 / 365 × 30.44)
//   recommended_daily_miles ≈ 40.41 (29500 / 730)
//   reserved_trip_miles    = 500
//   is_premium             = false
// ===========================================================================

describe("Summary endpoint — behind-pace scenario (free user)", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(PINNED_TODAY);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with the computed summary", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(seededLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
  });

  it("miles_driven equals current_odometer minus starting_odometer", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(seededLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.body.miles_driven).toBe(6000);
  });

  it("miles_remaining subtracts miles_driven and reserved_trip_miles from total", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(seededLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    // 36000 − 6000 − 500 = 29500
    expect(res.body.miles_remaining).toBe(29500);
  });

  it("days_elapsed is 365 (2025-01-01 → 2026-01-01)", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(seededLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.body.days_elapsed).toBe(365);
  });

  it("days_remaining is 730 (2026-01-01 → 2028-01-01)", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(seededLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.body.days_remaining).toBe(730);
  });

  it("lease_length_days is 1095 (2025-01-01 → 2028-01-01, 3 × 365)", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(seededLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.body.lease_length_days).toBe(1095);
  });

  it("expected_miles_to_date is 12000 (36000 / 1095 × 365 = 36000 / 3)", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(seededLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.body.expected_miles_to_date).toBeCloseTo(12000, 2);
  });

  it("miles_over_under_pace is −6000 (6000 driven minus 12000 expected)", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(seededLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.body.miles_over_under_pace).toBeCloseTo(-6000, 2);
  });

  it("pace_status is 'behind' when miles driven are well below expected", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(seededLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.body.pace_status).toBe("behind");
  });

  it("projected_miles_at_end is 18000 (6000 / 365 × 1095 = 6000 × 3)", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(seededLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.body.projected_miles_at_end).toBeCloseTo(18000, 2);
  });

  it("projected_overage is 0 when projected miles are below total_miles_allowed", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(seededLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.body.projected_overage).toBe(0);
    expect(res.body.projected_overage_cost).toBe(0);
  });

  it("current_pace_per_month matches manual calculation (6000 / 365 × 30.44)", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(seededLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    const expected = (6000 / 365) * 30.44;
    expect(res.body.current_pace_per_month).toBeCloseTo(expected, 4);
  });

  it("recommended_daily_miles matches manual calculation (29500 / 730)", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(seededLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    const expected = 29500 / 730;
    expect(res.body.recommended_daily_miles).toBeCloseTo(expected, 4);
  });

  it("reserved_trip_miles reflects the value returned by getReservedTripMiles", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(seededLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.body.reserved_trip_miles).toBe(500);
  });

  it("is_premium is false for a free-tier user", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(seededLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.body.is_premium).toBe(false);
  });
});

// ===========================================================================
// Summary — ahead-of-pace scenario with projected overage
//
// Same lease, but current_odometer = 15 000 (today = 2026-01-01):
//   miles_driven           = 15000
//   expected_miles_to_date = 12000
//   miles_over_under_pace  = 3000   (> 360 threshold → "ahead")
//   projected_miles_at_end = 15000 / 365 × 1095 = 45000
//   projected_overage      = max(0, 45000 − 36000) = 9000
//   projected_overage_cost = 9000 × 0.25 = 2250
// ===========================================================================

describe("Summary endpoint — ahead-of-pace scenario with projected overage", () => {
  const aheadLease: ILease = { ...seededLease, current_odometer: 15000 };

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(PINNED_TODAY);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("pace_status is 'ahead' when miles driven exceed expected by more than 1 % threshold", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(aheadLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(0);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.body.pace_status).toBe("ahead");
  });

  it("projected_miles_at_end is 45000 (15000 / 365 × 1095 = 15000 × 3)", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(aheadLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(0);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.body.projected_miles_at_end).toBeCloseTo(45000, 2);
  });

  it("projected_overage is 9000 (45000 − 36000)", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(aheadLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(0);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.body.projected_overage).toBeCloseTo(9000, 2);
  });

  it("projected_overage_cost is 2250 (9000 × $0.25)", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(aheadLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(0);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.body.projected_overage_cost).toBeCloseTo(2250, 2);
  });
});

// ===========================================================================
// Summary — premium user flag
// ===========================================================================

describe("Summary endpoint — premium user flag", () => {
  const premiumOwnerMember: ILeaseMember = {
    ...ownerMember,
    user_id: premiumUser.id,
  };
  const premiumLease: ILease = { ...seededLease, user_id: premiumUser.id };

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(PINNED_TODAY);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("is_premium is true for a premium-tier user", async () => {
    authAs(premiumUser);
    mockGetLeaseMember.mockResolvedValueOnce(premiumOwnerMember);
    mockGetLease.mockResolvedValueOnce(premiumLease);
    mockGetReservedTripMiles.mockResolvedValueOnce(0);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body.is_premium).toBe(true);
  });
});

// ===========================================================================
// Summary — guard rails (auth, access, not-found)
// ===========================================================================

describe("Summary endpoint — guard rails", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(PINNED_TODAY);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when no Authorization header is present", async () => {
    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`);

    expect(res.status).toBe(401);
  });

  it("returns 403 when the authenticated user is not a member of the lease", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("returns 404 when the lease does not exist", async () => {
    authAs(freeUser);
    // requireLeaseAccess passes (member exists), but getLease returns null
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(null);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
  });

  it("returns 404 when the lease truly does not exist (no member record)", async () => {
    authAs(freeUser);
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
  });
});
