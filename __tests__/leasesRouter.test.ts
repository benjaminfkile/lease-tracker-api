import request from "supertest";
import express from "express";
import { IUser } from "../src/interfaces";
import { ILeaseWithRole, ILease, ILeaseWithMembers, ILeaseMember } from "../src/interfaces";
import { errorHandler } from "../src/middleware/errorHandler";

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
  createLease: jest.fn(),
  getLease: jest.fn(),
  updateLease: jest.fn(),
  deleteLease: jest.fn(),
}));

jest.mock("../src/db/leaseMembers", () => ({
  createLeaseMember: jest.fn(),
  getLeaseMember: jest.fn(),
  leaseExists: jest.fn(),
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
}));

// Import after mocks are in place.
import cognitoVerifier from "../src/auth/cognitoVerifier";
import { upsertUser } from "../src/db/users";
import { getLeases, createLease, getLease, updateLease, deleteLease } from "../src/db/leases";
import { createLeaseMember, getLeaseMember, leaseExists } from "../src/db/leaseMembers";
import { createDefaultAlertConfigs, getAlertConfigs, createAlertConfig, getAlertConfig, updateAlertConfig, deleteAlertConfig } from "../src/db/alertConfigs";
import { getReservedTripMiles, getTrips, createTrip, getTrip, updateTrip, deleteTrip } from "../src/db/savedTrips";
import { getReadings, createOdometerReading, getReading, getMaxOdometerExcluding, updateOdometerReading, deleteOdometerReading } from "../src/db/readings";
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
const mockGetAlertConfigs = getAlertConfigs as jest.Mock;
const mockCreateAlertConfig = createAlertConfig as jest.Mock;
const mockGetAlertConfig = getAlertConfig as jest.Mock;
const mockUpdateAlertConfig = updateAlertConfig as jest.Mock;
const mockDeleteAlertConfig = deleteAlertConfig as jest.Mock;
const mockGetReservedTripMiles = getReservedTripMiles as jest.Mock;
const mockGetTrips = getTrips as jest.Mock;
const mockCreateTrip = createTrip as jest.Mock;
const mockGetTrip = getTrip as jest.Mock;
const mockUpdateTrip = updateTrip as jest.Mock;
const mockDeleteTrip = deleteTrip as jest.Mock;
const mockGetReadings = getReadings as jest.Mock;
const mockCreateOdometerReading = createOdometerReading as jest.Mock;
const mockGetReading = getReading as jest.Mock;
const mockGetMaxOdometerExcluding = getMaxOdometerExcluding as jest.Mock;
const mockUpdateOdometerReading = updateOdometerReading as jest.Mock;
const mockDeleteOdometerReading = deleteOdometerReading as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/leases", leasesRouter);
  app.use(errorHandler);
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

const validLeaseBody = {
  display_name: "My Tesla",
  make: "Tesla",
  model: "Model 3",
  year: 2024,
  lease_start_date: "2024-01-01",
  lease_end_date: "2027-01-01",
  total_miles_allowed: 36000,
  miles_per_year: 12000,
  overage_cost_per_mile: 0.25,
};

const createdLease: ILease = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  user_id: fakeUser.id,
  display_name: "My Tesla",
  make: "Tesla",
  model: "Model 3",
  year: 2024,
  trim: null,
  color: null,
  vin: null,
  license_plate: null,
  lease_start_date: "2024-01-01",
  lease_end_date: "2027-01-01",
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
  created_at: new Date("2024-01-01T00:00:00Z"),
  updated_at: new Date("2024-01-01T00:00:00Z"),
};

const fakeMember: ILeaseMember = {
  id: "cccccccc-0000-0000-0000-000000000003",
  lease_id: fakeLease.id,
  user_id: fakeUser.id,
  role: "owner",
  invited_by: null,
  accepted_at: null,
  created_at: new Date("2024-01-01T00:00:00Z"),
};

