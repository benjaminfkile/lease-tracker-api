import { IUser } from "../interfaces";
import { UpdateUserInput } from "../validation/schemas";
import { ApiError } from "../utils/ApiError";
import { getDb } from "./db";

export async function upsertUser(
  cognitoUserId: string,
  email: string
): Promise<IUser> {
  const [user] = await getDb()<IUser>("users")
    .insert({ cognito_user_id: cognitoUserId, email })
    .onConflict("cognito_user_id")
    .merge(["email"])
    .returning("*");

  return user;
}

export async function updateUser(
  userId: string,
  updates: UpdateUserInput
): Promise<IUser> {
  const [user] = await getDb()<IUser>("users")
    .where({ id: userId })
    .update(updates)
    .returning("*");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return user;
}

export async function getUserByEmail(email: string): Promise<IUser | undefined> {
  return getDb()<IUser>("users").where({ email }).first();
}

export async function deleteUser(userId: string): Promise<void> {
  const count = await getDb()<IUser>("users").where({ id: userId }).delete();

  if (count === 0) {
    throw new ApiError(404, "User not found");
  }
}
