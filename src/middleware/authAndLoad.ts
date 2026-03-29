import { Request, Response, NextFunction } from "express";
import { requireAuth } from "./requireAuth";
import { upsertUser } from "../db/users";

export async function authAndLoad(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Run requireAuth and capture any error it passes to next.
  const authError = await new Promise<unknown>((resolve) => {
    requireAuth(req, res, resolve);
  });

  if (authError) {
    next(authError);
    return;
  }

  // req.cognitoUser is now set — upsert the user row and attach it.
  try {
    const cognitoUserId = req.cognitoUser!.sub as string;
    const email = (req.cognitoUser!.email as string) ?? "";
    req.dbUser = await upsertUser(cognitoUserId, email);
    next();
  } catch (err) {
    next(err);
  }
}
