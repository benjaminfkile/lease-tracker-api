import { IBuybackAnalysis, ILease, ILeaseEndOptions, ILeaseSummary } from "../interfaces";

/**
 * Returns the number of whole days between two ISO date strings (YYYY-MM-DD).
 * A positive value means `to` is after `from`.
 */
export function daysBetween(from: string, to: string): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round(
    (new Date(to).getTime() - new Date(from).getTime()) / MS_PER_DAY
  );
}

/**
 * Computes the full lease summary analytics from a lease record, the total
 * reserved trip miles, the user's subscription tier, and an optional
 * reference date (defaults to today in UTC).
 *
 * All arithmetic is pure — no database calls are made here.
 */
export function computeLeaseSummary(
  lease: ILease,
  reservedTripMiles: number,
  subscriptionTier: string,
  today: string = new Date().toISOString().slice(0, 10)
): ILeaseSummary {
  const currentOdometer = lease.current_odometer ?? lease.starting_odometer;
  const overageCostPerMile = parseFloat(lease.overage_cost_per_mile);

  const miles_driven = currentOdometer - lease.starting_odometer;

  const miles_remaining =
    lease.total_miles_allowed - miles_driven - reservedTripMiles;

  const days_elapsed = daysBetween(lease.lease_start_date, today);
  const days_remaining = daysBetween(today, lease.lease_end_date);
  const lease_length_days = daysBetween(
    lease.lease_start_date,
    lease.lease_end_date
  );

  const expected_miles_to_date =
    lease_length_days > 0
      ? (lease.total_miles_allowed / lease_length_days) * days_elapsed
      : 0;

  const current_pace_per_month =
    days_elapsed > 0 ? (miles_driven / days_elapsed) * 30.44 : 0;

  const miles_over_under_pace = miles_driven - expected_miles_to_date;

  const projected_miles_at_end =
    days_elapsed > 0
      ? (miles_driven / days_elapsed) * lease_length_days
      : 0;

  const projected_overage = Math.max(
    0,
    projected_miles_at_end - lease.total_miles_allowed
  );

  const projected_overage_cost = projected_overage * overageCostPerMile;

  const recommended_daily_miles =
    days_remaining > 0 ? miles_remaining / days_remaining : 0;

  // on_track = within 1 % of total_miles_allowed of expected pace
  const pace_threshold = lease.total_miles_allowed * 0.01;
  let pace_status: "ahead" | "on_track" | "behind";
  if (miles_over_under_pace > pace_threshold) {
    pace_status = "ahead";
  } else if (miles_over_under_pace < -pace_threshold) {
    pace_status = "behind";
  } else {
    pace_status = "on_track";
  }

  const is_premium = subscriptionTier === "premium";

  return {
    miles_driven,
    miles_remaining,
    days_elapsed,
    days_remaining,
    lease_length_days,
    expected_miles_to_date,
    current_pace_per_month,
    pace_status,
    miles_over_under_pace,
    projected_miles_at_end,
    projected_overage,
    projected_overage_cost,
    recommended_daily_miles,
    reserved_trip_miles: reservedTripMiles,
    is_premium,
  };
}

/**
 * Computes a buyback analysis comparing the cost of paying overage miles at
 * lease turn-in versus purchasing those miles now at the dealer's buyback rate.
 *
 * All arithmetic is pure — no database calls are made here.
 */
export function computeBuybackAnalysis(
  projectedOverage: number,
  overageCostPerMile: number,
  dealerBuybackRate: number
): IBuybackAnalysis {
  const projected_overage_miles = projectedOverage;
  const cost_if_paying_at_turnin = projected_overage_miles * overageCostPerMile;
  const cost_if_buying_now = projected_overage_miles * dealerBuybackRate;

  let recommendation: "buy_now" | "pay_at_end" | "on_track";
  if (projected_overage_miles <= 0) {
    recommendation = "on_track";
  } else if (cost_if_buying_now < cost_if_paying_at_turnin) {
    recommendation = "buy_now";
  } else {
    recommendation = "pay_at_end";
  }

  const savings = cost_if_paying_at_turnin - cost_if_buying_now;

  return {
    projected_overage_miles,
    cost_if_paying_at_turnin,
    cost_if_buying_now,
    recommendation,
    savings,
  };
}

/**
 * Computes modeled costs for three lease-end scenarios:
 *   - return:  pay overage miles at the lease's per-mile rate
 *   - buyout:  purchase the vehicle at the user-supplied residual value
 *   - roll:    enter a new lease for the remaining months at a hypothetical payment
 *
 * Returns all three costs and a recommendation (scenario with the lowest cost).
 * All arithmetic is pure — no database calls are made here.
 */
export function computeLeaseEndOptions(
  projectedOverage: number,
  overageCostPerMile: number,
  residualValue: number,
  daysRemaining: number,
  newMonthlyPayment: number
): ILeaseEndOptions {
  const DAYS_PER_MONTH = 30.44;

  const return_cost = projectedOverage * overageCostPerMile;
  const buyout_cost = residualValue;
  const remainingMonths = daysRemaining / DAYS_PER_MONTH;
  const roll_cost = remainingMonths * newMonthlyPayment;

  let recommendation: "return" | "buyout" | "roll";
  if (return_cost <= buyout_cost && return_cost <= roll_cost) {
    recommendation = "return";
  } else if (buyout_cost <= roll_cost) {
    recommendation = "buyout";
  } else {
    recommendation = "roll";
  }

  return { return_cost, buyout_cost, roll_cost, recommendation };
}
