import { ISubscription } from "../interfaces";
import { getDb } from "./db";
import { DecodedAppleNotification } from "../services/appleWebhook";

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
  original_transaction_id?: string | null;
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
        original_transaction_id: data.original_transaction_id ?? null,
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

// Notification types for which the subscription remains active
const ACTIVE_NOTIFICATION_TYPES = new Set([
  "SUBSCRIBED",
  "DID_RENEW",
  "DID_CHANGE_RENEWAL_PREF",
  "DID_CHANGE_RENEWAL_STATUS",
  "OFFER_REDEEMED",
]);

/**
 * Determines whether a given notification type+subtype indicates that the
 * subscription should still be considered active.
 *
 * DID_FAIL_TO_RENEW with subtype GRACE_PERIOD means the user is in a billing
 * retry window and still has access, so it counts as active.
 */
function isActiveNotification(notificationType: string, subtype?: string): boolean {
  if (notificationType === "DID_FAIL_TO_RENEW") {
    return subtype === "GRACE_PERIOD";
  }
  return ACTIVE_NOTIFICATION_TYPES.has(notificationType);
}

/**
 * Processes a decoded Apple App Store Server Notification and updates the
 * matching subscription record and the user's subscription tier.
 *
 * Looks up the subscription by `original_transaction_id`.  If no matching
 * record is found the notification is silently ignored (Apple may notify about
 * subscriptions created before this server recorded them).
 */
export async function handleAppleNotification(
  notification: DecodedAppleNotification
): Promise<void> {
  const txInfo = notification.transactionInfo;

  // Some notification types (e.g. CONSUMPTION_REQUEST, TEST) carry no
  // transaction info — nothing to update.
  if (!txInfo?.originalTransactionId) {
    return;
  }

  const { originalTransactionId, productId, expiresDate } = txInfo;
  const isActive = isActiveNotification(notification.notificationType, notification.subtype);
  const expiresAt = expiresDate != null ? new Date(expiresDate) : null;

  const db = getDb();

  const subscription = await db<ISubscription>("subscriptions")
    .where({ original_transaction_id: originalTransactionId, platform: "apple" })
    .first();

  if (!subscription) {
    return;
  }

  // Update subscription record
  await db("subscriptions")
    .where({ id: subscription.id })
    .update({
      is_active: isActive,
      ...(productId && { product_id: productId }),
      ...(expiresAt !== null && { expires_at: expiresAt }),
    });

  // Keep users table in sync
  if (isActive) {
    await db("users")
      .where({ id: subscription.user_id })
      .update({
        subscription_tier: "premium",
        ...(expiresAt !== null && { subscription_expires_at: expiresAt }),
      });
  } else {
    // Downgrade to free only if no other active subscription exists
    const otherActive = await db("subscriptions")
      .where({ user_id: subscription.user_id, is_active: true })
      .whereNot({ id: subscription.id })
      .count<{ count: string }>("id as count")
      .first();

    if (!otherActive || Number(otherActive.count) === 0) {
      await db("users").where({ id: subscription.user_id }).update({
        subscription_tier: "free",
      });
    }
  }
}

