import request from "supertest";
import express from "express";

// ---------------------------------------------------------------------------
// Mocks — jest.mock is hoisted so factories must use inline jest.fn() only.
// __esModule: true is required for default-export modules with esModuleInterop.
// ---------------------------------------------------------------------------

jest.mock("../src/db/db", () => ({
  getDb: jest.fn(),
}));

jest.mock("../src/db/health", () => ({
  __esModule: true,
  default: {
    getDBConnectionHealth: jest.fn(),
  },
}));

// Import after mocks are in place.
import healthRouter from "../src/routers/healthRouter";
import { getDb } from "../src/db/db";
import health from "../src/db/health";

const mockGetDb = getDb as jest.Mock;
const mockGetDBConnectionHealth = health.getDBConnectionHealth as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use("/health", healthRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /health", () => {
  const fakeDb = {} as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDb.mockReturnValue(fakeDb);
  });

  it("returns 200 with ok status when DB is healthy", async () => {
    mockGetDBConnectionHealth.mockResolvedValue({
      connected: true,
      connectionUsesProxy: false,
    });

    const res = await request(buildApp()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      error: false,
      health: { connected: true, connectionUsesProxy: false },
    });
  });

  it("passes verbose=true to getDBConnectionHealth when query param is set", async () => {
    mockGetDBConnectionHealth.mockResolvedValue({
      connected: true,
      connectionUsesProxy: false,
      logs: { messages: ["Database connection successful"], timestamp: "t" },
    });

    const res = await request(buildApp()).get("/health?verbose=true");

    expect(res.status).toBe(200);
    expect(mockGetDBConnectionHealth).toHaveBeenCalledWith(fakeDb, true);
  });

  it("passes verbose=false when query param is absent", async () => {
    mockGetDBConnectionHealth.mockResolvedValue({
      connected: true,
      connectionUsesProxy: false,
    });

    await request(buildApp()).get("/health");

    expect(mockGetDBConnectionHealth).toHaveBeenCalledWith(fakeDb, false);
  });

  it("returns 500 with error status when DB check throws", async () => {
    mockGetDBConnectionHealth.mockRejectedValue(
      new Error("connection refused")
    );

    const res = await request(buildApp()).get("/health");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      status: "error",
      error: true,
      errorMsg: "connection refused",
    });
  });

  it("returns 500 when getDb throws (DB not initialized)", async () => {
    mockGetDb.mockImplementation(() => {
      throw new Error("Database has not been initialized. Call initDb() first.");
    });

    const res = await request(buildApp()).get("/health");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe(true);
    expect(res.body.errorMsg).toMatch(/not been initialized/);
  });

  it(
    "returns 500 with timeout error when DB check exceeds 3 seconds",
    async () => {
      mockGetDBConnectionHealth.mockReturnValue(
        new Promise<never>(() => {
          // Never resolves — simulates a hanging DB query.
        })
      );

      const res = await request(buildApp()).get("/health");

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        status: "error",
        error: true,
        errorMsg: "DB health check timed out",
      });
    },
    10000 // Allow up to 10 s so the 3-second guard has time to fire.
  );
});