const fakeLeaseWithMembers: ILeaseWithMembers = {
  ...createdLease,
  id: fakeLease.id,
  members: [fakeMember],
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

describe("POST /api/leases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp())
      .post("/api/leases")
      .send(validLeaseBody);

    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    authSetup();

    const res = await request(buildApp())
      .post("/api/leases")
      .set("Authorization", "Bearer valid.token")
      .send({ display_name: "Missing required fields" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when lease_end_date is before lease_start_date", async () => {
    authSetup();

    const res = await request(buildApp())
      .post("/api/leases")
      .set("Authorization", "Bearer valid.token")
      .send({
        ...validLeaseBody,
        lease_start_date: "2027-01-01",
        lease_end_date: "2024-01-01",
      });

    expect(res.status).toBe(400);
  });

  it("returns 201 with the created lease on success", async () => {
    authSetup();
    mockCreateLease.mockResolvedValueOnce(createdLease);
    mockCreateLeaseMember.mockResolvedValueOnce({});
    mockCreateDefaultAlertConfigs.mockResolvedValueOnce([]);

    const res = await request(buildApp())
      .post("/api/leases")
      .set("Authorization", "Bearer valid.token")
      .send(validLeaseBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(createdLease.id);
    expect(res.body.display_name).toBe(createdLease.display_name);
  });

  it("calls createLease with the authenticated user's id and body data", async () => {
    authSetup();
    mockCreateLease.mockResolvedValueOnce(createdLease);
    mockCreateLeaseMember.mockResolvedValueOnce({});
    mockCreateDefaultAlertConfigs.mockResolvedValueOnce([]);

    await request(buildApp())
      .post("/api/leases")
      .set("Authorization", "Bearer valid.token")
      .send(validLeaseBody);

    expect(mockCreateLease).toHaveBeenCalledWith(
      fakeUser.id,
      expect.objectContaining({ display_name: "My Tesla" })
    );
  });

  it("calls createLeaseMember with owner role after creating lease", async () => {
    authSetup();
    mockCreateLease.mockResolvedValueOnce(createdLease);
    mockCreateLeaseMember.mockResolvedValueOnce({});
    mockCreateDefaultAlertConfigs.mockResolvedValueOnce([]);

    await request(buildApp())
      .post("/api/leases")
      .set("Authorization", "Bearer valid.token")
      .send(validLeaseBody);

    expect(mockCreateLeaseMember).toHaveBeenCalledWith(
      createdLease.id,
      fakeUser.id,
      "owner"
    );
  });

  it("calls createDefaultAlertConfigs with the new lease id and user id", async () => {
    authSetup();
    mockCreateLease.mockResolvedValueOnce(createdLease);
    mockCreateLeaseMember.mockResolvedValueOnce({});
    mockCreateDefaultAlertConfigs.mockResolvedValueOnce([]);

    await request(buildApp())
      .post("/api/leases")
      .set("Authorization", "Bearer valid.token")
      .send(validLeaseBody);

    expect(mockCreateDefaultAlertConfigs).toHaveBeenCalledWith(
      createdLease.id,
      fakeUser.id
    );
  });

  it("returns 500 when createLease throws", async () => {
    authSetup();
    mockCreateLease.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .post("/api/leases")
      .set("Authorization", "Bearer valid.token")
      .send(validLeaseBody);

    expect(res.status).toBe(500);
  });

  it("returns 500 when createLeaseMember throws", async () => {
    authSetup();
    mockCreateLease.mockResolvedValueOnce(createdLease);
    mockCreateLeaseMember.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .post("/api/leases")
      .set("Authorization", "Bearer valid.token")
      .send(validLeaseBody);

    expect(res.status).toBe(500);
  });

  it("returns 500 when createDefaultAlertConfigs throws", async () => {
    authSetup();
    mockCreateLease.mockResolvedValueOnce(createdLease);
    mockCreateLeaseMember.mockResolvedValueOnce({});
    mockCreateDefaultAlertConfigs.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .post("/api/leases")
      .set("Authorization", "Bearer valid.token")
      .send(validLeaseBody);

    expect(res.status).toBe(500);
  });
});

describe("GET /api/leases/:leaseId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp()).get(
      `/api/leases/${fakeLease.id}`
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
  });

  it("returns 403 when the lease exists but the user is not a member", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("returns 200 with the lease and its members on success", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetLease.mockResolvedValueOnce(fakeLeaseWithMembers);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(fakeLease.id);
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].user_id).toBe(fakeUser.id);
  });

  it("calls getLease with the correct leaseId", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetLease.mockResolvedValueOnce(fakeLeaseWithMembers);

    await request(buildApp())
      .get(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token");

    expect(mockGetLease).toHaveBeenCalledWith(fakeLease.id);
  });

  it("returns 200 with an empty members array when there are no members", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetLease.mockResolvedValueOnce({ ...fakeLeaseWithMembers, members: [] });

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body.members).toEqual([]);
  });

  it("returns 500 when getLease throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetLease.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(500);
  });
});

describe("PUT /api/leases/:leaseId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  const editorMember: ILeaseMember = {
    ...fakeMember,
    role: "editor",
  };

  const validUpdateBody = {
    display_name: "Updated Tesla",
    color: "Red",
  };

  const updatedLease: ILease = {
    ...createdLease,
    display_name: "Updated Tesla",
    color: "Red",
  };

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}`)
      .send(validUpdateBody);

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token")
      .send(validUpdateBody);

    expect(res.status).toBe(404);
  });

  it("returns 403 when the lease exists but the user is not a member", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token")
      .send(validUpdateBody);

    expect(res.status).toBe(403);
  });

  it("returns 403 when the user only has viewer role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token")
      .send(validUpdateBody);

    expect(res.status).toBe(403);
  });

  it("returns 400 when validation fails (invalid field value)", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(editorMember);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token")
      .send({ display_name: "" }); // min length 1

    expect(res.status).toBe(400);
  });

  it("returns 400 when lease_end_date is before lease_start_date", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(editorMember);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token")
      .send({ lease_start_date: "2027-01-01", lease_end_date: "2024-01-01" });

    expect(res.status).toBe(400);
  });

  it("returns 200 with the updated lease on success (editor role)", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(editorMember);
    mockUpdateLease.mockResolvedValueOnce(updatedLease);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token")
      .send(validUpdateBody);

    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe("Updated Tesla");
    expect(res.body.color).toBe("Red");
  });

  it("returns 200 with the updated lease on success (owner role)", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember); // owner
    mockUpdateLease.mockResolvedValueOnce(updatedLease);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token")
      .send(validUpdateBody);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdLease.id);
  });

  it("calls updateLease with the correct leaseId and body data", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(editorMember);
    mockUpdateLease.mockResolvedValueOnce(updatedLease);

    await request(buildApp())
      .put(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token")
      .send(validUpdateBody);

    expect(mockUpdateLease).toHaveBeenCalledWith(
      fakeLease.id,
      expect.objectContaining({ display_name: "Updated Tesla", color: "Red" })
    );
  });

  it("returns 404 when updateLease returns undefined", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(editorMember);
    mockUpdateLease.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token")
      .send(validUpdateBody);

    expect(res.status).toBe(404);
  });

  it("returns 500 when updateLease throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(editorMember);
    mockUpdateLease.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token")
      .send(validUpdateBody);

    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/leases/:leaseId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  const deletedLease: ILease = { ...createdLease, is_active: false };

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp()).delete(`/api/leases/${fakeLease.id}`);

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
  });

  it("returns 403 when the lease exists but the user is not a member", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("returns 403 when the user only has viewer role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("returns 403 when the user only has editor role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("returns 204 with no body on success (owner role)", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember); // owner
    mockDeleteLease.mockResolvedValueOnce(deletedLease);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it("calls deleteLease with the correct leaseId", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockDeleteLease.mockResolvedValueOnce(deletedLease);

    await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token");

    expect(mockDeleteLease).toHaveBeenCalledWith(fakeLease.id);
  });

  it("returns 404 when deleteLease returns undefined", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockDeleteLease.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
  });

  it("returns 500 when deleteLease throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockDeleteLease.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/leases/:leaseId/summary
// ---------------------------------------------------------------------------

describe("GET /api/leases/:leaseId/summary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp()).get(
      `/api/leases/${fakeLease.id}/summary`
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist for access check", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
  });

  it("returns 403 when the user is not a member of the lease", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("returns 404 when getLease returns undefined", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetLease.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
  });

  it("returns 200 with summary fields on success", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetLease.mockResolvedValueOnce(fakeLeaseWithMembers);
    mockGetReservedTripMiles.mockResolvedValueOnce(500);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("miles_driven");
    expect(res.body).toHaveProperty("miles_remaining");
    expect(res.body).toHaveProperty("days_elapsed");
    expect(res.body).toHaveProperty("days_remaining");
    expect(res.body).toHaveProperty("lease_length_days");
    expect(res.body).toHaveProperty("expected_miles_to_date");
    expect(res.body).toHaveProperty("current_pace_per_month");
    expect(res.body).toHaveProperty("pace_status");
    expect(res.body).toHaveProperty("miles_over_under_pace");
    expect(res.body).toHaveProperty("projected_miles_at_end");
    expect(res.body).toHaveProperty("projected_overage");
    expect(res.body).toHaveProperty("projected_overage_cost");
    expect(res.body).toHaveProperty("recommended_daily_miles");
    expect(res.body).toHaveProperty("reserved_trip_miles");
    expect(res.body).toHaveProperty("is_premium");
  });

  it("sets is_premium = false for a free-tier user", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetLease.mockResolvedValueOnce(fakeLeaseWithMembers);
    mockGetReservedTripMiles.mockResolvedValueOnce(0);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body.is_premium).toBe(false);
  });

  it("sets reserved_trip_miles to the value returned by getReservedTripMiles", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetLease.mockResolvedValueOnce(fakeLeaseWithMembers);
    mockGetReservedTripMiles.mockResolvedValueOnce(1200);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body.reserved_trip_miles).toBe(1200);
  });

  it("calls getReservedTripMiles with the correct leaseId", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetLease.mockResolvedValueOnce(fakeLeaseWithMembers);
    mockGetReservedTripMiles.mockResolvedValueOnce(0);

    await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(mockGetReservedTripMiles).toHaveBeenCalledWith(fakeLease.id);
  });

  it("returns 500 when getReservedTripMiles throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetLease.mockResolvedValueOnce(fakeLeaseWithMembers);
    mockGetReservedTripMiles.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(500);
  });

  it("allows viewer role to access summary", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });
    mockGetLease.mockResolvedValueOnce(fakeLeaseWithMembers);
    mockGetReservedTripMiles.mockResolvedValueOnce(0);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/summary`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/leases/:leaseId/alerts
