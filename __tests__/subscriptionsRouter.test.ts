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

jest.mock("../src/db/subscriptions", () => ({
  upsertSubscription: jest.fn(),
}));

// Import after mocks are in place.
import cognitoVerifier from "../src/auth/cognitoVerifier";
import { upsertUser } from "../src/db/users";
import { verifyAppleReceipt } from "../src/services/appleReceipt";
import { upsertSubscription } from "../src/db/subscriptions";
import subscriptionsRouter from "../src/routers/subscriptionsRouter";

const mockVerify = cognitoVerifier.verify as jest.Mock;
const mockUpsertUser = upsertUser as jest.Mock;
const mockVerifyAppleReceipt = verifyAppleReceipt as jest.Mock;
const mockUpsertSubscription = upsertSubscription as jest.Mock;

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
