import express, { NextFunction, Request, Response } from "express";
import { authAndLoad } from "../middleware/authAndLoad";
import { validate } from "../middleware/validate";
import { UpdateUserSchema, UpdateUserInput } from "../validation/schemas";
import { updateUser } from "../db/users";

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

/**
 * PUT /api/users/me
 * Updates the authenticated user's display_name and/or push_token.
 * Unknown fields are ignored (stripped by Zod validation).
 */
usersRouter.put(
  "/me",
  authAndLoad,
  validate(UpdateUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updates = req.body as UpdateUserInput;

      if (Object.keys(updates).length === 0) {
        const { id, email, display_name, subscription_tier, subscription_expires_at } =
          req.dbUser!;
        res.status(200).json({ id, email, display_name, subscription_tier, subscription_expires_at });
        return;
      }

      const updated = await updateUser(req.dbUser!.id, updates);
      const { id, email, display_name, subscription_tier, subscription_expires_at } = updated;

      res.status(200).json({ id, email, display_name, subscription_tier, subscription_expires_at });
    } catch (err) {
      next(err);
    }
  }
);

export default usersRouter;
