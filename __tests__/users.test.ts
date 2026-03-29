import { upsertUser, updateUser, deleteUser } from "../src/db/users";
import { getDb } from "../src/db/db";
import { IUser } from "../src/interfaces";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("../src/db/db", () => ({
  getDb: jest.fn(),
}));

const mockGetDb = getDb as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMockKnex(returning: IUser[]) {
  const chain = {
    insert: jest.fn().mockReturnThis(),
    onConflict: jest.fn().mockReturnThis(),
    merge: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(returning),
  };
  return jest.fn().mockReturnValue(chain);
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
// upsertUser
// ---------------------------------------------------------------------------

describe("upsertUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls getDb to obtain the knex instance", async () => {
    const mockKnex = buildMockKnex([fakeUser]);
    mockGetDb.mockReturnValue(mockKnex);

    await upsertUser("us-east-1_TEST:sub-001", "test@example.com");

    expect(mockGetDb).toHaveBeenCalledTimes(1);
  });

  it("targets the 'users' table", async () => {
    const mockKnex = buildMockKnex([fakeUser]);
    mockGetDb.mockReturnValue(mockKnex);

    await upsertUser("us-east-1_TEST:sub-001", "test@example.com");

    expect(mockKnex).toHaveBeenCalledWith("users");
  });

  it("inserts cognito_user_id and email", async () => {
    const mockKnex = buildMockKnex([fakeUser]);
    const chain = mockKnex("users");
    mockGetDb.mockReturnValue(mockKnex);

    await upsertUser("us-east-1_TEST:sub-001", "test@example.com");

    expect(chain.insert).toHaveBeenCalledWith({
      cognito_user_id: "us-east-1_TEST:sub-001",
      email: "test@example.com",
    });
  });

  it("uses onConflict on cognito_user_id", async () => {
    const mockKnex = buildMockKnex([fakeUser]);
    const chain = mockKnex("users");
    mockGetDb.mockReturnValue(mockKnex);

    await upsertUser("us-east-1_TEST:sub-001", "test@example.com");

    expect(chain.onConflict).toHaveBeenCalledWith("cognito_user_id");
  });

  it("merges the email column on conflict", async () => {
    const mockKnex = buildMockKnex([fakeUser]);
    const chain = mockKnex("users");
    mockGetDb.mockReturnValue(mockKnex);

    await upsertUser("us-east-1_TEST:sub-001", "test@example.com");

    expect(chain.merge).toHaveBeenCalledWith(["email"]);
  });

  it("requests all columns via RETURNING *", async () => {
    const mockKnex = buildMockKnex([fakeUser]);
    const chain = mockKnex("users");
    mockGetDb.mockReturnValue(mockKnex);

    await upsertUser("us-east-1_TEST:sub-001", "test@example.com");

    expect(chain.returning).toHaveBeenCalledWith("*");
  });

  it("returns the upserted user row", async () => {
    const mockKnex = buildMockKnex([fakeUser]);
    mockGetDb.mockReturnValue(mockKnex);

    const result = await upsertUser("us-east-1_TEST:sub-001", "test@example.com");

    expect(result).toEqual(fakeUser);
  });

  it("propagates errors thrown by the database", async () => {
    const dbError = new Error("DB connection lost");
    const chain = {
      insert: jest.fn().mockReturnThis(),
      onConflict: jest.fn().mockReturnThis(),
      merge: jest.fn().mockReturnThis(),
      returning: jest.fn().mockRejectedValue(dbError),
    };
    const mockKnex = jest.fn().mockReturnValue(chain);
    mockGetDb.mockReturnValue(mockKnex);

    await expect(
      upsertUser("us-east-1_TEST:sub-001", "test@example.com")
    ).rejects.toThrow("DB connection lost");
  });
});

// ---------------------------------------------------------------------------
// updateUser
// ---------------------------------------------------------------------------

