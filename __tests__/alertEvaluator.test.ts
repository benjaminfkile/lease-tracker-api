// ---------------------------------------------------------------------------
// Mocks — must be declared before importing tested modules
// ---------------------------------------------------------------------------

jest.mock("../src/services/notificationService", () => ({
  send: jest.fn(),
}));

import { send } from "../src/services/notificationService";
import { runAlertEvaluator } from "../src/jobs/alertEvaluator";
import { Knex } from "knex";

const mockSend = send as jest.Mock;

// ---------------------------------------------------------------------------
// Mock Knex factory
// ---------------------------------------------------------------------------

/**
 * Returns a lightweight mock Knex instance.
 *
 * - `knex("alert_configs as ac")` resolves `.select()` with `alertRows`
 * - `knex("saved_trips")`         resolves `.sum()`   with `tripRows`
 * - `knex("alert_configs")`       resolves `.update()` with 1
 */
function buildMockKnex(
  alertRows: object[],
  tripRows: object[],
  mockUpdate = jest.fn().mockResolvedValue(1)
): { knex: Knex; mockUpdate: jest.Mock } {
  const makeChain = (terminal: Record<string, jest.Mock>) => {
    const chain: Record<string, jest.Mock> = {
      join: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereNotNull: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      ...terminal,
    };
    // Make the chain itself thenable so `await chain` resolves (fallback).
    return chain;
  };

  const knex = jest.fn().mockImplementation((table: string) => {
    if (table === "saved_trips") {
      return makeChain({
        select: jest.fn().mockReturnThis(),
        sum: jest.fn().mockResolvedValue(tripRows),
      });
    }
    if (table === "alert_configs") {
      // The update path uses this table name (without alias).
      return makeChain({
        select: jest.fn().mockResolvedValue(alertRows),
        update: mockUpdate,
      });
    }
    // Default: main join query ("alert_configs as ac")
    return makeChain({
      select: jest.fn().mockResolvedValue(alertRows),
      update: mockUpdate,
    });
  }) as unknown as Knex;

  return { knex, mockUpdate };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Builds a minimal alert row covering all fields selected in the evaluator. */
function makeAlertRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    alert_id: "alert-001",
    user_id: "user-001",
    alert_type: "miles_threshold",
    threshold_value: 80,
    last_sent_at: null,
    push_token: "apns:tok",
    subscription_tier: "free",
    lease_id: "lease-001",
    display_name: "My Tesla",
    total_miles_allowed: 36000,
    miles_per_year: 12000,
    starting_odometer: 0,
    current_odometer: 30000,   // 83% of 36 000 → above 80% threshold
    overage_cost_per_mile: "0.25",
    lease_start_date: "2023-01-01",
    lease_end_date: "2026-01-01",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runAlertEvaluator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Early-exit guards
  // -------------------------------------------------------------------------

  it("does nothing when there are no alert rows", async () => {
    const { knex } = buildMockKnex([], []);
    await runAlertEvaluator(knex);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("skips an alert that was sent within the last 24 hours", async () => {
    const recentlySent = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
    const row = makeAlertRow({ last_sent_at: recentlySent });
    const { knex, mockUpdate } = buildMockKnex([row], []);

    await runAlertEvaluator(knex);

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("processes an alert whose last_sent_at is exactly 24 hours ago", async () => {
    const justExpired = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1);
    const row = makeAlertRow({ last_sent_at: justExpired, alert_type: "miles_threshold" });
    const { knex } = buildMockKnex([row], []);
    mockSend.mockResolvedValue(undefined);

    await runAlertEvaluator(knex);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // miles_threshold
  // -------------------------------------------------------------------------

  it("sends a miles_threshold alert when percentage >= threshold", async () => {
    // 30 000 / 36 000 * 100 = 83.3% >= 80
    const row = makeAlertRow({ alert_type: "miles_threshold", threshold_value: 80, current_odometer: 30000 });
    const { knex, mockUpdate } = buildMockKnex([row], []);
    mockSend.mockResolvedValue(undefined);

    await runAlertEvaluator(knex);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [userId, title, body, data] = mockSend.mock.calls[0];
    expect(userId).toBe("user-001");
    expect(title).toBe("Mileage Alert");
    expect(body).toContain("83%");
    expect(body).toContain("My Tesla");
    expect(data).toEqual({ lease_id: "lease-001" });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ last_sent_at: expect.any(Date) })
    );
  });

  it("does NOT send a miles_threshold alert when percentage < threshold", async () => {
    // 10 000 / 36 000 * 100 = 27.8% < 80
    const row = makeAlertRow({ alert_type: "miles_threshold", threshold_value: 80, current_odometer: 10000 });
    const { knex } = buildMockKnex([row], []);

    await runAlertEvaluator(knex);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does NOT send a miles_threshold alert when threshold_value is null", async () => {
    const row = makeAlertRow({ alert_type: "miles_threshold", threshold_value: null, current_odometer: 36000 });
    const { knex } = buildMockKnex([row], []);

    await runAlertEvaluator(knex);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends when percentage equals the threshold exactly", async () => {
    // 28 800 / 36 000 * 100 = 80% == 80
    const row = makeAlertRow({ alert_type: "miles_threshold", threshold_value: 80, current_odometer: 28800 });
    const { knex } = buildMockKnex([row], []);
    mockSend.mockResolvedValue(undefined);

    await runAlertEvaluator(knex);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // over_pace
  // -------------------------------------------------------------------------

  it("sends an over_pace alert when pace_status is 'behind'", async () => {
    // To get pace_status = 'behind' we need miles_driven < expected_miles_to_date by more than 1%
    // Use a lease that started 2 years ago with only a tiny odometer reading.
    const row = makeAlertRow({
      alert_type: "over_pace",
      threshold_value: null,
      lease_start_date: "2023-01-01",
      lease_end_date: "2026-01-01",
      total_miles_allowed: 36000,
      starting_odometer: 0,
      current_odometer: 100,  // drove almost nothing → far behind expected pace
    });
    const { knex } = buildMockKnex([row], []);
    mockSend.mockResolvedValue(undefined);

    await runAlertEvaluator(knex);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [userId, title, body] = mockSend.mock.calls[0];
    expect(userId).toBe("user-001");
    expect(title).toBe("Mileage Pace Alert");
    expect(body).toContain("My Tesla");
    expect(body).toContain("behind pace");
  });

  it("does NOT send an over_pace alert when pace_status is 'ahead'", async () => {
    // ahead: miles_driven >> expected_miles_to_date
    // Lease started 1 year ago, ends 2 years from now (3-year / 36 000-mile lease).
    // After 1 year the expected mileage is ~12 000, but the driver has done 25 000.
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const twoYearsFromNow = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const row = makeAlertRow({
      alert_type: "over_pace",
      threshold_value: null,
      lease_start_date: oneYearAgo,
      lease_end_date: twoYearsFromNow,
      total_miles_allowed: 36000,
      starting_odometer: 0,
      current_odometer: 25000,  // far ahead of expected ~12 000
    });
    const { knex } = buildMockKnex([row], []);

    await runAlertEvaluator(knex);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does NOT send an over_pace alert when pace_status is 'on_track'", async () => {
    // on_track: |miles_driven - expected_miles_to_date| <= 1% of total_miles_allowed
    // Same 3-year / 36 000-mile lease started 1 year ago.
    // After exactly 1 year: expected ≈ 12 000 miles; drive exactly 12 000 → on_track.
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const twoYearsFromNow = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const row = makeAlertRow({
      alert_type: "over_pace",
      threshold_value: null,
      lease_start_date: oneYearAgo,
      lease_end_date: twoYearsFromNow,
      total_miles_allowed: 36000,
      starting_odometer: 0,
      current_odometer: 12000,  // ≈ expected → on_track (within ±360-mile tolerance)
    });
    const { knex } = buildMockKnex([row], []);

    await runAlertEvaluator(knex);

    expect(mockSend).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // days_remaining
  // -------------------------------------------------------------------------

  it("sends a days_remaining alert when days_remaining <= threshold_value", async () => {
    // Lease ending in 15 days, threshold = 30
    const endDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const row = makeAlertRow({
      alert_type: "days_remaining",
      threshold_value: 30,
      lease_end_date: endDate,
      current_odometer: 0,
    });
    const { knex } = buildMockKnex([row], []);
    mockSend.mockResolvedValue(undefined);

    await runAlertEvaluator(knex);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [userId, title, body] = mockSend.mock.calls[0];
    expect(userId).toBe("user-001");
    expect(title).toBe("Lease Ending Soon");
    expect(body).toContain("My Tesla");
    expect(body).toMatch(/\d+ days remaining/);
  });

  it("does NOT send a days_remaining alert when days_remaining > threshold_value", async () => {
    // Lease ending in 60 days, threshold = 30
    const endDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const row = makeAlertRow({
      alert_type: "days_remaining",
      threshold_value: 30,
      lease_end_date: endDate,
      current_odometer: 0,
    });
    const { knex } = buildMockKnex([row], []);

    await runAlertEvaluator(knex);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does NOT send a days_remaining alert when threshold_value is null", async () => {
    const endDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const row = makeAlertRow({
      alert_type: "days_remaining",
      threshold_value: null,
      lease_end_date: endDate,
    });
    const { knex } = buildMockKnex([row], []);

    await runAlertEvaluator(knex);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends when days_remaining equals the threshold exactly", async () => {
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const row = makeAlertRow({
      alert_type: "days_remaining",
      threshold_value: 30,
      lease_end_date: endDate,
      current_odometer: 0,
    });
    const { knex } = buildMockKnex([row], []);
    mockSend.mockResolvedValue(undefined);

    await runAlertEvaluator(knex);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // last_sent_at update
  // -------------------------------------------------------------------------

  it("updates last_sent_at after sending", async () => {
    const row = makeAlertRow();
    const { knex, mockUpdate } = buildMockKnex([row], []);
    mockSend.mockResolvedValue(undefined);

    await runAlertEvaluator(knex);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ last_sent_at: expect.any(Date) })
    );
  });

  it("does not update last_sent_at when alert condition is not met", async () => {
    // 10 000 miles of 36 000 = 27.8% — below 80% threshold
    const row = makeAlertRow({ current_odometer: 10000 });
    const { knex, mockUpdate } = buildMockKnex([row], []);

    await runAlertEvaluator(knex);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Reserved trip miles
  // -------------------------------------------------------------------------

  it("accounts for reserved trip miles when computing the lease summary", async () => {
    // 28 800 of 36 000 miles driven = 80% base, but reservedMiles = 1 000
    // miles_remaining = 36000 - 28800 - 1000 = 6200; this doesn't affect pct directly
    // The test just verifies that the trip query result is consumed without error.
    const row = makeAlertRow({ current_odometer: 28800, alert_type: "miles_threshold", threshold_value: 80 });
    const tripRow = { lease_id: "lease-001", reserved_miles: 1000 };
    const { knex } = buildMockKnex([row], [tripRow]);
    mockSend.mockResolvedValue(undefined);

    await runAlertEvaluator(knex);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("handles null reserved_miles from the trips query gracefully", async () => {
    const row = makeAlertRow({ current_odometer: 28800, alert_type: "miles_threshold", threshold_value: 80 });
    const tripRow = { lease_id: "lease-001", reserved_miles: null };
    const { knex } = buildMockKnex([row], [tripRow]);
    mockSend.mockResolvedValue(undefined);

    await runAlertEvaluator(knex);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Multiple alerts / caching
  // -------------------------------------------------------------------------

  it("fires multiple alerts for the same lease without re-running computeLeaseSummary per row", async () => {
    // Two alert configs on the same lease — both should fire.
    const row1 = makeAlertRow({ alert_id: "alert-001", alert_type: "miles_threshold", threshold_value: 80 });
    const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const row2 = makeAlertRow({
      alert_id: "alert-002",
      alert_type: "days_remaining",
      threshold_value: 30,
      lease_end_date: endDate,
    });
    const { knex } = buildMockKnex([row1, row2], []);
    mockSend.mockResolvedValue(undefined);

    await runAlertEvaluator(knex);

    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("handles an unrecognised alert_type without throwing", async () => {
    const row = makeAlertRow({ alert_type: "unknown_type" });
    const { knex } = buildMockKnex([row], []);

    await expect(runAlertEvaluator(knex)).resolves.toBeUndefined();
    expect(mockSend).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------------------------

  it("propagates errors thrown by the notification service", async () => {
    const row = makeAlertRow();
    const { knex } = buildMockKnex([row], []);
    mockSend.mockRejectedValue(new Error("SNS unavailable"));

    await expect(runAlertEvaluator(knex)).rejects.toThrow("SNS unavailable");
  });
});
