import { Request, Response, NextFunction } from "express";
import cognitoVerifier from "../auth/cognitoVerifier";
import { ApiError } from "../utils/ApiError";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next(new ApiError(401, "Unauthorized"));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const claims = await cognitoVerifier.verify(token);
    req.cognitoUser = claims as Record<string, unknown>;
    next();
  } catch (err) {
    if (err instanceof Error && err.name === "JwtExpiredError") {
      next(new ApiError(403, "Token expired"));
      return;
    }
    next(new ApiError(401, "Unauthorized"));
  }
}