// ---------------------------------------------------------------------------

describe("GET /api/leases/:leaseId/alerts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  const fakeAlertConfigs = [
    {
      id: "aaaaaaaa-1111-0000-0000-000000000001",
      lease_id: fakeLease.id,
      user_id: fakeUser.id,
      alert_type: "miles_threshold",
      threshold_value: 80,
      is_enabled: true,
      last_sent_at: null,
      created_at: new Date("2024-01-01T00:00:00Z"),
    },
    {
      id: "aaaaaaaa-1111-0000-0000-000000000002",
      lease_id: fakeLease.id,
      user_id: fakeUser.id,
      alert_type: "over_pace",
      threshold_value: null,
      is_enabled: true,
      last_sent_at: null,
      created_at: new Date("2024-01-01T00:00:00Z"),
    },
    {
      id: "aaaaaaaa-1111-0000-0000-000000000003",
      lease_id: fakeLease.id,
      user_id: fakeUser.id,
      alert_type: "days_remaining",
      threshold_value: 30,
      is_enabled: true,
      last_sent_at: null,
      created_at: new Date("2024-01-01T00:00:00Z"),
    },
  ];

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp()).get(
      `/api/leases/${fakeLease.id}/alerts`
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
  });

  it("returns 403 when the lease exists but the user is not a member", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("returns 200 with an empty array when no alert configs exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });
    mockGetAlertConfigs.mockResolvedValueOnce([]);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 200 with all alert configs for the lease", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetAlertConfigs.mockResolvedValueOnce(fakeAlertConfigs);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].alert_type).toBe("miles_threshold");
    expect(res.body[1].alert_type).toBe("over_pace");
    expect(res.body[2].alert_type).toBe("days_remaining");
  });

  it("allows viewer role to access alerts", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });
    mockGetAlertConfigs.mockResolvedValueOnce(fakeAlertConfigs);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
  });

  it("calls getAlertConfigs with the correct leaseId", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetAlertConfigs.mockResolvedValueOnce(fakeAlertConfigs);

    await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token");

    expect(mockGetAlertConfigs).toHaveBeenCalledWith(fakeLease.id);
  });

  it("returns 500 when getAlertConfigs throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetAlertConfigs.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/leases/:leaseId/alerts
// ---------------------------------------------------------------------------

describe("POST /api/leases/:leaseId/alerts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  const validAlertBody = {
    alert_type: "miles_threshold",
    threshold_value: 90,
  };

  const createdAlertConfig = {
    id: "aaaaaaaa-1111-0000-0000-000000000010",
    lease_id: fakeLease.id,
    user_id: fakeUser.id,
    alert_type: "miles_threshold",
    threshold_value: 90,
    is_enabled: true,
    last_sent_at: null,
    created_at: new Date("2024-01-01T00:00:00Z"),
  };

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/alerts`)
      .send(validAlertBody);

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token")
      .send(validAlertBody);

    expect(res.status).toBe(404);
  });

  it("returns 403 when the lease exists but the user is not a member", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token")
      .send(validAlertBody);

    expect(res.status).toBe(403);
  });

  it("returns 403 when the user only has viewer role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token")
      .send(validAlertBody);

    expect(res.status).toBe(403);
  });

  it("returns 400 when alert_type is missing", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token")
      .send({ threshold_value: 80 });

    expect(res.status).toBe(400);
  });

  it("returns 400 when alert_type is invalid", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token")
      .send({ alert_type: "invalid_type" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when threshold_value is negative", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token")
      .send({ alert_type: "miles_threshold", threshold_value: -1 });

    expect(res.status).toBe(400);
  });

  it("returns 201 with the created alert config for editor role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockCreateAlertConfig.mockResolvedValueOnce(createdAlertConfig);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token")
      .send(validAlertBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(createdAlertConfig.id);
    expect(res.body.alert_type).toBe(createdAlertConfig.alert_type);
    expect(res.body.threshold_value).toBe(createdAlertConfig.threshold_value);
    expect(mockCreateAlertConfig).toHaveBeenCalledWith(
      fakeLease.id,
      fakeUser.id,
      expect.objectContaining({ alert_type: "miles_threshold", threshold_value: 90 })
    );
  });

  it("returns 201 with the created alert config for owner role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockCreateAlertConfig.mockResolvedValueOnce(createdAlertConfig);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token")
      .send(validAlertBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(createdAlertConfig.id);
  });

  it("returns 201 with over_pace type and no threshold_value", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    const overPaceAlert = { ...createdAlertConfig, alert_type: "over_pace", threshold_value: null };
    mockCreateAlertConfig.mockResolvedValueOnce(overPaceAlert);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token")
      .send({ alert_type: "over_pace" });

    expect(res.status).toBe(201);
    expect(res.body.alert_type).toBe("over_pace");
  });

  it("returns 201 with days_remaining type and threshold_value", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    const daysAlert = { ...createdAlertConfig, alert_type: "days_remaining", threshold_value: 30 };
    mockCreateAlertConfig.mockResolvedValueOnce(daysAlert);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token")
      .send({ alert_type: "days_remaining", threshold_value: 30 });

    expect(res.status).toBe(201);
    expect(res.body.alert_type).toBe("days_remaining");
    expect(res.body.threshold_value).toBe(30);
  });

  it("returns 201 with is_enabled explicitly set to false", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    const disabledAlert = { ...createdAlertConfig, is_enabled: false };
    mockCreateAlertConfig.mockResolvedValueOnce(disabledAlert);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token")
      .send({ alert_type: "miles_threshold", threshold_value: 90, is_enabled: false });

    expect(res.status).toBe(201);
    expect(res.body.is_enabled).toBe(false);
  });

  it("returns 500 when createAlertConfig throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockCreateAlertConfig.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/alerts`)
      .set("Authorization", "Bearer valid.token")
      .send(validAlertBody);

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/leases/:leaseId/alerts/:alertId
// ---------------------------------------------------------------------------

