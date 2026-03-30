import { ISubscription } from "../interfaces";
import { getDb } from "./db";

export interface UpsertSubscriptionData {
  platform: string;
  product_id: string;
  transaction_id: string;
  is_active: boolean;
  expires_at: Date;
  environment: string;
  raw_receipt: string;
}

/**
 * Upserts a subscription record for a user+platform pair and updates the
 * user's subscription_tier to "premium" and subscription_expires_at.
 */
export async function upsertSubscription(
  userId: string,
  data: UpsertSubscriptionData
): Promise<ISubscription> {
  const db = getDb();

  const existing = await db<ISubscription>("subscriptions")
    .where({ user_id: userId, platform: data.platform })
    .first();

  let subscription: ISubscription;

  if (existing) {
    [subscription] = await db<ISubscription>("subscriptions")
      .where({ id: existing.id })
      .update({
        product_id: data.product_id,
        transaction_id: data.transaction_id,
        is_active: data.is_active,
        expires_at: data.expires_at,
        environment: data.environment,
        raw_receipt: data.raw_receipt,
      })
      .returning("*");
  } else {
    [subscription] = await db<ISubscription>("subscriptions")
      .insert({ user_id: userId, ...data })
      .returning("*");
  }

  // Keep users table in sync
  await db("users").where({ id: userId }).update({
    subscription_tier: "premium",
    subscription_expires_at: data.expires_at,
  });

  return subscription;
}
