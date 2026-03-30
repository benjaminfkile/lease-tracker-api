import request from "supertest";
import express from "express";
import { IUser } from "../src/interfaces";
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

jest.mock("../src/services/appleReceipt", () => ({
  verifyAppleReceipt: jest.fn(),
}));

jest.mock("../src/services/googlePlayVerify", () => ({
  verifyGooglePurchase: jest.fn(),
}));

jest.mock("../src/db/subscriptions", () => ({
  upsertSubscription: jest.fn(),
  getSubscriptionStatus: jest.fn(),
}));

// Import after mocks are in place.
import cognitoVerifier from "../src/auth/cognitoVerifier";
import { upsertUser } from "../src/db/users";
import { verifyAppleReceipt } from "../src/services/appleReceipt";
import { verifyGooglePurchase } from "../src/services/googlePlayVerify";
import { upsertSubscription, getSubscriptionStatus } from "../src/db/subscriptions";
import subscriptionsRouter from "../src/routers/subscriptionsRouter";

const mockVerify = cognitoVerifier.verify as jest.Mock;
const mockUpsertUser = upsertUser as jest.Mock;
const mockVerifyAppleReceipt = verifyAppleReceipt as jest.Mock;
const mockVerifyGooglePurchase = verifyGooglePurchase as jest.Mock;
const mockUpsertSubscription = upsertSubscription as jest.Mock;
const mockGetSubscriptionStatus = getSubscriptionStatus as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/subscriptions", subscriptionsRouter);
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

const fakeAppleResult = {
  is_active: true,
  expires_at: new Date("2027-01-01T00:00:00Z"),
  product_id: "com.example.app.premium.monthly",
  transaction_id: "1000000123456789",
  environment: "production" as const,
  raw_receipt: "base64encodedreceipt",
};

const fakeGoogleResult = {
  is_active: true,
  expires_at: new Date("2027-06-01T00:00:00Z"),
  product_id: "com.example.app.premium.monthly",
  purchase_token: "google-purchase-token-abc123",
  order_id: "GPA.1234-5678-9012-34567",
  environment: "production" as const,
  raw_receipt: JSON.stringify({ kind: "androidpublisher#subscriptionPurchase", expiryTimeMillis: "1780272000000" }),
};

// ---------------------------------------------------------------------------
// POST /api/subscriptions/apple/verify
// ---------------------------------------------------------------------------

