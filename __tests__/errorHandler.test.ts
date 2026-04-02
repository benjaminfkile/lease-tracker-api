import request from "supertest";
import express, { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ApiError } from "../src/utils/ApiError";
import { errorHandler } from "../src/middleware/errorHandler";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp(
  throwFn: (req: Request, res: Response, next: NextFunction) => void
) {
  const app = express();
  app.use(express.json());
  app.get("/test", throwFn);
  app.use(errorHandler);
  return app;
}

function makePgError(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

// ---------------------------------------------------------------------------
// errorHandler middleware
// ---------------------------------------------------------------------------

describe("errorHandler middleware", () => {
  describe("ApiError handling", () => {
    it("responds with the ApiError statusCode", async () => {
      const app = buildApp((_req, _res, next) => {
        next(new ApiError(404, "Not Found"));
      });
      const res = await request(app).get("/test");
      expect(res.status).toBe(404);
    });

    it("responds with error: true", async () => {
      const app = buildApp((_req, _res, next) => {
        next(new ApiError(400, "Bad Request"));
      });
      const res = await request(app).get("/test");
      expect(res.body.error).toBe(true);
    });

    it("includes the ApiError message", async () => {
      const app = buildApp((_req, _res, next) => {
        next(new ApiError(422, "Unprocessable Entity"));
      });
      const res = await request(app).get("/test");
      expect(res.body.message).toBe("Unprocessable Entity");
    });

    it("includes details when provided", async () => {
      const details = [{ field: "email", issue: "invalid" }];
      const app = buildApp((_req, _res, next) => {
        next(new ApiError(400, "Validation failed", details));
      });
      const res = await request(app).get("/test");
      expect(res.body.details).toEqual(details);
    });

    it("does not include details key when details is undefined", async () => {
      const app = buildApp((_req, _res, next) => {
        next(new ApiError(400, "Bad Request"));
      });
      const res = await request(app).get("/test");
      expect(res.body).not.toHaveProperty("details");
    });

    it("handles common 4xx status codes", async () => {
      for (const code of [400, 401, 403, 404, 409, 422]) {
        const app = buildApp((_req, _res, next) => {
          next(new ApiError(code, "error"));
        });
        const res = await request(app).get("/test");
        expect(res.status).toBe(code);
      }
    });
  });

  describe("ZodError handling", () => {
    it("responds with 400", async () => {
      const schema = z.object({ name: z.string() });
      const app = buildApp((_req, _res, next) => {
        try {
          schema.parse({ name: 123 });
        } catch (err) {
          next(err);
        }
      });
      const res = await request(app).get("/test");
      expect(res.status).toBe(400);
    });

    it("responds with error: true", async () => {
      const schema = z.object({ name: z.string() });
      const app = buildApp((_req, _res, next) => {
        try {
          schema.parse({});
        } catch (err) {
          next(err);
        }
      });
      const res = await request(app).get("/test");
      expect(res.body.error).toBe(true);
    });

    it("sets message to 'Validation error'", async () => {
      const schema = z.object({ age: z.number() });
      const app = buildApp((_req, _res, next) => {
        try {
          schema.parse({ age: "not-a-number" });
        } catch (err) {
          next(err);
        }
      });
      const res = await request(app).get("/test");
      expect(res.body.message).toBe("Validation error");
    });

    it("includes structured details with path and message", async () => {
      const schema = z.object({ email: z.string().email() });
      const app = buildApp((_req, _res, next) => {
        try {
          schema.parse({ email: "invalid" });
        } catch (err) {
          next(err);
        }
      });
      const res = await request(app).get("/test");
      expect(Array.isArray(res.body.details)).toBe(true);
      expect(res.body.details.length).toBeGreaterThan(0);
      res.body.details.forEach(
        (detail: { path: (string | number)[]; message: string }) => {
          expect(detail).toHaveProperty("path");
          expect(detail).toHaveProperty("message");
        }
      );
    });
  });

  describe("Knex/pg constraint violation handling", () => {
    it("responds with 409 for unique constraint violation (code 23505)", async () => {
      const pgError = makePgError("duplicate key", "23505");
      const app = buildApp((_req, _res, next) => {
        next(pgError);
      });
      const res = await request(app).get("/test");
      expect(res.status).toBe(409);
    });

    it("responds with error: true for constraint violation", async () => {
      const pgError = makePgError("duplicate key", "23505");
      const app = buildApp((_req, _res, next) => {
        next(pgError);
      });
      const res = await request(app).get("/test");
      expect(res.body.error).toBe(true);
    });

    it("responds with message 'Conflict' for constraint violation", async () => {
      const pgError = makePgError("duplicate key", "23505");
      const app = buildApp((_req, _res, next) => {
        next(pgError);
      });
      const res = await request(app).get("/test");
      expect(res.body.message).toBe("Conflict");
    });

    it("does not respond with 409 for non-constraint pg error codes", async () => {
      const pgError = makePgError("connection error", "08006");
      const app = buildApp((_req, _res, next) => {
        next(pgError);
      });
      const res = await request(app).get("/test");
      expect(res.status).toBe(500);
    });
  });

  describe("unknown error handling", () => {
    const originalIsLocal = process.env.IS_LOCAL;

    afterEach(() => {
      if (originalIsLocal === undefined) {
        delete process.env.IS_LOCAL;
      } else {
        process.env.IS_LOCAL = originalIsLocal;
      }
    });

    it("responds with 500 for unknown errors", async () => {
      const app = buildApp((_req, _res, next) => {
        next(new Error("Something went wrong"));
      });
      const res = await request(app).get("/test");
      expect(res.status).toBe(500);
    });

    it("responds with error: true for unknown errors", async () => {
      const app = buildApp((_req, _res, next) => {
        next(new Error("Something went wrong"));
      });
      const res = await request(app).get("/test");
      expect(res.body.error).toBe(true);
    });

    it("does not leak stack trace in production (IS_LOCAL not set)", async () => {
      const app = buildApp((_req, _res, next) => {
        next(new Error("secret internal details"));
      });
      const res = await request(app).get("/test");
      expect(res.body.message).toBe("Internal Server Error");
      expect(JSON.stringify(res.body)).not.toContain("secret internal details");
    });

    it("includes error message in local environment", async () => {
      const app = buildApp((_req, _res, next) => {
        next(new Error("local debug info"));
      });
      app.set("secrets", { NODE_ENV: "local" });
      const res = await request(app).get("/test");
      expect(res.body.message).toBe("local debug info");
    });

    it("returns 'Internal Server Error' for non-Error unknowns in production", async () => {
      const app = buildApp((_req, _res, next) => {
        next("a plain string error");
      });
      const res = await request(app).get("/test");
      expect(res.status).toBe(500);
      expect(res.body.message).toBe("Internal Server Error");
    });
  });

  describe("headers already sent", () => {
    it("calls next without responding when headers are already sent", async () => {
      let capturedNext: NextFunction | undefined;
      const app = express();
      app.get("/test", (req: Request, res: Response, next: NextFunction) => {
        res.write("partial");
        capturedNext = next;
        // Don't call next here — we'll call it after headers are sent
        res.end();
        // Simulate calling errorHandler after headers are sent
        const mockReq = req;
        const mockRes = res;
        const mockNext = jest.fn();
        errorHandler(new Error("late error"), mockReq, mockRes, mockNext);
        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      });
      await request(app).get("/test");
    });
  });
});