describe("updateUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildUpdateMockKnex(returning: IUser[]) {
    const chain = {
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue(returning),
    };
    return jest.fn().mockReturnValue(chain);
  }

  it("calls getDb to obtain the knex instance", async () => {
    const mockKnex = buildUpdateMockKnex([fakeUser]);
    mockGetDb.mockReturnValue(mockKnex);

    await updateUser(fakeUser.id, { display_name: "Alice" });

    expect(mockGetDb).toHaveBeenCalledTimes(1);
  });

  it("targets the 'users' table", async () => {
    const mockKnex = buildUpdateMockKnex([fakeUser]);
    mockGetDb.mockReturnValue(mockKnex);

    await updateUser(fakeUser.id, { display_name: "Alice" });

    expect(mockKnex).toHaveBeenCalledWith("users");
  });

  it("filters by user id", async () => {
    const mockKnex = buildUpdateMockKnex([fakeUser]);
    const chain = mockKnex("users");
    mockGetDb.mockReturnValue(mockKnex);

    await updateUser(fakeUser.id, { display_name: "Alice" });

    expect(chain.where).toHaveBeenCalledWith({ id: fakeUser.id });
  });

  it("calls update with the provided fields", async () => {
    const mockKnex = buildUpdateMockKnex([fakeUser]);
    const chain = mockKnex("users");
    mockGetDb.mockReturnValue(mockKnex);

    await updateUser(fakeUser.id, { display_name: "Alice", push_token: "tok123" });

    expect(chain.update).toHaveBeenCalledWith({ display_name: "Alice", push_token: "tok123" });
  });

  it("requests all columns via RETURNING *", async () => {
    const mockKnex = buildUpdateMockKnex([fakeUser]);
    const chain = mockKnex("users");
    mockGetDb.mockReturnValue(mockKnex);

    await updateUser(fakeUser.id, { display_name: "Alice" });

    expect(chain.returning).toHaveBeenCalledWith("*");
  });

  it("returns the updated user row", async () => {
    const updatedUser: IUser = { ...fakeUser, display_name: "Alice" };
    const mockKnex = buildUpdateMockKnex([updatedUser]);
    mockGetDb.mockReturnValue(mockKnex);

    const result = await updateUser(fakeUser.id, { display_name: "Alice" });

    expect(result).toEqual(updatedUser);
  });

  it("propagates errors thrown by the database", async () => {
    const dbError = new Error("DB connection lost");
    const chain = {
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      returning: jest.fn().mockRejectedValue(dbError),
    };
    const mockKnex = jest.fn().mockReturnValue(chain);
    mockGetDb.mockReturnValue(mockKnex);

    await expect(updateUser(fakeUser.id, { display_name: "Alice" })).rejects.toThrow(
      "DB connection lost"
    );
  });

  it("throws ApiError 404 when no user matches the id", async () => {
    const mockKnex = buildUpdateMockKnex([]);
    mockGetDb.mockReturnValue(mockKnex);

    await expect(updateUser("non-existent-id", { display_name: "Alice" })).rejects.toMatchObject({
      statusCode: 404,
      message: "User not found",
    });
  });
});

// ---------------------------------------------------------------------------
// deleteUser
// ---------------------------------------------------------------------------

describe("deleteUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildDeleteMockKnex(deleteCount: number) {
    const chain = {
      where: jest.fn().mockReturnThis(),
      delete: jest.fn().mockResolvedValue(deleteCount),
    };
    return jest.fn().mockReturnValue(chain);
  }

  it("calls getDb to obtain the knex instance", async () => {
    const mockKnex = buildDeleteMockKnex(1);
    mockGetDb.mockReturnValue(mockKnex);

    await deleteUser(fakeUser.id);

    expect(mockGetDb).toHaveBeenCalledTimes(1);
  });

  it("targets the 'users' table", async () => {
    const mockKnex = buildDeleteMockKnex(1);
    mockGetDb.mockReturnValue(mockKnex);

    await deleteUser(fakeUser.id);

    expect(mockKnex).toHaveBeenCalledWith("users");
  });

  it("filters by user id", async () => {
    const mockKnex = buildDeleteMockKnex(1);
    const chain = mockKnex("users");
    mockGetDb.mockReturnValue(mockKnex);

    await deleteUser(fakeUser.id);

    expect(chain.where).toHaveBeenCalledWith({ id: fakeUser.id });
  });

  it("resolves without a value on successful delete", async () => {
    const mockKnex = buildDeleteMockKnex(1);
    mockGetDb.mockReturnValue(mockKnex);

    await expect(deleteUser(fakeUser.id)).resolves.toBeUndefined();
  });

  it("throws ApiError 404 when no user matches the id", async () => {
    const mockKnex = buildDeleteMockKnex(0);
    mockGetDb.mockReturnValue(mockKnex);

    await expect(deleteUser("non-existent-id")).rejects.toMatchObject({
      statusCode: 404,
      message: "User not found",
    });
  });

  it("propagates errors thrown by the database", async () => {
    const dbError = new Error("DB connection lost");
    const chain = {
      where: jest.fn().mockReturnThis(),
      delete: jest.fn().mockRejectedValue(dbError),
    };
    const mockKnex = jest.fn().mockReturnValue(chain);
    mockGetDb.mockReturnValue(mockKnex);

    await expect(deleteUser(fakeUser.id)).rejects.toThrow("DB connection lost");
  });
});