describe("PUT /api/leases/:leaseId/alerts/:alertId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  const alertId = "aaaaaaaa-1111-0000-0000-000000000010";

  const existingAlertConfig = {
    id: alertId,
    lease_id: fakeLease.id,
    user_id: fakeUser.id,
    alert_type: "miles_threshold",
    threshold_value: 80,
    is_enabled: true,
    last_sent_at: null,
    created_at: new Date("2024-01-01T00:00:00Z"),
  };

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .send({ is_enabled: false });

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ is_enabled: false });

    expect(res.status).toBe(404);
  });

  it("returns 403 when the lease exists but the user is not a member", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ is_enabled: false });

    expect(res.status).toBe(403);
  });

  it("returns 403 when the user only has viewer role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ is_enabled: false });

    expect(res.status).toBe(403);
  });

  it("returns 404 when the alert config does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetAlertConfig.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ is_enabled: false });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Alert config not found");
  });

  it("returns 400 when threshold_value is negative", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ threshold_value: -1 });

    expect(res.status).toBe(400);
  });

  it("returns 400 when alert_type is provided (not an updatable field)", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ alert_type: "invalid_type" });

    expect(res.status).toBe(400);
  });

  it("returns 200 with the updated alert config when toggling is_enabled for editor role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetAlertConfig.mockResolvedValueOnce(existingAlertConfig);
    const updatedAlert = { ...existingAlertConfig, is_enabled: false };
    mockUpdateAlertConfig.mockResolvedValueOnce(updatedAlert);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ is_enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.is_enabled).toBe(false);
    expect(mockUpdateAlertConfig).toHaveBeenCalledWith(
      fakeLease.id,
      alertId,
      expect.objectContaining({ is_enabled: false })
    );
  });

  it("returns 200 with the updated alert config when adjusting threshold_value for editor role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetAlertConfig.mockResolvedValueOnce(existingAlertConfig);
    const updatedAlert = { ...existingAlertConfig, threshold_value: 90 };
    mockUpdateAlertConfig.mockResolvedValueOnce(updatedAlert);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ threshold_value: 90 });

    expect(res.status).toBe(200);
    expect(res.body.threshold_value).toBe(90);
    expect(mockUpdateAlertConfig).toHaveBeenCalledWith(
      fakeLease.id,
      alertId,
      expect.objectContaining({ threshold_value: 90 })
    );
  });

  it("returns 200 with updated alert config when updating both fields for owner role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember); // owner
    mockGetAlertConfig.mockResolvedValueOnce(existingAlertConfig);
    const updatedAlert = { ...existingAlertConfig, threshold_value: 95, is_enabled: false };
    mockUpdateAlertConfig.mockResolvedValueOnce(updatedAlert);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ threshold_value: 95, is_enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.threshold_value).toBe(95);
    expect(res.body.is_enabled).toBe(false);
  });

  it("returns 500 when updateAlertConfig throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetAlertConfig.mockResolvedValueOnce(existingAlertConfig);
    mockUpdateAlertConfig.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ is_enabled: false });

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/leases/:leaseId/alerts/:alertId
// ---------------------------------------------------------------------------