describe("POST /api/subscriptions/apple/verify", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp())
      .post("/api/subscriptions/apple/verify")
      .send({ receipt_data: "base64receipt", product_id: "com.example.premium" });

    expect(res.status).toBe(401);
  });

  it("returns 401 when token is invalid", async () => {
    mockVerify.mockRejectedValueOnce(new Error("Invalid signature"));

    const res = await request(buildApp())
      .post("/api/subscriptions/apple/verify")
      .set("Authorization", "Bearer bad.token")
      .send({ receipt_data: "base64receipt", product_id: "com.example.premium" });

    expect(res.status).toBe(401);
  });

  it("returns 403 when token is expired", async () => {
    const expiredError = Object.assign(new Error("Token is expired"), {
      name: "JwtExpiredError",
    });
    mockVerify.mockRejectedValueOnce(expiredError);

    const res = await request(buildApp())
      .post("/api/subscriptions/apple/verify")
      .set("Authorization", "Bearer expired.token")
      .send({ receipt_data: "base64receipt", product_id: "com.example.premium" });

    expect(res.status).toBe(403);
  });

  it("returns 400 when receipt_data is missing", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);

    const res = await request(buildApp())
      .post("/api/subscriptions/apple/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ product_id: "com.example.premium" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when receipt_data is an empty string", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);

    const res = await request(buildApp())
      .post("/api/subscriptions/apple/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ receipt_data: "", product_id: "com.example.premium" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when product_id is missing", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);

    const res = await request(buildApp())
      .post("/api/subscriptions/apple/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ receipt_data: "base64receipt" });

    expect(res.status).toBe(400);
  });

  it("returns 200 with is_active, expires_at and product_id on success", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockVerifyAppleReceipt.mockResolvedValueOnce(fakeAppleResult);
    mockUpsertSubscription.mockResolvedValueOnce({});

    const res = await request(buildApp())
      .post("/api/subscriptions/apple/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ receipt_data: "base64receipt", product_id: "com.example.premium" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      is_active: true,
      expires_at: "2027-01-01T00:00:00.000Z",
      product_id: "com.example.app.premium.monthly",
    });
  });

  it("calls verifyAppleReceipt with the receipt_data from the request body", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockVerifyAppleReceipt.mockResolvedValueOnce(fakeAppleResult);
    mockUpsertSubscription.mockResolvedValueOnce({});

    await request(buildApp())
      .post("/api/subscriptions/apple/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ receipt_data: "my-base64-receipt", product_id: "com.example.premium" });

    expect(mockVerifyAppleReceipt).toHaveBeenCalledWith("my-base64-receipt");
  });

  it("calls upsertSubscription with correct data including platform=apple", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockVerifyAppleReceipt.mockResolvedValueOnce(fakeAppleResult);
    mockUpsertSubscription.mockResolvedValueOnce({});

    await request(buildApp())
      .post("/api/subscriptions/apple/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ receipt_data: "my-base64-receipt", product_id: "com.example.premium" });

    expect(mockUpsertSubscription).toHaveBeenCalledWith(fakeUser.id, {
      platform: "apple",
      product_id: fakeAppleResult.product_id,
      transaction_id: fakeAppleResult.transaction_id,
      is_active: fakeAppleResult.is_active,
      expires_at: fakeAppleResult.expires_at,
      environment: fakeAppleResult.environment,
      raw_receipt: fakeAppleResult.raw_receipt,
    });
  });

  it("returns 400 when verifyAppleReceipt throws an ApiError", async () => {
    const { ApiError } = jest.requireActual("../src/utils/ApiError") as typeof import("../src/utils/ApiError");
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockVerifyAppleReceipt.mockRejectedValueOnce(
      new ApiError(400, "Apple receipt verification failed", { apple_status: 21003 })
    );

    const res = await request(buildApp())
      .post("/api/subscriptions/apple/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ receipt_data: "bad-receipt", product_id: "com.example.premium" });

    expect(res.status).toBe(400);
  });

  it("returns 500 when upsertSubscription throws", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockVerifyAppleReceipt.mockResolvedValueOnce(fakeAppleResult);
    mockUpsertSubscription.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .post("/api/subscriptions/apple/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ receipt_data: "base64receipt", product_id: "com.example.premium" });

    expect(res.status).toBe(500);
  });

  it("returns 200 and is_active=false when subscription is expired", async () => {
    const expiredResult = {
      ...fakeAppleResult,
      is_active: false,
      expires_at: new Date("2020-01-01T00:00:00Z"),
    };

    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockVerifyAppleReceipt.mockResolvedValueOnce(expiredResult);
    mockUpsertSubscription.mockResolvedValueOnce({});

    const res = await request(buildApp())
      .post("/api/subscriptions/apple/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ receipt_data: "base64receipt", product_id: "com.example.premium" });

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
    expect(res.body.expires_at).toBe("2020-01-01T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// POST /api/subscriptions/google/verify
// ---------------------------------------------------------------------------

describe("POST /api/subscriptions/google/verify", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, GOOGLE_PLAY_PACKAGE_NAME: "com.example.app" };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp())
      .post("/api/subscriptions/google/verify")
      .send({ purchase_token: "token-abc", product_id: "com.example.premium" });

    expect(res.status).toBe(401);
  });

  it("returns 401 when token is invalid", async () => {
    mockVerify.mockRejectedValueOnce(new Error("Invalid signature"));

    const res = await request(buildApp())
      .post("/api/subscriptions/google/verify")
      .set("Authorization", "Bearer bad.token")
      .send({ purchase_token: "token-abc", product_id: "com.example.premium" });

    expect(res.status).toBe(401);
  });

  it("returns 403 when token is expired", async () => {
    const expiredError = Object.assign(new Error("Token is expired"), {
      name: "JwtExpiredError",
    });
    mockVerify.mockRejectedValueOnce(expiredError);

    const res = await request(buildApp())
      .post("/api/subscriptions/google/verify")
      .set("Authorization", "Bearer expired.token")
      .send({ purchase_token: "token-abc", product_id: "com.example.premium" });

    expect(res.status).toBe(403);
  });

  it("returns 400 when purchase_token is missing", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);

    const res = await request(buildApp())
      .post("/api/subscriptions/google/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ product_id: "com.example.premium" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when product_id is missing", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);

    const res = await request(buildApp())
      .post("/api/subscriptions/google/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ purchase_token: "token-abc" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when purchase_token is an empty string", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);

    const res = await request(buildApp())
      .post("/api/subscriptions/google/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ purchase_token: "", product_id: "com.example.premium" });

    expect(res.status).toBe(400);
  });

  it("returns 200 with is_active, expires_at and product_id on success", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockVerifyGooglePurchase.mockResolvedValueOnce(fakeGoogleResult);
    mockUpsertSubscription.mockResolvedValueOnce({});

    const res = await request(buildApp())
      .post("/api/subscriptions/google/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ purchase_token: "google-purchase-token-abc123", product_id: "com.example.app.premium.monthly" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      is_active: true,
      expires_at: "2027-06-01T00:00:00.000Z",
      product_id: "com.example.app.premium.monthly",
    });
  });

  it("calls verifyGooglePurchase with packageName, product_id and purchase_token", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockVerifyGooglePurchase.mockResolvedValueOnce(fakeGoogleResult);
    mockUpsertSubscription.mockResolvedValueOnce({});

    await request(buildApp())
      .post("/api/subscriptions/google/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ purchase_token: "my-purchase-token", product_id: "com.example.premium" });

    expect(mockVerifyGooglePurchase).toHaveBeenCalledWith(
      "com.example.app",
      "com.example.premium",
      "my-purchase-token"
    );
  });

  it("calls upsertSubscription with correct data including platform=google", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockVerifyGooglePurchase.mockResolvedValueOnce(fakeGoogleResult);
    mockUpsertSubscription.mockResolvedValueOnce({});

    await request(buildApp())
      .post("/api/subscriptions/google/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ purchase_token: "google-purchase-token-abc123", product_id: "com.example.app.premium.monthly" });

    expect(mockUpsertSubscription).toHaveBeenCalledWith(fakeUser.id, {
      platform: "google",
      product_id: fakeGoogleResult.product_id,
      transaction_id: fakeGoogleResult.order_id,
      purchase_token: fakeGoogleResult.purchase_token,
      is_active: fakeGoogleResult.is_active,
      expires_at: fakeGoogleResult.expires_at,
      environment: fakeGoogleResult.environment,
      raw_receipt: fakeGoogleResult.raw_receipt,
    });
  });

  it("returns 500 when GOOGLE_PLAY_PACKAGE_NAME is not set", async () => {
    delete process.env.GOOGLE_PLAY_PACKAGE_NAME;

    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);

    const res = await request(buildApp())
      .post("/api/subscriptions/google/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ purchase_token: "token-abc", product_id: "com.example.premium" });

    expect(res.status).toBe(500);
  });

  it("returns 400 when verifyGooglePurchase throws an ApiError", async () => {
    const { ApiError } = jest.requireActual("../src/utils/ApiError") as typeof import("../src/utils/ApiError");
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockVerifyGooglePurchase.mockRejectedValueOnce(
      new ApiError(400, "Purchase not found on Google Play")
    );

    const res = await request(buildApp())
      .post("/api/subscriptions/google/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ purchase_token: "bad-token", product_id: "com.example.premium" });

    expect(res.status).toBe(400);
  });

  it("returns 500 when upsertSubscription throws", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockVerifyGooglePurchase.mockResolvedValueOnce(fakeGoogleResult);
    mockUpsertSubscription.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .post("/api/subscriptions/google/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ purchase_token: "google-purchase-token-abc123", product_id: "com.example.app.premium.monthly" });

    expect(res.status).toBe(500);
  });

  it("returns 200 and is_active=false when subscription is expired", async () => {
    const expiredResult = {
      ...fakeGoogleResult,
      is_active: false,
      expires_at: new Date("2020-01-01T00:00:00Z"),
    };

    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockVerifyGooglePurchase.mockResolvedValueOnce(expiredResult);
    mockUpsertSubscription.mockResolvedValueOnce({});

    const res = await request(buildApp())
      .post("/api/subscriptions/google/verify")
      .set("Authorization", "Bearer valid.token")
      .send({ purchase_token: "google-purchase-token-abc123", product_id: "com.example.app.premium.monthly" });

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
    expect(res.body.expires_at).toBe("2020-01-01T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// GET /api/subscriptions/status
// ---------------------------------------------------------------------------

describe("GET /api/subscriptions/status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(buildApp()).get("/api/subscriptions/status");

    expect(res.status).toBe(401);
  });

  it("returns 401 when token is invalid", async () => {
    mockVerify.mockRejectedValueOnce(new Error("Invalid signature"));

    const res = await request(buildApp())
      .get("/api/subscriptions/status")
      .set("Authorization", "Bearer bad.token");

    expect(res.status).toBe(401);
  });

  it("returns 403 when token is expired", async () => {
    const expiredError = Object.assign(new Error("Token is expired"), {
      name: "JwtExpiredError",
    });
    mockVerify.mockRejectedValueOnce(expiredError);

    const res = await request(buildApp())
      .get("/api/subscriptions/status")
      .set("Authorization", "Bearer expired.token");

    expect(res.status).toBe(403);
  });

  it("returns 200 with is_active=false when user has no subscription", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockGetSubscriptionStatus.mockResolvedValueOnce({
      is_active: false,
      expires_at: null,
      product_id: null,
      platform: null,
    });

    const res = await request(buildApp())
      .get("/api/subscriptions/status")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      is_active: false,
      expires_at: null,
      product_id: null,
      platform: null,
    });
  });

  it("returns 200 with active subscription status", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockGetSubscriptionStatus.mockResolvedValueOnce({
      is_active: true,
      expires_at: new Date("2027-01-01T00:00:00Z"),
      product_id: "com.example.app.premium.monthly",
      platform: "apple",
    });

    const res = await request(buildApp())
      .get("/api/subscriptions/status")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      is_active: true,
      expires_at: "2027-01-01T00:00:00.000Z",
      product_id: "com.example.app.premium.monthly",
      platform: "apple",
    });
  });

  it("returns 200 with is_active=false when subscription is stale (expired but flag not updated)", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockGetSubscriptionStatus.mockResolvedValueOnce({
      is_active: false,
      expires_at: new Date("2020-01-01T00:00:00Z"),
      product_id: "com.example.app.premium.monthly",
      platform: "google",
    });

    const res = await request(buildApp())
      .get("/api/subscriptions/status")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
    expect(res.body.expires_at).toBe("2020-01-01T00:00:00.000Z");
    expect(res.body.platform).toBe("google");
  });

  it("calls getSubscriptionStatus with the authenticated user's id", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockGetSubscriptionStatus.mockResolvedValueOnce({
      is_active: false,
      expires_at: null,
      product_id: null,
      platform: null,
    });

    await request(buildApp())
      .get("/api/subscriptions/status")
      .set("Authorization", "Bearer valid.token");

    expect(mockGetSubscriptionStatus).toHaveBeenCalledWith(fakeUser.id);
  });

  it("returns 500 when getSubscriptionStatus throws", async () => {
    mockVerify.mockResolvedValueOnce({
      sub: fakeUser.cognito_user_id,
      email: fakeUser.email,
    });
    mockUpsertUser.mockResolvedValueOnce(fakeUser);
    mockGetSubscriptionStatus.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(buildApp())
      .get("/api/subscriptions/status")
      .set("Authorization", "Bearer valid.token");

    expect(res.status).toBe(500);
  });
});
