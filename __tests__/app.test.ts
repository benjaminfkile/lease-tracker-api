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
  });

  it("applies helmet security headers", async () => {
    const res = await request(app).get("/");
    expect(res.headers["x-dns-prefetch-control"]).toBeDefined();
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("production CORS config", () => {
  // Jest does not load dotenv, so IS_LOCAL is undefined and isLocal() returns
  // false — the production CORS branch is active for the imported app module.
  const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

  beforeEach(() => {
    process.env.ALLOWED_ORIGINS =
      "https://gateway.example.com,https://ec2.example.com";
  });

  afterEach(() => {
    if (originalAllowedOrigins === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
    }
  });

  it("allows a listed origin", async () => {
    const res = await request(app)
      .get("/")
      .set("Origin", "https://gateway.example.com");
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://gateway.example.com"
    );
  });

  it("does not allow an unlisted origin", async () => {
    const res = await request(app)
      .get("/")
      .set("Origin", "https://evil.example.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