describe("DELETE /api/leases/:leaseId/alerts/:alertId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const alertId = "aaaaaaaa-1111-0000-0000-000000000020";

  const fakeDeletedAlert = {
    id: alertId,
    lease_id: fakeLease.id,
    user_id: fakeUser.id,
    alert_type: "miles_threshold",
    threshold_value: 80,
    is_enabled: true,
    last_sent_at: null,
    created_at: new Date("2024-01-01T00:00:00Z"),
  };

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp()).delete(
      `/api/leases/${fakeLease.id}/alerts/${alertId}`
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
  });

  it("returns 403 when the lease exists but the user is not a member", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("returns 403 when the user only has viewer role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("returns 404 when the alert config does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockDeleteAlertConfig.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Alert config not found");
  });

  it("returns 204 on success with editor role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockDeleteAlertConfig.mockResolvedValueOnce(fakeDeletedAlert);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it("returns 204 on success with owner role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember); // owner
    mockDeleteAlertConfig.mockResolvedValueOnce(fakeDeletedAlert);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(204);
  });

  it("calls deleteAlertConfig with correct leaseId and alertId", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockDeleteAlertConfig.mockResolvedValueOnce(fakeDeletedAlert);

    await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token");

    expect(mockDeleteAlertConfig).toHaveBeenCalledWith(fakeLease.id, alertId);
  });

  it("returns 500 when deleteAlertConfig throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockDeleteAlertConfig.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/alerts/${alertId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/leases/:leaseId/trips
// ---------------------------------------------------------------------------

describe("GET /api/leases/:leaseId/trips", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  const fakeActiveTrip = {
    id: "eeeeeeee-0000-0000-0000-000000000001",
    lease_id: fakeLease.id,
    user_id: fakeUser.id,
    name: "Weekend Drive",
    estimated_miles: 150,
    trip_date: "2025-07-04",
    notes: null,
    is_completed: false,
    created_at: new Date("2025-06-01T00:00:00Z"),
    updated_at: new Date("2025-06-01T00:00:00Z"),
  };

  const fakeCompletedTrip = {
    id: "ffffffff-0000-0000-0000-000000000002",
    lease_id: fakeLease.id,
    user_id: fakeUser.id,
    name: "Road Trip",
    estimated_miles: 500,
    trip_date: "2025-05-20",
    notes: "fun trip",
    is_completed: true,
    created_at: new Date("2025-05-01T00:00:00Z"),
    updated_at: new Date("2025-05-20T00:00:00Z"),
  };

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp()).get(
      `/api/leases/${fakeLease.id}/trips`
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
  });

  it("returns 403 when the lease exists but the user is not a member", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("returns 200 with empty active and completed arrays when no trips exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });
    mockGetTrips.mockResolvedValueOnce([]);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ active: [], completed: [] });
  });

  it("returns 200 with trips separated into active and completed", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetTrips.mockResolvedValueOnce([fakeActiveTrip, fakeCompletedTrip]);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body.active).toHaveLength(1);
    expect(res.body.active[0].id).toBe(fakeActiveTrip.id);
    expect(res.body.active[0].is_completed).toBe(false);
    expect(res.body.completed).toHaveLength(1);
    expect(res.body.completed[0].id).toBe(fakeCompletedTrip.id);
    expect(res.body.completed[0].is_completed).toBe(true);
  });

  it("allows viewer role to access trips", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });
    mockGetTrips.mockResolvedValueOnce([fakeActiveTrip]);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
  });

  it("returns 500 when getTrips throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetTrips.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/leases/:leaseId/trips
// ---------------------------------------------------------------------------

describe("POST /api/leases/:leaseId/trips", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  const validTripBody = {
    name: "Weekend Drive",
    estimated_miles: 150,
    trip_date: "2025-07-04",
    notes: "Fun trip",
  };

  const createdTrip = {
    id: "eeeeeeee-0000-0000-0000-000000000010",
    lease_id: fakeLease.id,
    user_id: fakeUser.id,
    name: "Weekend Drive",
    estimated_miles: 150,
    trip_date: "2025-07-04",
    notes: "Fun trip",
    is_completed: false,
    created_at: new Date("2025-06-01T00:00:00Z"),
    updated_at: new Date("2025-06-01T00:00:00Z"),
  };

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/trips`)
      .send(validTripBody);

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token")
      .send(validTripBody);

    expect(res.status).toBe(404);
  });

  it("returns 403 when the lease exists but the user is not a member", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token")
      .send(validTripBody);

    expect(res.status).toBe(403);
  });

  it("returns 403 when the user only has viewer role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token")
      .send(validTripBody);

    expect(res.status).toBe(403);
  });

  it("returns 400 when estimated_miles is 0", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token")
      .send({ ...validTripBody, estimated_miles: 0 });

    expect(res.status).toBe(400);
  });

  it("returns 400 when estimated_miles is negative", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token")
      .send({ ...validTripBody, estimated_miles: -5 });

    expect(res.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token")
      .send({ estimated_miles: 150 });

    expect(res.status).toBe(400);
  });

  it("returns 400 when estimated_miles is missing", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token")
      .send({ name: "Weekend Drive" });

    expect(res.status).toBe(400);
  });

  it("returns 201 with the created trip for editor role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockCreateTrip.mockResolvedValueOnce(createdTrip);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token")
      .send(validTripBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(createdTrip.id);
    expect(res.body.name).toBe(createdTrip.name);
    expect(res.body.estimated_miles).toBe(createdTrip.estimated_miles);
    expect(mockCreateTrip).toHaveBeenCalledWith(
      fakeLease.id,
      fakeUser.id,
      expect.objectContaining({ name: "Weekend Drive", estimated_miles: 150 })
    );
  });

  it("returns 201 with the created trip for owner role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockCreateTrip.mockResolvedValueOnce(createdTrip);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token")
      .send(validTripBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(createdTrip.id);
  });

  it("returns 201 with minimum valid body (name and estimated_miles only)", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockCreateTrip.mockResolvedValueOnce({ ...createdTrip, trip_date: null, notes: null });

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token")
      .send({ name: "Short Errand", estimated_miles: 1 });

    expect(res.status).toBe(201);
  });

  it("returns 500 when createTrip throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockCreateTrip.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/trips`)
      .set("Authorization", "Bearer valid.token")
      .send(validTripBody);

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/leases/:leaseId/trips/:tripId
// ---------------------------------------------------------------------------

describe("PUT /api/leases/:leaseId/trips/:tripId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  const tripId = "eeeeeeee-0000-0000-0000-000000000010";

  const existingTrip = {
    id: tripId,
    lease_id: fakeLease.id,
    user_id: fakeUser.id,
    name: "Weekend Drive",
    estimated_miles: 150,
    trip_date: "2025-07-04",
    notes: "Fun trip",
    is_completed: false,
    created_at: new Date("2025-06-01T00:00:00Z"),
    updated_at: new Date("2025-06-01T00:00:00Z"),
  };

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .send({ name: "Updated Name" });

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ name: "Updated Name" });

    expect(res.status).toBe(404);
  });

  it("returns 403 when the lease exists but the user is not a member", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ name: "Updated Name" });

    expect(res.status).toBe(403);
  });

  it("returns 403 when the user only has viewer role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ name: "Updated Name" });

    expect(res.status).toBe(403);
  });

  it("returns 404 when the trip does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetTrip.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ name: "Updated Name" });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Trip not found");
  });

  it("returns 400 when estimated_miles is 0", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ estimated_miles: 0 });

    expect(res.status).toBe(400);
  });

  it("returns 400 when estimated_miles is negative", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ estimated_miles: -10 });

    expect(res.status).toBe(400);
  });

  it("returns 200 with the updated trip for editor role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    const updatedTrip = { ...existingTrip, name: "Updated Name", updated_at: new Date() };
    mockGetTrip.mockResolvedValueOnce(existingTrip);
    mockUpdateTrip.mockResolvedValueOnce(updatedTrip);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ name: "Updated Name" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Name");
    expect(mockUpdateTrip).toHaveBeenCalledWith(
      fakeLease.id,
      tripId,
      expect.objectContaining({ name: "Updated Name" })
    );
  });

  it("returns 200 with the updated trip for owner role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    const updatedTrip = { ...existingTrip, is_completed: true };
    mockGetTrip.mockResolvedValueOnce(existingTrip);
    mockUpdateTrip.mockResolvedValueOnce(updatedTrip);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ is_completed: true });

    expect(res.status).toBe(200);
    expect(res.body.is_completed).toBe(true);
  });

  it("updates multiple fields at once", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    const updatedTrip = {
      ...existingTrip,
      name: "Long Road Trip",
      estimated_miles: 300,
      trip_date: "2025-08-15",
      notes: "Updated notes",
      is_completed: true,
    };
    mockGetTrip.mockResolvedValueOnce(existingTrip);
    mockUpdateTrip.mockResolvedValueOnce(updatedTrip);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token")
      .send({
        name: "Long Road Trip",
        estimated_miles: 300,
        trip_date: "2025-08-15",
        notes: "Updated notes",
        is_completed: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Long Road Trip");
    expect(res.body.estimated_miles).toBe(300);
    expect(res.body.is_completed).toBe(true);
  });

  it("returns 200 with an empty body (no-op update)", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetTrip.mockResolvedValueOnce(existingTrip);
    mockUpdateTrip.mockResolvedValueOnce(existingTrip);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token")
      .send({});

    expect(res.status).toBe(200);
  });

  it("returns 500 when getTrip throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetTrip.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ name: "Updated Name" });

    expect(res.status).toBe(500);
  });

  it("returns 500 when updateTrip throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetTrip.mockResolvedValueOnce(existingTrip);
    mockUpdateTrip.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ name: "Updated Name" });

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/leases/:leaseId/trips/:tripId
// ---------------------------------------------------------------------------

