import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError";

interface PgError extends Error {
  code: string;
}

function isPgConstraintViolation(err: unknown): err is PgError {
  return (
    err instanceof Error &&
    "code" in err &&
    typeof (err as PgError).code === "string" &&
    (err as PgError).code === "23505"
  );
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: true,
      message: err.message,
      ...(err.details !== undefined && { details: err.details }),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: true,
      message: "Validation error",
      details: err.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
    return;
  }

  if (isPgConstraintViolation(err)) {
    res.status(409).json({
      error: true,
      message: "Conflict",
    });
    return;
  }

  const secrets = req.app.get("secrets") as { NODE_ENV?: string } | undefined;
  const isLocalEnv = secrets?.NODE_ENV === "local";
  const message = isLocalEnv && err instanceof Error ? err.message : "Internal Server Error";

  res.status(500).json({
    error: true,
    message,
  });
}
