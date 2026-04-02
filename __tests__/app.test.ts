import request from "supertest";
import app from "../src/app";

jest.mock("../src/auth/cognitoVerifier", () => ({
  __esModule: true,
  default: { verify: jest.fn() },
}));

jest.mock("../src/db/db", () => ({
  getDb: jest.fn().mockReturnValue({}),
}));

jest.mock("../src/db/health", () => ({
  __esModule: true,
  default: {
    getDBConnectionHealth: jest.fn().mockResolvedValue({
      connected: true,
      connectionUsesProxy: false,
    }),
  },
}));

describe("api basic routes", () => {
  it("GET / responds", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toBe("api");
  });

  it("GET /api/health responds with 200", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
  });

});

