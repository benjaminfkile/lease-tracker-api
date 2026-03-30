import { ISubscription } from "../interfaces";
import { getDb } from "./db";

export interface SubscriptionStatus {
  is_active: boolean;
  expires_at: Date | null;
  product_id: string | null;
  platform: string | null;
}

export interface UpsertSubscriptionData {
  platform: string;
  product_id: string;
  transaction_id?: string | null;
  purchase_token?: string | null;
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
        transaction_id: data.transaction_id ?? null,
        purchase_token: data.purchase_token ?? null,
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

/**
 * Returns the most recent subscription for the user, re-checking expiry
 * against the database's NOW() so stale is_active flags are not trusted.
 * Returns a status object with is_active=false when no subscription exists.
 */
export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const db = getDb();

  type StatusRow = {
    product_id: string;
    platform: string;
    is_active: boolean;
    expires_at: Date | null;
    effective_is_active: boolean;
  };

  const row = await db("subscriptions")
    .where({ user_id: userId })
    .select<StatusRow[]>([
      "product_id",
      "platform",
      "is_active",
      "expires_at",
      db.raw("is_active AND (expires_at IS NULL OR expires_at > NOW()) AS effective_is_active"),
    ])
    .orderBy("updated_at", "desc")
    .first<StatusRow | undefined>();

  if (!row) {
    return { is_active: false, expires_at: null, product_id: null, platform: null };
  }

  return {
    is_active: row.effective_is_active,
    expires_at: row.expires_at,
    product_id: row.product_id,
    platform: row.platform,
  };
}
