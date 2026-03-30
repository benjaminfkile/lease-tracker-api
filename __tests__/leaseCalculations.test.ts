import { computeBuybackAnalysis, computeLeaseEndOptions, computeLeaseSummary, computeMileageHistory, daysBetween } from "../src/utils/leaseCalculations";
import { ILease, IOdometerReading } from "../src/interfaces";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildLease(overrides: Partial<ILease> = {}): ILease {
  return {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    user_id: "00000000-0000-0000-0000-000000000001",
    display_name: "Test Lease",
    make: "Tesla",
    model: "Model 3",
    year: 2024,
    trim: null,
    color: null,
    vin: null,
    license_plate: null,
    lease_start_date: "2024-01-01",
    lease_end_date: "2027-01-01",
    total_miles_allowed: 36000,
    miles_per_year: 12000,
    starting_odometer: 0,
    current_odometer: 5000,
    overage_cost_per_mile: "0.25",
    monthly_payment: null,
    dealer_name: null,
    dealer_phone: null,
    contract_number: null,
    notes: null,
    is_active: true,
    created_at: new Date("2024-01-01T00:00:00Z"),
    updated_at: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// daysBetween
// ---------------------------------------------------------------------------

describe("daysBetween", () => {
  it("returns 0 for the same date", () => {
    expect(daysBetween("2024-01-01", "2024-01-01")).toBe(0);
  });

  it("returns 1 for consecutive days", () => {
    expect(daysBetween("2024-01-01", "2024-01-02")).toBe(1);
  });

  it("returns a negative value when to < from", () => {
    expect(daysBetween("2024-01-10", "2024-01-01")).toBe(-9);
  });

  it("counts a full year correctly (non-leap year)", () => {
    expect(daysBetween("2023-01-01", "2024-01-01")).toBe(365);
  });

  it("counts a full leap year correctly", () => {
    expect(daysBetween("2024-01-01", "2025-01-01")).toBe(366);
  });
});

// ---------------------------------------------------------------------------
// computeLeaseSummary — basic fields
// ---------------------------------------------------------------------------

describe("computeLeaseSummary", () => {
  // Lease: 2024-01-01 → 2027-01-01 (1096 days), 36 000 mi allowed
  // Today: 2025-01-01 → 365 days elapsed, 731 days remaining
  // current_odometer = 5 000, starting = 0 → miles_driven = 5 000

  const lease = buildLease();
  const TODAY = "2025-01-01";
  const summary = computeLeaseSummary(lease, 500, "free", TODAY);

  it("calculates miles_driven correctly", () => {
    expect(summary.miles_driven).toBe(5000);
  });

  it("calculates miles_remaining correctly", () => {
    // 36000 - 5000 - 500 (reserved) = 30500
    expect(summary.miles_remaining).toBe(30500);
  });

  it("calculates days_elapsed correctly", () => {
    // 2024-01-01 → 2025-01-01 = 366 days (leap year)
    expect(summary.days_elapsed).toBe(366);
  });

  it("calculates days_remaining correctly", () => {
    // 2025-01-01 → 2027-01-01 = 730 days
    expect(summary.days_remaining).toBe(730);
  });

  it("calculates lease_length_days correctly", () => {
    // 2024-01-01 → 2027-01-01 = 1096 days
    expect(summary.lease_length_days).toBe(1096);
  });

  it("calculates expected_miles_to_date correctly", () => {
    // (36000 / 1096) * 366 ≈ 12021.168...
    const expected = (36000 / 1096) * 366;
    expect(summary.expected_miles_to_date).toBeCloseTo(expected, 2);
  });

  it("calculates current_pace_per_month correctly", () => {
    // (5000 / 366) * 30.44 ≈ 415.57...
    const expected = (5000 / 366) * 30.44;
    expect(summary.current_pace_per_month).toBeCloseTo(expected, 2);
  });

  it("calculates miles_over_under_pace correctly", () => {
    const expectedMiles = (36000 / 1096) * 366;
    expect(summary.miles_over_under_pace).toBeCloseTo(5000 - expectedMiles, 2);
  });

  it("calculates projected_miles_at_end correctly", () => {
    // (5000 / 366) * 1096 ≈ 14972.67...
    const expected = (5000 / 366) * 1096;
    expect(summary.projected_miles_at_end).toBeCloseTo(expected, 2);
  });

  it("calculates projected_overage = 0 when under total_miles_allowed", () => {
    expect(summary.projected_overage).toBe(0);
  });

  it("calculates projected_overage_cost = 0 when no overage", () => {
    expect(summary.projected_overage_cost).toBe(0);
  });

  it("calculates recommended_daily_miles correctly", () => {
    // miles_remaining = 30500, days_remaining = 730
    expect(summary.recommended_daily_miles).toBeCloseTo(30500 / 730, 2);
  });

  it("reflects reserved_trip_miles in the output", () => {
    expect(summary.reserved_trip_miles).toBe(500);
  });

  it("sets is_premium = false for free tier", () => {
    expect(summary.is_premium).toBe(false);
  });

  it("sets is_premium = true for premium tier", () => {
    const s = computeLeaseSummary(lease, 0, "premium", TODAY);
    expect(s.is_premium).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pace_status
// ---------------------------------------------------------------------------

describe("computeLeaseSummary — pace_status", () => {
  // Lease: 36 000 mi over 1096 days
  // pace_threshold = 36000 * 0.01 = 360 miles

  it("returns 'on_track' when driven exactly at expected pace", () => {
    // days_elapsed = 366, expected = (36000/1096)*366 ≈ 12021
    // Set current_odometer so miles_driven ≈ expected_miles_to_date
    const expected = (36000 / 1096) * 366;
    const lease = buildLease({ current_odometer: Math.round(expected) });
    const s = computeLeaseSummary(lease, 0, "free", "2025-01-01");
    expect(s.pace_status).toBe("on_track");
  });

  it("returns 'ahead' when significantly over pace", () => {
    // Drive a lot more than expected (20 000 vs ~12 021)
    const lease = buildLease({ current_odometer: 20000 });
    const s = computeLeaseSummary(lease, 0, "free", "2025-01-01");
    expect(s.pace_status).toBe("ahead");
  });

  it("returns 'behind' when significantly under pace", () => {
    // Drive much less than expected (500 vs ~12 021)
    const lease = buildLease({ current_odometer: 500 });
    const s = computeLeaseSummary(lease, 0, "free", "2025-01-01");
    expect(s.pace_status).toBe("behind");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("computeLeaseSummary — edge cases", () => {
  it("treats null current_odometer as starting_odometer (miles_driven = 0)", () => {
    const lease = buildLease({ current_odometer: null });
    const s = computeLeaseSummary(lease, 0, "free", "2025-01-01");
    expect(s.miles_driven).toBe(0);
  });

  it("returns current_pace_per_month = 0 when days_elapsed = 0", () => {
    const lease = buildLease({ lease_start_date: "2024-01-01" });
    const s = computeLeaseSummary(lease, 0, "free", "2024-01-01");
    expect(s.current_pace_per_month).toBe(0);
  });

  it("returns projected_miles_at_end = 0 when days_elapsed = 0", () => {
    const lease = buildLease({ lease_start_date: "2024-01-01" });
    const s = computeLeaseSummary(lease, 0, "free", "2024-01-01");
    expect(s.projected_miles_at_end).toBe(0);
  });

  it("returns recommended_daily_miles = 0 when days_remaining = 0 (lease ended)", () => {
    const lease = buildLease({ lease_end_date: "2025-01-01" });
    const s = computeLeaseSummary(lease, 0, "free", "2025-01-01");
    expect(s.recommended_daily_miles).toBe(0);
  });

  it("calculates projected_overage when projected to exceed allowance", () => {
    // Driven 20 000 in 366 days of 1096 day lease → projected ≈ 59 891 > 36 000
    const lease = buildLease({ current_odometer: 20000 });
    const s = computeLeaseSummary(lease, 0, "free", "2025-01-01");
    expect(s.projected_overage).toBeGreaterThan(0);
    expect(s.projected_overage_cost).toBeCloseTo(s.projected_overage * 0.25, 2);
  });

  it("uses overage_cost_per_mile when calculating projected_overage_cost", () => {
    const lease = buildLease({
      current_odometer: 20000,
      overage_cost_per_mile: "0.30",
    });
    const s = computeLeaseSummary(lease, 0, "free", "2025-01-01");
    expect(s.projected_overage_cost).toBeCloseTo(s.projected_overage * 0.3, 2);
  });
});

// ---------------------------------------------------------------------------
// computeLeaseSummary — pace calculation
// ---------------------------------------------------------------------------

describe("computeLeaseSummary — pace calculation", () => {
  // Lease: 2024-01-01 → 2027-01-01 (1096 days), 36 000 mi allowed, starting_odometer = 0

  it("first day: pace_status = 'on_track' and current_pace_per_month = 0 when no miles driven yet", () => {
    // days_elapsed = 0, miles_driven = 0 → miles_over_under_pace = 0 (within threshold)
    const lease = buildLease({ current_odometer: 0 });
    const s = computeLeaseSummary(lease, 0, "free", "2024-01-01");
    expect(s.days_elapsed).toBe(0);
    expect(s.miles_driven).toBe(0);
    expect(s.current_pace_per_month).toBe(0);
    expect(s.pace_status).toBe("on_track");
  });

  it("mid-lease: pace values are computed correctly at the halfway point", () => {
    // Today ≈ 2025-07-02 — 548 days into a 1096-day lease
    // current_odometer = 18 000 (roughly on pace for 36 000 over 1096 days)
    const lease = buildLease({ current_odometer: 18000 });
    const TODAY = "2025-07-02";
    const s = computeLeaseSummary(lease, 0, "free", TODAY);
    expect(s.days_elapsed).toBeGreaterThan(0);
    expect(s.days_remaining).toBeGreaterThan(0);
    expect(s.current_pace_per_month).toBeCloseTo((18000 / s.days_elapsed) * 30.44, 2);
    expect(s.projected_miles_at_end).toBeCloseTo((18000 / s.days_elapsed) * 1096, 2);
  });

  it("over limit: miles_driven > total_miles_allowed gives negative miles_remaining and 'ahead' pace", () => {
    // Drive 40 000 in a 36 000-mile lease — already over the cap
    const lease = buildLease({ current_odometer: 40000 });
    const s = computeLeaseSummary(lease, 0, "free", "2025-01-01");
    expect(s.miles_driven).toBe(40000);
    expect(s.miles_remaining).toBe(-4000); // 36000 - 40000 - 0
    expect(s.pace_status).toBe("ahead");
    expect(s.projected_overage).toBeGreaterThan(0);
  });

  it("no readings: current_pace_per_month = 0 and pace_status = 'behind' when current_odometer is null", () => {
    // null odometer → miles_driven = 0; after 366 days expected ≈ 12 021 mi → far behind
    const lease = buildLease({ current_odometer: null });
    const s = computeLeaseSummary(lease, 0, "free", "2025-01-01");
    expect(s.miles_driven).toBe(0);
    expect(s.current_pace_per_month).toBe(0);
    expect(s.pace_status).toBe("behind");
  });
});

// ---------------------------------------------------------------------------
// computeLeaseSummary — projected overage rounding
// ---------------------------------------------------------------------------

describe("computeLeaseSummary — projected overage rounding", () => {
  it("projected_overage is never negative even when projected miles are well under the allowance", () => {
    // Only 1 000 mi driven in 366 days → projected ≈ 2 737 mi, far below 36 000
    const lease = buildLease({ current_odometer: 1000 });
    const s = computeLeaseSummary(lease, 0, "free", "2025-01-01");
    expect(s.projected_overage).toBe(0);
    expect(s.projected_overage_cost).toBe(0);
  });

  it("projected_overage is exactly 0 when projected miles equal total_miles_allowed", () => {
    // On the last day of the lease, having driven exactly total_miles_allowed:
    // projected = (36000 / 1096) * 1096 = 36000 → overage = 0
    const lease = buildLease({
      current_odometer: 36000,
      lease_end_date: "2027-01-01",
    });
    const s = computeLeaseSummary(lease, 0, "free", "2027-01-01");
    expect(s.projected_overage).toBe(0);
  });

  it("projected_overage carries fractional miles without integer rounding", () => {
    // Drive 25 000 mi in 366 days of 1096-day lease
    // projected = (25000 / 366) * 1096 ≈ 74836.6..., overage ≈ 38836.6...
    const lease = buildLease({ current_odometer: 25000 });
    const s = computeLeaseSummary(lease, 0, "free", "2025-01-01");
    const expectedProjected = (25000 / 366) * 1096;
    const expectedOverage = expectedProjected - 36000;
    expect(s.projected_overage).toBeCloseTo(expectedOverage, 4);
    // Verify the fractional portion was preserved, not truncated
    expect(s.projected_overage % 1).not.toBe(0);
  });

  it("projected_overage_cost equals projected_overage × overage_cost_per_mile (fractional)", () => {
    const lease = buildLease({ current_odometer: 25000, overage_cost_per_mile: "0.25" });
    const s = computeLeaseSummary(lease, 0, "free", "2025-01-01");
    expect(s.projected_overage_cost).toBeCloseTo(s.projected_overage * 0.25, 5);
  });
});

// ---------------------------------------------------------------------------
// computeLeaseSummary — miles_remaining and reserved trip miles
// ---------------------------------------------------------------------------

describe("computeLeaseSummary — miles_remaining reserved trip miles", () => {
  it("miles_remaining equals total_miles_allowed minus miles_driven when reserved = 0", () => {
    const lease = buildLease({ current_odometer: 5000 });
    const s = computeLeaseSummary(lease, 0, "free", "2025-01-01");
    expect(s.miles_remaining).toBe(31000); // 36000 - 5000 - 0
    expect(s.reserved_trip_miles).toBe(0);
  });

  it("miles_remaining is reduced by reserved trip miles", () => {
    const lease = buildLease({ current_odometer: 5000 });
    const s = computeLeaseSummary(lease, 1000, "free", "2025-01-01");
    expect(s.miles_remaining).toBe(30000); // 36000 - 5000 - 1000
    expect(s.reserved_trip_miles).toBe(1000);
  });

  it("miles_remaining can be negative when reserved trip miles exceed the remaining allowance", () => {
    // 35 000 mi driven leaves 1 000 mi, but 2 000 mi are reserved → −1 000
    const lease = buildLease({ current_odometer: 35000 });
    const s = computeLeaseSummary(lease, 2000, "free", "2025-01-01");
    expect(s.miles_remaining).toBe(-1000); // 36000 - 35000 - 2000
    expect(s.reserved_trip_miles).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// computeLeaseSummary — recommended_daily_miles
// ---------------------------------------------------------------------------

describe("computeLeaseSummary — recommended_daily_miles", () => {
  it("returns 0 when today is past lease_end_date (days_remaining is negative)", () => {
    // Lease ended 2024-06-01; today is 2025-01-01 → days_remaining < 0
    const lease = buildLease({ lease_end_date: "2024-06-01" });
    const s = computeLeaseSummary(lease, 0, "free", "2025-01-01");
    expect(s.days_remaining).toBeLessThan(0);
    expect(s.recommended_daily_miles).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeBuybackAnalysis
// ---------------------------------------------------------------------------

describe("computeBuybackAnalysis", () => {
  it("returns on_track recommendation when projected_overage is 0", () => {
    const result = computeBuybackAnalysis(0, 0.25, 0.15);
    expect(result.recommendation).toBe("on_track");
  });

  it("returns buy_now when dealer_buyback_rate < overage_cost_per_mile and overage > 0", () => {
    const result = computeBuybackAnalysis(1000, 0.25, 0.15);
    expect(result.recommendation).toBe("buy_now");
  });

  it("returns pay_at_end when dealer_buyback_rate >= overage_cost_per_mile and overage > 0", () => {
    const result = computeBuybackAnalysis(1000, 0.25, 0.30);
    expect(result.recommendation).toBe("pay_at_end");
  });

  it("returns pay_at_end when dealer_buyback_rate equals overage_cost_per_mile and overage > 0", () => {
    const result = computeBuybackAnalysis(1000, 0.25, 0.25);
    expect(result.recommendation).toBe("pay_at_end");
  });

  it("calculates cost_if_paying_at_turnin correctly", () => {
    const result = computeBuybackAnalysis(1000, 0.25, 0.15);
    expect(result.cost_if_paying_at_turnin).toBeCloseTo(250, 2);
  });

  it("calculates cost_if_buying_now correctly", () => {
    const result = computeBuybackAnalysis(1000, 0.25, 0.15);
    expect(result.cost_if_buying_now).toBeCloseTo(150, 2);
  });

  it("calculates savings correctly when buy_now is cheaper", () => {
    const result = computeBuybackAnalysis(1000, 0.25, 0.15);
    expect(result.savings).toBeCloseTo(100, 2);
  });

  it("calculates negative savings when pay_at_end is cheaper", () => {
    const result = computeBuybackAnalysis(1000, 0.25, 0.30);
    expect(result.savings).toBeCloseTo(-50, 2);
  });

  it("returns zero costs and savings when projected_overage_miles is 0", () => {
    const result = computeBuybackAnalysis(0, 0.25, 0.15);
    expect(result.projected_overage_miles).toBe(0);
    expect(result.cost_if_paying_at_turnin).toBe(0);
    expect(result.cost_if_buying_now).toBe(0);
    expect(result.savings).toBe(0);
  });

  it("reflects projected_overage_miles in the output", () => {
    const result = computeBuybackAnalysis(500, 0.25, 0.15);
    expect(result.projected_overage_miles).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// computeLeaseEndOptions
// ---------------------------------------------------------------------------

describe("computeLeaseEndOptions", () => {
  // Helper values
  // return_cost   = 1000 * 0.25 = 250
  // buyout_cost   = 15000
  // roll_cost     = (304.4 / 30.44) * 500 = 10 * 500 = 5000
  const DAYS_REMAINING = 304.4; // exactly 10 months
  const NEW_MONTHLY = 500;

  it("calculates return_cost as projected_overage * overage_cost_per_mile", () => {
    const result = computeLeaseEndOptions(1000, 0.25, 15000, DAYS_REMAINING, NEW_MONTHLY);
    expect(result.return_cost).toBeCloseTo(250, 2);
  });

  it("calculates buyout_cost as the supplied residual_value", () => {
    const result = computeLeaseEndOptions(1000, 0.25, 15000, DAYS_REMAINING, NEW_MONTHLY);
    expect(result.buyout_cost).toBe(15000);
  });

  it("calculates roll_cost as (days_remaining / 30.44) * new_monthly_payment", () => {
    const result = computeLeaseEndOptions(1000, 0.25, 15000, DAYS_REMAINING, NEW_MONTHLY);
    const expectedRollCost = (DAYS_REMAINING / 30.44) * NEW_MONTHLY;
    expect(result.roll_cost).toBeCloseTo(expectedRollCost, 2);
  });

  it("recommends 'return' when return_cost is the lowest", () => {
    // return=250, buyout=15000, roll=5000
    const result = computeLeaseEndOptions(1000, 0.25, 15000, DAYS_REMAINING, NEW_MONTHLY);
    expect(result.recommendation).toBe("return");
  });

  it("recommends 'buyout' when buyout_cost is lowest", () => {
    // return=2500, buyout=100, roll=5000
    const result = computeLeaseEndOptions(10000, 0.25, 100, DAYS_REMAINING, NEW_MONTHLY);
    expect(result.recommendation).toBe("buyout");
  });

  it("recommends 'roll' when roll_cost is lowest", () => {
    // return=25000, buyout=20000, roll=500 (1 day remaining)
    const result = computeLeaseEndOptions(100000, 0.25, 20000, DAYS_REMAINING, 50);
    // roll_cost = (304.4 / 30.44) * 50 ≈ 500, buyout=20000, return=25000
    expect(result.recommendation).toBe("roll");
  });

  it("returns 'return' when return_cost equals buyout_cost and both are lowest", () => {
    // return=0, buyout=0, roll=500 → return wins (equals buyout, but return checked first)
    const result = computeLeaseEndOptions(0, 0.25, 0, DAYS_REMAINING, NEW_MONTHLY);
    expect(result.recommendation).toBe("return");
  });

  it("returns zero return_cost when projected_overage is 0", () => {
    const result = computeLeaseEndOptions(0, 0.25, 15000, DAYS_REMAINING, NEW_MONTHLY);
    expect(result.return_cost).toBe(0);
  });

  it("returns zero roll_cost when days_remaining is 0", () => {
    const result = computeLeaseEndOptions(1000, 0.25, 15000, 0, NEW_MONTHLY);
    expect(result.roll_cost).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeMileageHistory
// ---------------------------------------------------------------------------

describe("computeMileageHistory", () => {
  function buildReadings(
    data: Array<{ reading_date: string; odometer: number }>
  ): IOdometerReading[] {
    return data.map((d, i) => ({
      id: `reading-${i}`,
      lease_id: "aaaaaaaa-0000-0000-0000-000000000001",
      user_id: "00000000-0000-0000-0000-000000000001",
      odometer: d.odometer,
      reading_date: d.reading_date,
      notes: null,
      source: "manual",
      created_at: new Date("2024-01-15T00:00:00Z"),
    }));
  }

  // Base lease: 2024-01-01 → 2025-01-01, 12 000 mi/yr, starting_odometer = 0
  const lease = buildLease({
    lease_start_date: "2024-01-01",
    lease_end_date: "2025-01-01",
    miles_per_year: 12000,
    starting_odometer: 0,
    current_odometer: 0,
  });

  it("returns an empty array when today is before lease_start_date", () => {
    const result = computeMileageHistory(lease, [], "2023-12-31");
    expect(result).toHaveLength(0);
  });

  it("returns one entry for the start month when today is within the first month", () => {
    const result = computeMileageHistory(lease, [], "2024-01-15");
    expect(result).toHaveLength(1);
    expect(result[0].month).toBe("2024-01");
  });

  it("includes all months from start through the current month", () => {
    const result = computeMileageHistory(lease, [], "2024-03-15");
    expect(result).toHaveLength(3);
    expect(result[0].month).toBe("2024-01");
    expect(result[1].month).toBe("2024-02");
    expect(result[2].month).toBe("2024-03");
  });

  it("caps at lease_end_date month when today is after lease_end_date", () => {
    // Months 2024-01 through 2025-01 = 13 entries
    const result = computeMileageHistory(lease, [], "2025-06-01");
    expect(result).toHaveLength(13);
    expect(result[result.length - 1].month).toBe("2025-01");
  });

  it("sets expected_miles to miles_per_year / 12 for every entry", () => {
    const result = computeMileageHistory(lease, [], "2024-03-01");
    result.forEach((entry) => {
      expect(entry.expected_miles).toBeCloseTo(1000, 5);
    });
  });

  it("returns miles_driven = 0 for a month with no readings", () => {
    const result = computeMileageHistory(lease, [], "2024-01-31");
    expect(result[0].miles_driven).toBe(0);
  });

  it("computes miles_driven correctly for a month with one reading", () => {
    const readings = buildReadings([
      { reading_date: "2024-01-15", odometer: 500 },
    ]);
    const result = computeMileageHistory(lease, readings, "2024-01-31");
    expect(result[0].miles_driven).toBe(500);
  });

  it("computes miles_driven correctly across two consecutive months", () => {
    const readings = buildReadings([
      { reading_date: "2024-01-31", odometer: 1000 },
      { reading_date: "2024-02-28", odometer: 2200 },
    ]);
    const result = computeMileageHistory(lease, readings, "2024-02-28");
    expect(result[0].miles_driven).toBe(1000);
    expect(result[1].miles_driven).toBe(1200);
  });

  it("uses the last reading in a month when multiple readings exist in that month", () => {
    const readings = buildReadings([
      { reading_date: "2024-01-10", odometer: 300 },
      { reading_date: "2024-01-25", odometer: 800 },
    ]);
    const result = computeMileageHistory(lease, readings, "2024-01-31");
    expect(result[0].miles_driven).toBe(800);
  });

  it("uses starting_odometer as baseline for the first month with no prior reading", () => {
    const l = buildLease({ starting_odometer: 10000, current_odometer: 10000 });
    const readings = buildReadings([
      { reading_date: "2024-01-15", odometer: 10500 },
    ]);
    const result = computeMileageHistory(l, readings, "2024-01-31");
    expect(result[0].miles_driven).toBe(500);
  });

  it("returns miles_driven = 0 for a month with no readings when a prior reading exists", () => {
    const readings = buildReadings([
      { reading_date: "2024-01-31", odometer: 1000 },
    ]);
    const result = computeMileageHistory(lease, readings, "2024-02-28");
    expect(result[0].miles_driven).toBe(1000);
    expect(result[1].miles_driven).toBe(0);
  });

  it("clamps miles_driven to 0 and never returns a negative value", () => {
    const l = buildLease({ starting_odometer: 1000, current_odometer: 1000 });
    // Odometer lower than starting_odometer (invalid data, but must not crash)
    const readings = buildReadings([
      { reading_date: "2024-01-15", odometer: 500 },
    ]);
    const result = computeMileageHistory(l, readings, "2024-01-31");
    expect(result[0].miles_driven).toBe(0);
  });

  it("returns entries with all three required fields", () => {
    const result = computeMileageHistory(lease, [], "2024-01-31");
    expect(result[0]).toHaveProperty("month");
    expect(result[0]).toHaveProperty("miles_driven");
    expect(result[0]).toHaveProperty("expected_miles");
  });
});
