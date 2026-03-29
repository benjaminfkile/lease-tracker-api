import request from "supertest";
import app from "../src/app";

describe("api basic routes", () => {
  it("GET / responds", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toBe("api");
  });

  it("GET /api/health responds with 200", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.text).toBe(":)");
  });
});
