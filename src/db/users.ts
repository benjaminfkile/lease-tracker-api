import { IUser } from "../interfaces";
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