describe("DELETE /api/leases/:leaseId/trips/:tripId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const tripId = "eeeeeeee-0000-0000-0000-000000000010";

  const fakeDeletedTrip = {
    id: tripId,
    lease_id: fakeLease.id,
    user_id: fakeUser.id,
    name: "Weekend Drive",
    estimated_miles: 150,
    trip_date: "2025-07-04",
    notes: null,
    is_completed: false,
    created_at: new Date("2025-06-01T00:00:00Z"),
    updated_at: new Date("2025-06-01T00:00:00Z"),
  };

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp()).delete(
      `/api/leases/${fakeLease.id}/trips/${tripId}`
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist for access check", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
  });

  it("returns 403 when the lease exists but the user is not a member", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("returns 403 when the user only has viewer role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("returns 404 when the trip does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockDeleteTrip.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/trip not found/i);
  });

  it("returns 204 on success with editor role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockDeleteTrip.mockResolvedValueOnce(fakeDeletedTrip);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it("returns 204 on success with owner role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember); // owner
    mockDeleteTrip.mockResolvedValueOnce(fakeDeletedTrip);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(204);
  });

  it("calls deleteTrip with correct leaseId and tripId", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockDeleteTrip.mockResolvedValueOnce(fakeDeletedTrip);

    await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token");

    expect(mockDeleteTrip).toHaveBeenCalledWith(fakeLease.id, tripId);
  });

  it("returns 500 when deleteTrip throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockDeleteTrip.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/trips/${tripId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/leases/:leaseId/readings
// ---------------------------------------------------------------------------

describe("GET /api/leases/:leaseId/readings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  const fakeReading = {
    id: "dddddddd-0000-0000-0000-000000000001",
    lease_id: fakeLease.id,
    user_id: fakeUser.id,
    odometer: 12500,
    reading_date: "2025-06-15",
    notes: null,
    source: "manual",
    created_at: new Date("2025-06-15T00:00:00Z"),
  };

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp()).get(
      `/api/leases/${fakeLease.id}/readings`
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
  });

  it("returns 403 when the lease exists but the user is not a member", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("returns 200 with an empty array when there are no readings", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });
    mockGetReadings.mockResolvedValueOnce([]);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 200 with readings on success", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetReadings.mockResolvedValueOnce([fakeReading]);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(fakeReading.id);
    expect(res.body[0].odometer).toBe(fakeReading.odometer);
    expect(res.body[0].reading_date).toBe(fakeReading.reading_date);
  });

  it("allows viewer role to access readings", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });
    mockGetReadings.mockResolvedValueOnce([fakeReading]);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
  });

  it("calls getReadings with the correct leaseId and no options when no query params", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetReadings.mockResolvedValueOnce([]);

    await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token");

    expect(mockGetReadings).toHaveBeenCalledWith(fakeLease.id, {
      limit: undefined,
      before: undefined,
    });
  });

  it("passes limit to getReadings when ?limit= is provided", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetReadings.mockResolvedValueOnce([fakeReading]);

    await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/readings?limit=5`)
      .set("Authorization", "Bearer valid.token");

    expect(mockGetReadings).toHaveBeenCalledWith(fakeLease.id, {
      limit: 5,
      before: undefined,
    });
  });

  it("passes before to getReadings when ?before= is provided", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetReadings.mockResolvedValueOnce([fakeReading]);

    await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/readings?before=2025-07-01`)
      .set("Authorization", "Bearer valid.token");

    expect(mockGetReadings).toHaveBeenCalledWith(fakeLease.id, {
      limit: undefined,
      before: "2025-07-01",
    });
  });

  it("passes both limit and before when both query params are provided", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetReadings.mockResolvedValueOnce([fakeReading]);

    await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/readings?limit=10&before=2025-07-01`)
      .set("Authorization", "Bearer valid.token");

    expect(mockGetReadings).toHaveBeenCalledWith(fakeLease.id, {
      limit: 10,
      before: "2025-07-01",
    });
  });

  it("returns 400 when limit is not a positive integer", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/readings?limit=abc`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(400);
  });

  it("returns 400 when limit is zero", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/readings?limit=0`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(400);
  });

  it("returns 400 when before is not a valid date format", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/readings?before=not-a-date`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(400);
  });

  it("returns 500 when getReadings throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember);
    mockGetReadings.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .get(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/leases/:leaseId/readings
// ---------------------------------------------------------------------------

describe("POST /api/leases/:leaseId/readings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  const fakePostReading = {
    id: "dddddddd-0000-0000-0000-000000000002",
    lease_id: fakeLease.id,
    user_id: fakeUser.id,
    odometer: 12500,
    reading_date: "2025-06-15",
    notes: null,
    source: "manual",
    created_at: new Date("2025-06-15T00:00:00Z"),
  };

  const validReadingBody = {
    odometer: 12500,
    reading_date: "2025-06-15",
  };

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .send(validReadingBody);

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist for access check", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send(validReadingBody);

    expect(res.status).toBe(404);
  });

  it("returns 403 when the lease exists but the user is not a member", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send(validReadingBody);

    expect(res.status).toBe(403);
  });

  it("returns 403 when the user only has viewer role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send(validReadingBody);

    expect(res.status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 400 when odometer is negative", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: -1, reading_date: "2025-06-15" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when reading_date is not a valid date", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 12500, reading_date: "not-a-date" });

    expect(res.status).toBe(400);
  });

  it("returns 404 when getLease returns undefined after access check", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send(validReadingBody);

    expect(res.status).toBe(404);
  });

  it("returns 400 when reading_date is before the lease start date", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce(fakeLeaseWithMembers); // lease_start_date: 2024-01-01

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 12500, reading_date: "2023-12-31" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/lease start date/i);
  });

  it("returns 400 when odometer is below starting_odometer", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    const leaseWithHighStart = {
      ...fakeLeaseWithMembers,
      starting_odometer: 100,
      current_odometer: null,
    };
    mockGetLease.mockResolvedValueOnce(leaseWithHighStart);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 50, reading_date: "2025-06-15" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/starting odometer/i);
  });

  it("returns 400 when odometer goes backward (below current_odometer)", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    const leaseWithCurrentOdometer = {
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: 5000,
    };
    mockGetLease.mockResolvedValueOnce(leaseWithCurrentOdometer);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 4999, reading_date: "2025-06-15" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot go backward/i);
  });

  it("returns 201 with the created reading on success (editor role)", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: null,
    });
    mockCreateOdometerReading.mockResolvedValueOnce(fakePostReading);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send(validReadingBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(fakePostReading.id);
    expect(res.body.odometer).toBe(fakePostReading.odometer);
    expect(res.body.reading_date).toBe(fakePostReading.reading_date);
  });

  it("returns 201 with the created reading on success (owner role)", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember); // owner
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: null,
    });
    mockCreateOdometerReading.mockResolvedValueOnce(fakePostReading);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send(validReadingBody);

    expect(res.status).toBe(201);
  });

  it("allows odometer equal to starting_odometer", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 12500,
      current_odometer: null,
    });
    mockCreateOdometerReading.mockResolvedValueOnce({
      ...fakePostReading,
      odometer: 12500,
    });

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 12500, reading_date: "2025-06-15" });

    expect(res.status).toBe(201);
  });

  it("allows reading_date equal to lease_start_date", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: null,
    });
    mockCreateOdometerReading.mockResolvedValueOnce(fakePostReading);

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 12500, reading_date: "2024-01-01" }); // matches lease_start_date

    expect(res.status).toBe(201);
  });

  it("skips backward-check when current_odometer is null (first reading)", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: null,
    });
    mockCreateOdometerReading.mockResolvedValueOnce({
      ...fakePostReading,
      odometer: 100,
    });

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 100, reading_date: "2025-06-15" });

    expect(res.status).toBe(201);
  });

  it("calls createOdometerReading with correct leaseId, userId, and body", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: null,
    });
    mockCreateOdometerReading.mockResolvedValueOnce(fakePostReading);

    await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 12500, reading_date: "2025-06-15", notes: "Test note" });

    expect(mockCreateOdometerReading).toHaveBeenCalledWith(
      fakeLease.id,
      fakeUser.id,
      expect.objectContaining({
        odometer: 12500,
        reading_date: "2025-06-15",
        notes: "Test note",
      })
    );
  });

  it("returns 500 when createOdometerReading throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: null,
    });
    mockCreateOdometerReading.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .post(`/api/leases/${fakeLease.id}/readings`)
      .set("Authorization", "Bearer valid.token")
      .send(validReadingBody);

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/leases/:leaseId/readings/:readingId
// ---------------------------------------------------------------------------

