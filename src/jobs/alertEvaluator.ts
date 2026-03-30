import { Knex } from "knex";
import { ILease } from "../interfaces";
import { computeLeaseSummary } from "../utils/leaseCalculations";
import { send } from "../services/notificationService";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Returns true if an alert was already sent within the last 24 hours.
 */
function wasRecentlySent(lastSentAt: Date | null): boolean {
  if (!lastSentAt) return false;
  return Date.now() - new Date(lastSentAt).getTime() < TWENTY_FOUR_HOURS_MS;
}

/**
 * Fields selected from the alert_configs + leases + users join query.
 */
interface AlertEvalRow {
  alert_id: string;
  user_id: string;
  alert_type: string;
  threshold_value: number | null;
  last_sent_at: Date | null;
  push_token: string;
  subscription_tier: string;
  lease_id: string;
  display_name: string;
  total_miles_allowed: number;
  miles_per_year: number;
  starting_odometer: number;
  current_odometer: number | null;
  overage_cost_per_mile: string;
  lease_start_date: string;
  lease_end_date: string;
}

interface TripSumRow {
  lease_id: string;
  reserved_miles: string | number | null;
}

/**
 * Evaluates all enabled alert configs against active leases and sends push
 * notifications when conditions are met.  Designed as a pure function that
 * accepts a Knex instance so it can be unit-tested without a real database.
 */
export async function runAlertEvaluator(knex: Knex): Promise<void> {
  const rows: AlertEvalRow[] = await knex("alert_configs as ac")
    .join("leases as l", "l.id", "ac.lease_id")
    .join("users as u", "u.id", "ac.user_id")
    .where("ac.is_enabled", true)
    .where("l.is_active", true)
    .whereNotNull("u.push_token")
    .select(
      "ac.id as alert_id",
      "ac.user_id",
      "ac.alert_type",
      "ac.threshold_value",
      "ac.last_sent_at",
      "u.push_token",
      "u.subscription_tier",
      "l.id as lease_id",
      "l.display_name",
      "l.total_miles_allowed",
      "l.miles_per_year",
      "l.starting_odometer",
      "l.current_odometer",
      "l.overage_cost_per_mile",
      "l.lease_start_date",
      "l.lease_end_date"
    );

  if (rows.length === 0) return;

  // Fetch reserved trip miles (non-completed saved trips) grouped by lease.
  const leaseIds = [...new Set(rows.map((r) => r.lease_id))];

  const tripRows: TripSumRow[] = await knex("saved_trips")
    .whereIn("lease_id", leaseIds)
    .where("is_completed", false)
    .groupBy("lease_id")
    .select("lease_id")
    .sum("estimated_miles as reserved_miles");

  const reservedMilesMap: Record<string, number> = {};
  for (const t of tripRows) {
    reservedMilesMap[t.lease_id] = t.reserved_miles != null ? Number(t.reserved_miles) : 0;
  }

  // Cache lease summaries per lease_id — computed once regardless of how many
  // alert configs belong to the same lease.
  const summaryCache = new Map<string, ReturnType<typeof computeLeaseSummary>>();

  for (const row of rows) {
    if (wasRecentlySent(row.last_sent_at)) continue;

    if (!summaryCache.has(row.lease_id)) {
      const leaseLike = {
        current_odometer: row.current_odometer,
        starting_odometer: row.starting_odometer,
        total_miles_allowed: row.total_miles_allowed,
        overage_cost_per_mile: row.overage_cost_per_mile,
        lease_start_date: row.lease_start_date,
        lease_end_date: row.lease_end_date,
      } as ILease;

      summaryCache.set(
        row.lease_id,
        computeLeaseSummary(
          leaseLike,
          reservedMilesMap[row.lease_id] ?? 0,
          row.subscription_tier
        )
      );
    }

    const summary = summaryCache.get(row.lease_id)!;

    let shouldSend = false;
    let title = "";
    let body = "";

    switch (row.alert_type) {
      case "miles_threshold": {
        if (row.threshold_value == null) break;
        const pct = (summary.miles_driven / row.total_miles_allowed) * 100;
        if (pct >= row.threshold_value) {
          shouldSend = true;
          title = "Mileage Alert";
          body = `You've used ${Math.round(pct)}% of your allowed miles on your ${row.display_name} lease.`;
        }
        break;
      }

      case "over_pace": {
        // Per spec: fire when the driver is "behind" pace, meaning they have
        // driven fewer miles than expected to date and risk a mileage shortfall.
        if (summary.pace_status === "behind") {
          shouldSend = true;
          title = "Mileage Pace Alert";
          body = `Your ${row.display_name} lease is behind pace.`;
        }
        break;
      }

      case "days_remaining": {
        if (row.threshold_value == null) break;
        if (summary.days_remaining <= row.threshold_value) {
          shouldSend = true;
          title = "Lease Ending Soon";
          body = `Your ${row.display_name} lease has ${summary.days_remaining} days remaining.`;
        }
        break;
      }
    }

    if (!shouldSend) continue;

    await send(row.user_id, title, body, { lease_id: row.lease_id });

    await knex("alert_configs")
      .where({ id: row.alert_id })
      .update({ last_sent_at: new Date() });
  }
}
