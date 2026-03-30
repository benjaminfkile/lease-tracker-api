/**
 * Integration tests — Lease CRUD lifecycle and access control.
 *
 * These tests exercise the full create → read-list → read-single → update →
 * delete sequence for a single owner, and verify that a second user (user B)
 * is blocked from reading, updating, or deleting a lease they do not own.
 *
 * All external I/O (Cognito, DB helpers) is mocked so no real database is
 * needed.  The mocks are orchestrated request-by-request to simulate the
 * state changes that would occur in a real database.
 */

import request from "supertest";
import express from "express";
import { IUser, ILease, ILeaseWithRole, ILeaseWithMembers, ILeaseMember } from "../src/interfaces";
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
import {
  getLeases,
  createLease,
  getLease,
  updateLease,
  deleteLease,
} from "../src/db/leases";
import {
  createLeaseMember,
  getLeaseMember,
  leaseExists,
} from "../src/db/leaseMembers";
import { createDefaultAlertConfigs } from "../src/db/alertConfigs";
import leasesRouter from "../src/routers/leasesRouter";

const mockVerify = cognitoVerifier.verify as jest.Mock;
const mockUpsertUser = upsertUser as jest.Mock;
const mockGetLeases = getLeases as jest.Mock;
const mockCreateLease = createLease as jest.Mock;
const mockGetLease = getLease as jest.Mock;
const mockUpdateLease = updateLease as jest.Mock;
const mockDeleteLease = deleteLease as jest.Mock;
const mockCreateLeaseMember = createLeaseMember as jest.Mock;
const mockGetLeaseMember = getLeaseMember as jest.Mock;
const mockLeaseExists = leaseExists as jest.Mock;
const mockCreateDefaultAlertConfigs = createDefaultAlertConfigs as jest.Mock;

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

const userA: IUser = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  cognito_user_id: "us-east-1_TEST:sub-userA",
  email: "usera@example.com",
  display_name: "User A",
  subscription_tier: "free",
  subscription_expires_at: null,
  push_token: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

