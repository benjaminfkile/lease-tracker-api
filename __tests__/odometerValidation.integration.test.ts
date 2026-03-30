/**
 * Integration tests — Odometer reading validation lifecycle.
 *
 * These tests exercise the odometer validation rules end-to-end through the
 * HTTP layer, simulating the state changes that would occur in a real database:
 *
 *   1. Accept first reading  — succeeds when current_odometer is null
 *   2. Reject reading below starting_odometer  — returns 400
 *   3. Reject reading below previous max        — returns 400
 *   4. current_odometer cache is updated correctly — createOdometerReading is
 *      invoked with the right arguments and the lease's cache is reflected in
 *      subsequent validation requests
 *
 * All external I/O (Cognito, DB helpers) is mocked so no real database is
 * needed. Mocks are orchestrated request-by-request to simulate real state.
 */

import request from "supertest";
import express from "express";
import {
  IUser,
  ILease,
  ILeaseWithMembers,
  ILeaseMember,
  IOdometerReading,
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
import { getLeaseMember } from "../src/db/leaseMembers";
import { createOdometerReading } from "../src/db/readings";
import leasesRouter from "../src/routers/leasesRouter";

const mockVerify = cognitoVerifier.verify as jest.Mock;
const mockUpsertUser = upsertUser as jest.Mock;
const mockGetLease = getLease as jest.Mock;
const mockGetLeaseMember = getLeaseMember as jest.Mock;
const mockCreateOdometerReading = createOdometerReading as jest.Mock;

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
// Shared fixtures
// ---------------------------------------------------------------------------

const user: IUser = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  cognito_user_id: "us-east-1_TEST:sub-user",
  email: "user@example.com",
  display_name: "Test User",
  subscription_tier: "free",
  subscription_expires_at: null,
  push_token: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

const leaseId = "bbbbbbbb-0000-0000-0000-000000000002";
const readingId = "cccccccc-0000-0000-0000-000000000003";

const ownerMember: ILeaseMember = {
  id: "dddddddd-0000-0000-0000-000000000004",
  lease_id: leaseId,
  user_id: user.id,
  role: "owner",
  invited_by: null,
  accepted_at: new Date("2026-01-01T00:00:00Z"),
  created_at: new Date("2026-01-01T00:00:00Z"),
};

/** Base lease with no readings yet (current_odometer is null). */
const baseLease: ILeaseWithMembers = {
  id: leaseId,
  user_id: user.id,
  display_name: "Test Car",
  make: "Toyota",
  model: "Camry",
  year: 2025,
  trim: null,
  color: null,
  vin: null,
  license_plate: null,
  lease_start_date: "2025-01-01",
  lease_end_date: "2028-01-01",
  total_miles_allowed: 36000,
  miles_per_year: 12000,
  starting_odometer: 1000,
  current_odometer: null,
  overage_cost_per_mile: "0.2500",
  monthly_payment: null,
  dealer_name: null,
  dealer_phone: null,
  contract_number: null,
  notes: null,
  is_active: true,
  created_at: new Date("2025-01-01T00:00:00Z"),
  updated_at: new Date("2025-01-01T00:00:00Z"),
  members: [ownerMember],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Queue Cognito + upsertUser mocks for one authenticated request. */
function authAs(u: IUser) {
  mockVerify.mockResolvedValueOnce({ sub: u.cognito_user_id, email: u.email });
  mockUpsertUser.mockResolvedValueOnce(u);
}

/** Build an IOdometerReading fixture with the given odometer value. */
function makeReading(odometer: number): IOdometerReading {
  return {
    id: readingId,
    lease_id: leaseId,
    user_id: user.id,
    odometer,
    reading_date: "2025-06-15",
    notes: null,
    source: "manual",
    created_at: new Date("2025-06-15T00:00:00Z"),
  };
}

// ===========================================================================
// 1. Accept first reading
// ===========================================================================

describe("Odometer validation — accept first reading", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 201 when current_odometer is null and odometer >= starting_odometer", async () => {
    authAs(user);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce({ ...baseLease, current_odometer: null });
    mockCreateOdometerReading.mockResolvedValueOnce(makeReading(5000));

    const res = await request(buildApp())
      .post(`/api/leases/${leaseId}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 5000, reading_date: "2025-06-15" });

    expect(res.status).toBe(201);
    expect(res.body.odometer).toBe(5000);
  });

  it("does not invoke the backward-check guard when current_odometer is null", async () => {
    authAs(user);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    // current_odometer is null — any non-negative value above starting_odometer is valid
    mockGetLease.mockResolvedValueOnce({ ...baseLease, current_odometer: null });
    mockCreateOdometerReading.mockResolvedValueOnce(makeReading(1000));

    const res = await request(buildApp())
      .post(`/api/leases/${leaseId}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 1000, reading_date: "2025-06-15" });

    // Must succeed — no previous max to violate
    expect(res.status).toBe(201);
  });
});

// ===========================================================================
// 2. Reject reading below starting_odometer
// ===========================================================================