describe("PUT /api/leases/:leaseId/readings/:readingId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const readingId = "dddddddd-0000-0000-0000-000000000003";

  const fakeExistingReading = {
    id: readingId,
    lease_id: fakeLease.id,
    user_id: fakeUser.id,
    odometer: 12500,
    reading_date: "2025-06-15",
    notes: null,
    source: "manual",
    created_at: new Date("2025-06-15T00:00:00Z"),
  };

  const fakeUpdatedReading = {
    ...fakeExistingReading,
    odometer: 13000,
    reading_date: "2025-07-01",
    notes: "Updated note",
  };

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .send({ odometer: 13000 });

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist for access check", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 13000 });

    expect(res.status).toBe(404);
  });

  it("returns 403 when the lease exists but the user is not a member", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 13000 });

    expect(res.status).toBe(403);
  });

  it("returns 403 when the user only has viewer role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 13000 });

    expect(res.status).toBe(403);
  });

  it("returns 400 when odometer is negative", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: -1 });

    expect(res.status).toBe(400);
  });

  it("returns 400 when reading_date is not a valid date", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ reading_date: "not-a-date" });

    expect(res.status).toBe(400);
  });

  it("returns 404 when getLease returns undefined after access check", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 13000 });

    expect(res.status).toBe(404);
  });

  it("returns 404 when getReading returns undefined (reading not found)", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: 12500,
    });
    mockGetReading.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 13000 });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/reading not found/i);
  });

  it("returns 400 when odometer is below starting_odometer", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 100,
      current_odometer: 12500,
    });
    mockGetReading.mockResolvedValueOnce(fakeExistingReading);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 50 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/starting odometer/i);
  });

  it("returns 400 when odometer would go backward (below max of other readings)", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: 15000,
    });
    mockGetReading.mockResolvedValueOnce(fakeExistingReading);
    mockGetMaxOdometerExcluding.mockResolvedValueOnce(14000);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 13000 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot go backward/i);
  });

  it("returns 200 with the updated reading on success (editor role)", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: 12500,
    });
    mockGetReading.mockResolvedValueOnce(fakeExistingReading);
    mockGetMaxOdometerExcluding.mockResolvedValueOnce(null);
    mockUpdateOdometerReading.mockResolvedValueOnce(fakeUpdatedReading);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 13000, reading_date: "2025-07-01", notes: "Updated note" });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(fakeUpdatedReading.id);
    expect(res.body.odometer).toBe(fakeUpdatedReading.odometer);
    expect(res.body.reading_date).toBe(fakeUpdatedReading.reading_date);
    expect(res.body.notes).toBe(fakeUpdatedReading.notes);
  });

  it("returns 200 with the updated reading on success (owner role)", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember); // owner
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: 12500,
    });
    mockGetReading.mockResolvedValueOnce(fakeExistingReading);
    mockGetMaxOdometerExcluding.mockResolvedValueOnce(null);
    mockUpdateOdometerReading.mockResolvedValueOnce(fakeUpdatedReading);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 13000 });

    expect(res.status).toBe(200);
  });

  it("allows editing only notes without triggering odometer validation", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: 12500,
    });
    mockGetReading.mockResolvedValueOnce(fakeExistingReading);
    mockUpdateOdometerReading.mockResolvedValueOnce({
      ...fakeExistingReading,
      notes: "Just a note update",
    });

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ notes: "Just a note update" });

    expect(res.status).toBe(200);
    expect(mockGetMaxOdometerExcluding).not.toHaveBeenCalled();
  });

  it("allows setting notes to null to clear it", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: 12500,
    });
    mockGetReading.mockResolvedValueOnce({ ...fakeExistingReading, notes: "old note" });
    mockUpdateOdometerReading.mockResolvedValueOnce({
      ...fakeExistingReading,
      notes: null,
    });

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ notes: null });

    expect(res.status).toBe(200);
    expect(res.body.notes).toBeNull();
  });

  it("allows editing only reading_date without triggering odometer validation", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: 12500,
    });
    mockGetReading.mockResolvedValueOnce(fakeExistingReading);
    mockUpdateOdometerReading.mockResolvedValueOnce({
      ...fakeExistingReading,
      reading_date: "2025-07-01",
    });

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ reading_date: "2025-07-01" });

    expect(res.status).toBe(200);
    expect(mockGetMaxOdometerExcluding).not.toHaveBeenCalled();
  });

  it("allows odometer equal to starting_odometer when no other readings exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 12500,
      current_odometer: 12500,
    });
    mockGetReading.mockResolvedValueOnce(fakeExistingReading);
    mockGetMaxOdometerExcluding.mockResolvedValueOnce(null);
    mockUpdateOdometerReading.mockResolvedValueOnce(fakeExistingReading);

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 12500 });

    expect(res.status).toBe(200);
  });

  it("allows odometer equal to max of other readings", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: 14000,
    });
    mockGetReading.mockResolvedValueOnce(fakeExistingReading);
    mockGetMaxOdometerExcluding.mockResolvedValueOnce(13000);
    mockUpdateOdometerReading.mockResolvedValueOnce({
      ...fakeExistingReading,
      odometer: 13000,
    });

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 13000 });

    expect(res.status).toBe(200);
  });

  it("calls updateOdometerReading with correct leaseId, readingId, and body", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: 12500,
    });
    mockGetReading.mockResolvedValueOnce(fakeExistingReading);
    mockGetMaxOdometerExcluding.mockResolvedValueOnce(null);
    mockUpdateOdometerReading.mockResolvedValueOnce(fakeUpdatedReading);

    await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 13000, notes: "Test" });

    expect(mockUpdateOdometerReading).toHaveBeenCalledWith(
      fakeLease.id,
      readingId,
      expect.objectContaining({ odometer: 13000, notes: "Test" })
    );
  });

  it("returns 500 when updateOdometerReading throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockGetLease.mockResolvedValueOnce({
      ...fakeLeaseWithMembers,
      starting_odometer: 0,
      current_odometer: 12500,
    });
    mockGetReading.mockResolvedValueOnce(fakeExistingReading);
    mockGetMaxOdometerExcluding.mockResolvedValueOnce(null);
    mockUpdateOdometerReading.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .put(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token")
      .send({ odometer: 13000 });

    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/leases/:leaseId/readings/:readingId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const readingId = "eeeeeeee-0000-0000-0000-000000000004";

  const fakeDeletedReading = {
    id: readingId,
    lease_id: fakeLease.id,
    user_id: fakeUser.id,
    odometer: 12500,
    reading_date: "2025-06-15",
    notes: null,
    source: "manual",
    created_at: new Date("2025-06-15T00:00:00Z"),
  };

  function authSetup() {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
  }

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp()).delete(
      `/api/leases/${fakeLease.id}/readings/${readingId}`
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 when the lease does not exist for access check", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(false);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
  });

  it("returns 403 when the lease exists but the user is not a member", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(undefined);
    mockLeaseExists.mockResolvedValueOnce(true);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("returns 403 when the user only has viewer role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "viewer" });

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(403);
  });

  it("returns 404 when the reading does not exist", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockDeleteOdometerReading.mockResolvedValueOnce(undefined);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/reading not found/i);
  });

  it("returns 204 on success with editor role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockDeleteOdometerReading.mockResolvedValueOnce(fakeDeletedReading);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it("returns 204 on success with owner role", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce(fakeMember); // owner
    mockDeleteOdometerReading.mockResolvedValueOnce(fakeDeletedReading);

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(204);
  });

  it("calls deleteOdometerReading with correct leaseId and readingId", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockDeleteOdometerReading.mockResolvedValueOnce(fakeDeletedReading);

    await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token");

    expect(mockDeleteOdometerReading).toHaveBeenCalledWith(
      fakeLease.id,
      readingId
    );
  });

  it("returns 500 when deleteOdometerReading throws", async () => {
    authSetup();
    mockGetLeaseMember.mockResolvedValueOnce({ ...fakeMember, role: "editor" });
    mockDeleteOdometerReading.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .delete(`/api/leases/${fakeLease.id}/readings/${readingId}`)
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(500);
  });
});