const userB: IUser = {
  id: "bbbbbbbb-0000-0000-0000-000000000002",
  cognito_user_id: "us-east-1_TEST:sub-userB",
  email: "userb@example.com",
  display_name: "User B",
  subscription_tier: "free",
  subscription_expires_at: null,
  push_token: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

const leaseId = "cccccccc-0000-0000-0000-000000000003";

const createdLease: ILease = {
  id: leaseId,
  user_id: userA.id,
  display_name: "User A's Honda",
  make: "Honda",
  model: "Accord",
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
};

const ownerMember: ILeaseMember = {
  id: "dddddddd-0000-0000-0000-000000000004",
  lease_id: leaseId,
  user_id: userA.id,
  role: "owner",
  invited_by: null,
  accepted_at: new Date("2025-01-01T00:00:00Z"),
  created_at: new Date("2025-01-01T00:00:00Z"),
};

const leaseWithMembers: ILeaseWithMembers = {
  ...createdLease,
  members: [ownerMember],
};

const leaseWithRoleOwner: ILeaseWithRole = {
  ...createdLease,
  role: "owner",
};

const validLeaseBody = {
  display_name: "User A's Honda",
  make: "Honda",
  model: "Accord",
  year: 2025,
  lease_start_date: "2025-01-01",
  lease_end_date: "2028-01-01",
  total_miles_allowed: 36000,
  miles_per_year: 12000,
  overage_cost_per_mile: 0.25,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set up Cognito + upsertUser mocks for a single authenticated request. */
function authAs(user: IUser) {
  mockVerify.mockResolvedValueOnce({
    sub: user.cognito_user_id,
    email: user.email,
  });
  mockUpsertUser.mockResolvedValueOnce(user);
}

// ===========================================================================
// Full CRUD lifecycle — user A creates, reads, updates, and deletes their own lease
// ===========================================================================

describe("Lease CRUD lifecycle (owner)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Step 1: Create ──────────────────────────────────────────────────────

  it("POST /api/leases — creates a new lease and returns 201", async () => {
    authAs(userA);
    mockCreateLease.mockResolvedValueOnce(createdLease);
    mockCreateLeaseMember.mockResolvedValueOnce(ownerMember);
    mockCreateDefaultAlertConfigs.mockResolvedValueOnce([]);

    const res = await request(buildApp())
      .post("/api/leases")
      .set("Authorization", "Bearer valid.token")
      .send(validLeaseBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(leaseId);
    expect(res.body.display_name).toBe("User A's Honda");
    expect(res.body.user_id).toBe(userA.id);
  });

  it("POST /api/leases — creates the owner lease_member record with role 'owner'", async () => {
    authAs(userA);
    mockCreateLease.mockResolvedValueOnce(createdLease);
    mockCreateLeaseMember.mockResolvedValueOnce(ownerMember);
    mockCreateDefaultAlertConfigs.mockResolvedValueOnce([]);

    await request(buildApp())
      .post("/api/leases")
      .set("Authorization", "Bearer valid.token")
      .send(validLeaseBody);

    expect(mockCreateLeaseMember).toHaveBeenCalledWith(leaseId, userA.id, "owner");
  });

  it("POST /api/leases — seeds default alert configs for the new lease", async () => {
    authAs(userA);
    mockCreateLease.mockResolvedValueOnce(createdLease);
    mockCreateLeaseMember.mockResolvedValueOnce(ownerMember);
    mockCreateDefaultAlertConfigs.mockResolvedValueOnce([]);

    await request(buildApp())
      .post("/api/leases")
      .set("Authorization", "Bearer valid.token")
      .send(validLeaseBody);

    expect(mockCreateDefaultAlertConfigs).toHaveBeenCalledWith(leaseId, userA.id);
  });

  // ── Step 2: Read list ───────────────────────────────────────────────────

  it("GET /api/leases — returns the newly created lease in the list", async () => {
    authAs(userA);
    mockGetLeases.mockResolvedValueOnce([leaseWithRoleOwner]);

    const res = await request(buildApp())
      .get("/api/leases")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(leaseId);
    expect(res.body[0].role).toBe("owner");
  });

  // ── Step 3: Read single ─────────────────────────────────────────────────

  it("GET /api/leases/:leaseId — returns the lease with members array", async () => {
    authAs(userA);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(leaseWithMembers);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(leaseId);
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(res.body.members[0].user_id).toBe(userA.id);
    expect(res.body.members[0].role).toBe("owner");
  });

  // ── Step 4: Update ──────────────────────────────────────────────────────

  it("PUT /api/leases/:leaseId — updates the lease and returns 200 with new values", async () => {
    const updatedLease: ILease = {
      ...createdLease,
      display_name: "User A's Updated Honda",
      color: "Blue",
    };

    authAs(userA);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockUpdateLease.mockResolvedValueOnce(updatedLease);

    const res = await request(buildApp())
      .put(`/api/leases/${leaseId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ display_name: "User A's Updated Honda", color: "Blue" });

    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe("User A's Updated Honda");
    expect(res.body.color).toBe("Blue");
    expect(mockUpdateLease).toHaveBeenCalledWith(
      leaseId,
      expect.objectContaining({ display_name: "User A's Updated Honda", color: "Blue" })
    );
  });

  it("GET /api/leases/:leaseId — reflects the updated field after a PUT", async () => {
    const updatedLease: ILease = {
      ...createdLease,
      display_name: "User A's Updated Honda",
      color: "Blue",
    };
    const updatedLeaseWithMembers: ILeaseWithMembers = {
      ...updatedLease,
      members: [ownerMember],
    };

    authAs(userA);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockGetLease.mockResolvedValueOnce(updatedLeaseWithMembers);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe("User A's Updated Honda");
    expect(res.body.color).toBe("Blue");
  });

  // ── Step 5: Delete ──────────────────────────────────────────────────────

  it("DELETE /api/leases/:leaseId — deletes the lease and returns 204", async () => {
    authAs(userA);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);
    mockDeleteLease.mockResolvedValueOnce(createdLease);

    const res = await request(buildApp())
      .delete(`/api/leases/${leaseId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(mockDeleteLease).toHaveBeenCalledWith(leaseId);
  });

  it("GET /api/leases — returns empty list after the lease is deleted", async () => {
    authAs(userA);
    mockGetLeases.mockResolvedValueOnce([]);

    const res = await request(buildApp())
      .get("/api/leases")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ===========================================================================
// Access control — user B cannot read, update, or delete user A's lease
// ===========================================================================

describe("Lease access control — user B cannot access user A's lease", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("GET /api/leases — does not include user A's lease in user B's list", async () => {
    // The DB query is scoped to the authenticated user; user B has no leases.
    authAs(userB);
    mockGetLeases.mockResolvedValueOnce([]);

    const res = await request(buildApp())
      .get("/api/leases")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(mockGetLeases).toHaveBeenCalledWith(userB.id);
  });

  it("GET /api/leases/:leaseId — returns 403 when user B tries to read user A's lease", async () => {
    // getLeaseMember returns null for userB, but the lease exists → 403.
    authAs(userB);
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("PUT /api/leases/:leaseId — returns 403 when user B tries to update user A's lease", async () => {
    authAs(userB);
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .put(`/api/leases/${leaseId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ display_name: "Hijacked lease" });

    expect(res.status).toBe(403);
    expect(mockUpdateLease).not.toHaveBeenCalled();
  });

  it("DELETE /api/leases/:leaseId — returns 403 when user B tries to delete user A's lease", async () => {
    authAs(userB);
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .delete(`/api/leases/${leaseId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
    expect(mockDeleteLease).not.toHaveBeenCalled();
  });

  it("GET /api/leases/:leaseId — returns 404 when lease does not exist (not just forbidden)", async () => {
    // When the lease truly doesn't exist, both users should receive 404.
    authAs(userB);
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .get(`/api/leases/${leaseId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// Validation — POST and PUT reject malformed input before touching the DB
// ===========================================================================

describe("Lease validation during create and update", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("POST /api/leases — returns 400 when required fields are missing", async () => {
    authAs(userA);

    const res = await request(buildApp())
      .post("/api/leases")
      .set("Authorization", "Bearer valid.token")
      .send({ display_name: "Only name provided" });

    expect(res.status).toBe(400);
    expect(mockCreateLease).not.toHaveBeenCalled();
  });

  it("POST /api/leases — returns 400 when lease_end_date precedes lease_start_date", async () => {
    authAs(userA);

    const res = await request(buildApp())
      .post("/api/leases")
      .set("Authorization", "Bearer valid.token")
      .send({
        ...validLeaseBody,
        lease_start_date: "2028-01-01",
        lease_end_date: "2025-01-01",
      });

    expect(res.status).toBe(400);
    expect(mockCreateLease).not.toHaveBeenCalled();
  });

  it("PUT /api/leases/:leaseId — returns 400 when display_name is an empty string", async () => {
    authAs(userA);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);

    const res = await request(buildApp())
      .put(`/api/leases/${leaseId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ display_name: "" });

    expect(res.status).toBe(400);
    expect(mockUpdateLease).not.toHaveBeenCalled();
  });

  it("PUT /api/leases/:leaseId — returns 400 when lease_end_date precedes lease_start_date", async () => {
    authAs(userA);
    mockGetLeaseMember.mockResolvedValueOnce(ownerMember);

    const res = await request(buildApp())
      .put(`/api/leases/${leaseId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ lease_start_date: "2028-01-01", lease_end_date: "2025-01-01" });

    expect(res.status).toBe(400);
    expect(mockUpdateLease).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Authentication guard — all CRUD endpoints require a valid token
// ===========================================================================

describe("Authentication guard on lease CRUD endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("POST /api/leases — returns 401 when no Authorization header is present", async () => {
    const res = await request(buildApp())
      .post("/api/leases")
      .send(validLeaseBody);

    expect(res.status).toBe(401);
  });

  it("GET /api/leases — returns 401 when no Authorization header is present", async () => {
    const res = await request(buildApp()).get("/api/leases");

    expect(res.status).toBe(401);
  });

  it("GET /api/leases/:leaseId — returns 401 when no Authorization header is present", async () => {
    const res = await request(buildApp()).get(`/api/leases/${leaseId}`);

    expect(res.status).toBe(401);
  });

  it("PUT /api/leases/:leaseId — returns 401 when no Authorization header is present", async () => {
    const res = await request(buildApp())
      .put(`/api/leases/${leaseId}`)
      .send({ display_name: "Attempt" });

    expect(res.status).toBe(401);
  });

  it("DELETE /api/leases/:leaseId — returns 401 when no Authorization header is present", async () => {
    const res = await request(buildApp()).delete(`/api/leases/${leaseId}`);

    expect(res.status).toBe(401);
  });
});
