import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { ApiError } from "../utils/ApiError";
import { getAppConfigValue } from "../aws/getAppConfig";

/**
 * Middleware that protects internal routes using a shared secret.
 *
 * The caller (CloudWatch scheduled event, cron Lambda, or gateway proxy) must
 * supply the secret in the `x-internal-key` request header.  The expected
 * value is read from the `INTERNAL_API_KEY` environment variable.
 *
 * Returns 401 if the header is missing or the key is invalid.
 * Returns 500 if the environment variable is not configured.
 */
export function protectedRoute(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  return (async () => {
    const expectedKey = await getAppConfigValue("INTERNAL_API_KEY", {
      required: true,
    });

    if (!expectedKey) {
      next(new ApiError(500, "Internal API key is not configured"));
      return;
    }

    const rawHeader = req.headers["x-internal-key"];
    const providedKey = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!providedKey) {
      next(new ApiError(401, "Unauthorized"));
      return;
    }

    let keysMatch = false;
    try {
      keysMatch = timingSafeEqual(
        Buffer.from(providedKey),
        Buffer.from(expectedKey)
      );
    } catch {
      // timingSafeEqual throws if the buffers have different lengths — treat as mismatch
      keysMatch = false;
    }

    if (!keysMatch) {
      next(new ApiError(401, "Unauthorized"));
      return;
    }

    next();
  })().catch(() => {
    next(new ApiError(500, "Internal API key is not configured"));
  });
}

