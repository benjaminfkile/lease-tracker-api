import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { validate } from "../src/middleware/validate";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockReqResNext(body: unknown): {
  req: Partial<Request>;
  res: Partial<Response>;
  next: jest.Mock;
  json: jest.Mock;
  status: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const req = { body } as Partial<Request>;
  const res = { status, json } as unknown as Partial<Response>;
  const next = jest.fn();
  return { req, res, next, json, status };
}

// ---------------------------------------------------------------------------
// validate middleware
// ---------------------------------------------------------------------------

describe("validate middleware", () => {
  const TestSchema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  it("calls next() when body is valid", () => {
    const { req, res, next } = mockReqResNext({ name: "Alice", age: 30 });
    validate(TestSchema)(req as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect((res as Response).status).not.toHaveBeenCalled();
  });

  it("replaces req.body with the parsed (safe) data on success", () => {
    const { req, res, next } = mockReqResNext({ name: "Alice", age: 30, extra: "ignored" });
    validate(TestSchema)(req as Request, res as Response, next as NextFunction);
    expect(req.body).not.toHaveProperty("extra");
    expect(req.body).toEqual({ name: "Alice", age: 30 });
  });

  it("returns 400 when body is invalid", () => {
    const { req, res, next, status } = mockReqResNext({ name: "", age: -1 });
    validate(TestSchema)(req as Request, res as Response, next as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
  });

  it("returns field-level error messages on failure", () => {
    const { req, res, next, status, json } = mockReqResNext({ name: "", age: -1 });
    validate(TestSchema)(req as Request, res as Response, next as NextFunction);
    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body).toHaveProperty("errors");
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
    body.errors.forEach((err: { path: (string | number)[]; message: string }) => {
      expect(err).toHaveProperty("path");
      expect(err).toHaveProperty("message");
      expect(typeof err.message).toBe("string");
    });
  });

  it("returns errors with correct path for each failing field", () => {
    const { req, res, next, status, json } = mockReqResNext({ age: -5 });
    validate(TestSchema)(req as Request, res as Response, next as NextFunction);
    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    const paths = body.errors.map((e: { path: (string | number)[] }) => e.path[0]);
    expect(paths).toContain("name");
    expect(paths).toContain("age");
  });

  it("returns 400 when body is missing entirely", () => {
    const { req, res, next, status } = mockReqResNext(undefined);
    validate(TestSchema)(req as Request, res as Response, next as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
  });

  it("does not call next() on validation failure", () => {
    const { req, res, next } = mockReqResNext({ name: 123, age: "not-a-number" });
    validate(TestSchema)(req as Request, res as Response, next as NextFunction);
    expect(next).not.toHaveBeenCalled();
  });

  it("works with nested schemas and reports nested paths", () => {
    const NestedSchema = z.object({
      user: z.object({
        email: z.string().email(),
      }),
    });
    const { req, res, next, status, json } = mockReqResNext({ user: { email: "not-an-email" } });
    validate(NestedSchema)(req as Request, res as Response, next as NextFunction);
    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body.errors[0].path).toEqual(["user", "email"]);
  });
});
