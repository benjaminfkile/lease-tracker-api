import express, { Request, Response } from "express";
import { authAndLoad } from "../middleware/authAndLoad";

const usersRouter = express.Router();

/**
 * GET /api/users/me
 * Returns the authenticated user's profile, upserting on first request.
 */
usersRouter.get("/me", authAndLoad, (req: Request, res: Response) => {
  const { id, email, display_name, subscription_tier, subscription_expires_at } =
    req.dbUser!;

  res.status(200).json({
    id,
    email,
    display_name,
    subscription_tier,
    subscription_expires_at,
  });
});

export default usersRouter;