describe("Odometer validation — reject reading below starting_odometer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when odometer is strictly below starting_odometer", async () => {
    authAs(user);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    // starting_odometer is 1000; submit 999
    mockGetLease.mockResolvedValueOnce({ ...baseLease, current_odometer: null });

    const res = await request(buildApp())
      .post(`/api/leases/${leaseId}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 999, reading_date: "2025-06-15" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/starting odometer/i);
  });

  it("does not call createOdometerReading when odometer is below starting_odometer", async () => {
    authAs(user);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce({ ...baseLease, current_odometer: null });

    await request(buildApp())
      .post(`/api/leases/${leaseId}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 500, reading_date: "2025-06-15" });

    expect(mockCreateOdometerReading).not.toHaveBeenCalled();
  });

  it("returns 201 when odometer equals starting_odometer (boundary)", async () => {
    authAs(user);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    // starting_odometer is 1000; submit exactly 1000
    mockGetLease.mockResolvedValueOnce({ ...baseLease, current_odometer: null });
    mockCreateOdometerReading.mockResolvedValueOnce(makeReading(1000));

    const res = await request(buildApp())
      .post(`/api/leases/${leaseId}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 1000, reading_date: "2025-06-15" });

    expect(res.status).toBe(201);
  });
});

// ===========================================================================
// 3. Reject reading below previous max (current_odometer)
// ===========================================================================

describe("Odometer validation — reject reading below previous max", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when odometer is strictly below current_odometer", async () => {
    authAs(user);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    // current_odometer is 5000; submit 4999
    mockGetLease.mockResolvedValueOnce({ ...baseLease, current_odometer: 5000 });

    const res = await request(buildApp())
      .post(`/api/leases/${leaseId}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 4999, reading_date: "2025-06-15" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot go backward/i);
  });

  it("does not call createOdometerReading when odometer goes backward", async () => {
    authAs(user);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce({ ...baseLease, current_odometer: 5000 });

    await request(buildApp())
      .post(`/api/leases/${leaseId}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 3000, reading_date: "2025-06-15" });

    expect(mockCreateOdometerReading).not.toHaveBeenCalled();
  });

  it("returns 201 when odometer equals current_odometer (boundary)", async () => {
    authAs(user);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    // Exactly equal to current_odometer is allowed
    mockGetLease.mockResolvedValueOnce({ ...baseLease, current_odometer: 5000 });
    mockCreateOdometerReading.mockResolvedValueOnce(makeReading(5000));

    const res = await request(buildApp())
      .post(`/api/leases/${leaseId}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 5000, reading_date: "2025-06-15" });

    expect(res.status).toBe(201);
  });
});

// ===========================================================================
// 4. current_odometer cache is updated correctly
// ===========================================================================

describe("Odometer validation — current_odometer cache is updated correctly", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls createOdometerReading with the correct leaseId, userId, and odometer value", async () => {
    authAs(user);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce({ ...baseLease, current_odometer: null });
    mockCreateOdometerReading.mockResolvedValueOnce(makeReading(5000));

    await request(buildApp())
      .post(`/api/leases/${leaseId}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 5000, reading_date: "2025-06-15" });

    expect(mockCreateOdometerReading).toHaveBeenCalledWith(
      leaseId,
      user.id,
      expect.objectContaining({ odometer: 5000, reading_date: "2025-06-15" })
    );
  });

  it("simulates cache update: a reading submitted after the first one is validated against the new cache value", async () => {
    // ── First reading ────────────────────────────────────────────────────────
    // Lease starts with current_odometer: null.  Posting 5000 succeeds.
    authAs(user);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce({ ...baseLease, current_odometer: null });
    mockCreateOdometerReading.mockResolvedValueOnce(makeReading(5000));

    const first = await request(buildApp())
      .post(`/api/leases/${leaseId}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 5000, reading_date: "2025-06-15" });

    expect(first.status).toBe(201);
    expect(first.body.odometer).toBe(5000);

    // ── Simulated cache state after first reading ────────────────────────────
    // The DB would now have current_odometer = 5000.  We reflect this in the
    // mock for the next request.

    // ── Second reading (backward — should be rejected) ───────────────────────
    authAs(user);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce({ ...baseLease, current_odometer: 5000 });

    const backward = await request(buildApp())
      .post(`/api/leases/${leaseId}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 4000, reading_date: "2025-07-01" });

    expect(backward.status).toBe(400);
    expect(backward.body.message).toMatch(/cannot go backward/i);

    // ── Third reading (forward — should be accepted) ──────────────────────────
    authAs(user);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce({ ...baseLease, current_odometer: 5000 });
    mockCreateOdometerReading.mockResolvedValueOnce(makeReading(6000));

    const forward = await request(buildApp())
      .post(`/api/leases/${leaseId}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 6000, reading_date: "2025-08-01" });

    expect(forward.status).toBe(201);
    expect(forward.body.odometer).toBe(6000);
  });

  it("returns the reading returned by createOdometerReading as the response body", async () => {
    const expectedReading = makeReading(7500);

    authAs(user);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce({ ...baseLease, current_odometer: 5000 });
    mockCreateOdometerReading.mockResolvedValueOnce(expectedReading);

    const res = await request(buildApp())
      .post(`/api/leases/${leaseId}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 7500, reading_date: "2025-09-01" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(expectedReading.id);
    expect(res.body.odometer).toBe(expectedReading.odometer);
    expect(res.body.lease_id).toBe(leaseId);
    expect(res.body.user_id).toBe(user.id);
  });
});
