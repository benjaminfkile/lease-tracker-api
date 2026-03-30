import { IAlertConfig } from "../interfaces";
import { getDb } from "./db";

/**
 * Returns all alert configs for a given lease, ordered by created_at ASC.
 */
export async function getAlertConfigs(leaseId: string): Promise<IAlertConfig[]> {
  return getDb()<IAlertConfig>("alert_configs")
    .where({ lease_id: leaseId })
    .orderBy("created_at", "asc");
}

/**
 * Creates the three default alert configs for a newly created lease:
 *   - miles_threshold: threshold_value = 80, meaning alert when 80% of
 *     total_miles_allowed is reached
 *   - over_pace: no threshold (alert fires when current pace exceeds allotment)
 *   - days_remaining: threshold_value = 30 days remaining on the lease
 */
export async function createDefaultAlertConfigs(
  leaseId: string,
  userId: string
): Promise<IAlertConfig[]> {
  const defaults = [
    {
      lease_id: leaseId,
      user_id: userId,
      alert_type: "miles_threshold",
      threshold_value: 80,
      is_enabled: true,
    },
    {
      lease_id: leaseId,
      user_id: userId,
      alert_type: "over_pace",
      threshold_value: null,
      is_enabled: true,
    },
    {
      lease_id: leaseId,
      user_id: userId,
      alert_type: "days_remaining",
      threshold_value: 30,
      is_enabled: true,
    },
  ];

  return getDb()<IAlertConfig>("alert_configs").insert(defaults).returning("*");
}
