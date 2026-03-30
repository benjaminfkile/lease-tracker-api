import { upsertSubscription, UpsertSubscriptionData } from "../src/db/subscriptions";
import { getDb } from "../src/db/db";
import { ISubscription } from "../src/interfaces";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("../src/db/db", () => ({
  getDb: jest.fn(),
}));

const mockGetDb = getDb as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeUserId = "00000000-0000-0000-0000-000000000001";

const fakeSubscription: ISubscription = {
  id: "00000000-0000-0000-0000-000000000002",
  user_id: fakeUserId,
  platform: "apple",
  product_id: "com.example.app.premium.monthly",
  transaction_id: "TX001",
  original_transaction_id: "ORIG001",
  purchase_token: null,
  is_active: true,
  expires_at: new Date("2027-01-01T00:00:00Z"),
  environment: "production",
  raw_receipt: "base64receipt",
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

const activeData: UpsertSubscriptionData = {
  platform: "apple",
  product_id: "com.example.app.premium.monthly",
  transaction_id: "TX001",
  original_transaction_id: "ORIG001",
  is_active: true,
  expires_at: new Date("2027-01-01T00:00:00Z"),
  environment: "production",
  raw_receipt: "base64receipt",
};

const expiredData: UpsertSubscriptionData = {
  ...activeData,
  is_active: false,
  expires_at: new Date("2020-01-01T00:00:00Z"),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a mock knex instance that supports the query patterns used by
 * upsertSubscription:
 *   db("subscriptions").where({...}).first()
 *   db("subscriptions").insert({...}).returning("*")
 *   db("subscriptions").where({...}).update({...}).returning("*")
 *   db("users").where({...}).update({...})
 */
function buildMockDb(existingSubscription: ISubscription | undefined = undefined) {
  const subFirst = jest.fn().mockResolvedValue(existingSubscription);
  const subInsertReturning = jest.fn().mockResolvedValue([fakeSubscription]);
  const subInsert = jest.fn().mockReturnValue({ returning: subInsertReturning });
  const subUpdateReturning = jest.fn().mockResolvedValue([fakeSubscription]);
  const subUpdate = jest.fn().mockReturnValue({ returning: subUpdateReturning });

  const subChain = {
    where: jest.fn().mockReturnThis(),
    first: subFirst,
    insert: subInsert,
    update: subUpdate,
  };

  const userUpdate = jest.fn().mockResolvedValue(1);
  const userChain = {
    where: jest.fn().mockReturnThis(),
    update: userUpdate,
  };

  const mockDb = jest.fn().mockImplementation((table: string) => {
    if (table === "subscriptions") return subChain;
    if (table === "users") return userChain;
    return {};
  });

  return { mockDb, subChain, userUpdate };
}

// ---------------------------------------------------------------------------
// upsertSubscription — tier update behaviour
// ---------------------------------------------------------------------------

describe("upsertSubscription — tier update", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("active receipt (is_active = true) → tier updated to premium", () => {
    it("updates the user's subscription_tier to 'premium'", async () => {
      const { mockDb, userUpdate } = buildMockDb();
      mockGetDb.mockReturnValue(mockDb);

      await upsertSubscription(fakeUserId, activeData);

      expect(userUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ subscription_tier: "premium" })
      );
    });

    it("updates the user's subscription_expires_at to the receipt's expiry date", async () => {
      const { mockDb, userUpdate } = buildMockDb();
      mockGetDb.mockReturnValue(mockDb);

      await upsertSubscription(fakeUserId, activeData);

      expect(userUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ subscription_expires_at: activeData.expires_at })
      );
    });

    it("stores the subscription record with is_active = true", async () => {
      const { mockDb, subChain } = buildMockDb();
      mockGetDb.mockReturnValue(mockDb);

      await upsertSubscription(fakeUserId, activeData);

      expect(subChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: true })
      );
    });

    it("returns the upserted subscription record", async () => {
      const { mockDb } = buildMockDb();
      mockGetDb.mockReturnValue(mockDb);

      const result = await upsertSubscription(fakeUserId, activeData);

      expect(result).toEqual(fakeSubscription);
    });
  });

  describe("expired receipt (is_active = false) → tier stays free", () => {
    it("does not update the user's subscription_tier", async () => {
      const { mockDb, userUpdate } = buildMockDb();
      mockGetDb.mockReturnValue(mockDb);

      await upsertSubscription(fakeUserId, expiredData);

      expect(userUpdate).not.toHaveBeenCalled();
    });

    it("does not call db('users').update at all", async () => {
      const { mockDb, userUpdate } = buildMockDb();
      mockGetDb.mockReturnValue(mockDb);

      await upsertSubscription(fakeUserId, expiredData);

      expect(userUpdate).not.toHaveBeenCalled();
    });

    it("stores the subscription record with is_active = false", async () => {
      const { mockDb, subChain } = buildMockDb();
      mockGetDb.mockReturnValue(mockDb);

      await upsertSubscription(fakeUserId, expiredData);

      expect(subChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: false })
      );
    });

    it("still returns the upserted subscription record", async () => {
      const { mockDb } = buildMockDb();
      mockGetDb.mockReturnValue(mockDb);

      const result = await upsertSubscription(fakeUserId, expiredData);

      expect(result).toEqual(fakeSubscription);
    });
  });

  describe("update path (subscription already exists)", () => {
    it("updates the existing record rather than inserting", async () => {
      const { mockDb, subChain } = buildMockDb(fakeSubscription);
      mockGetDb.mockReturnValue(mockDb);

      await upsertSubscription(fakeUserId, activeData);

      expect(subChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ product_id: activeData.product_id })
      );
      expect(subChain.insert).not.toHaveBeenCalled();
    });

    it("updates tier to premium for active existing subscription", async () => {
      const { mockDb, userUpdate } = buildMockDb(fakeSubscription);
      mockGetDb.mockReturnValue(mockDb);

      await upsertSubscription(fakeUserId, activeData);

      expect(userUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ subscription_tier: "premium" })
      );
    });

    it("does not update tier for expired existing subscription", async () => {
      const { mockDb, userUpdate } = buildMockDb(fakeSubscription);
      mockGetDb.mockReturnValue(mockDb);

      await upsertSubscription(fakeUserId, expiredData);

      expect(userUpdate).not.toHaveBeenCalled();
    });
  });
});
