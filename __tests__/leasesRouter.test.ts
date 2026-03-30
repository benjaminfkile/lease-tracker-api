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
}));

jest.mock("../src/db/leaseMembers", () => ({
  createLeaseMember: jest.fn(),
  getLeaseMember: jest.fn(),
  leaseExists: jest.fn(),
}));

jest.mock("../src/db/alertConfigs", () => ({
  createDefaultAlertConfigs: jest.fn(),
}));

// Import after mocks are in place.
import cognitoVerifier from "../src/auth/cognitoVerifier";
import { upsertUser } from "../src/db/users";
import { getLeases, createLease, getLease, updateLease } from "../src/db/leases";
import { createLeaseMember, getLeaseMember, leaseExists } from "../src/db/leaseMembers";
import { createDefaultAlertConfigs } from "../src/db/alertConfigs";
import leasesRouter from "../src/routers/leasesRouter";

const mockVerify = cognitoVerifier.verify as jest.Mock;
const mockUpsertUser = upsertUser as jest.Mock;
const mockGetLeases = getLeases as jest.Mock;
const mockCreateLease = createLease as jest.Mock;
const mockGetLease = getLease as jest.Mock;
const mockUpdateLease = updateLease as jest.Mock;
const mockCreateLeaseMember = createLeaseMember as jest.Mock;
const mockGetLeaseMember = getLeaseMember as jest.Mock;
const mockLeaseExists = leaseExists as jest.Mock;
const mockCreateDefaultAlertConfigs = createDefaultAlertConfigs as jest.Mock;

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
