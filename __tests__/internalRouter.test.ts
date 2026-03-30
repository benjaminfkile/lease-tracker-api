import request from "supertest";
import express from "express";
import { errorHandler } from "../src/middleware/errorHandler";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the router being tested.
// ---------------------------------------------------------------------------

jest.mock("../src/jobs/alertEvaluator", () => ({
  runAlertEvaluator: jest.fn(),
}));

jest.mock("../src/db/db", () => ({
  getDb: jest.fn().mockReturnValue({}),
}));

import { runAlertEvaluator } from "../src/jobs/alertEvaluator";
import internalRouter from "../src/routers/internalRouter";

const mockRunAlertEvaluator = runAlertEvaluator as jest.Mock;

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/internal", internalRouter);
  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/internal/trigger-alerts", () => {
  const VALID_KEY = "test-internal-secret";

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INTERNAL_API_KEY = VALID_KEY;
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_KEY;
  });

  it("returns 200 and { ok: true } when the correct key is provided", async () => {
    mockRunAlertEvaluator.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post("/api/internal/trigger-alerts")
      .set("x-internal-key", VALID_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockRunAlertEvaluator).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when the x-internal-key header is missing", async () => {
    const res = await request(buildApp()).post(
      "/api/internal/trigger-alerts"
    );

    expect(res.status).toBe(401);
    expect(mockRunAlertEvaluator).not.toHaveBeenCalled();
  });

  it("returns 401 when an incorrect key is provided", async () => {
    const res = await request(buildApp())
      .post("/api/internal/trigger-alerts")
      .set("x-internal-key", "wrong-key");

    expect(res.status).toBe(401);
    expect(mockRunAlertEvaluator).not.toHaveBeenCalled();
  });

  it("returns 500 when INTERNAL_API_KEY env var is not set", async () => {
    delete process.env.INTERNAL_API_KEY;

    const res = await request(buildApp())
      .post("/api/internal/trigger-alerts")
      .set("x-internal-key", VALID_KEY);

    expect(res.status).toBe(500);
    expect(mockRunAlertEvaluator).not.toHaveBeenCalled();
  });

  it("propagates errors thrown by runAlertEvaluator as 500", async () => {
    mockRunAlertEvaluator.mockRejectedValue(new Error("DB connection failed"));

    const res = await request(buildApp())
      .post("/api/internal/trigger-alerts")
      .set("x-internal-key", VALID_KEY);

    expect(res.status).toBe(500);
  });
});
