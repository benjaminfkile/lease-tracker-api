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
 * Returns a single alert config by its ID, scoped to the given lease.
 */
export async function getAlertConfig(
  leaseId: string,
  alertId: string
): Promise<IAlertConfig | undefined> {
  return getDb()<IAlertConfig>("alert_configs")
    .where({ id: alertId, lease_id: leaseId })
    .first();
}

/**
 * Updates is_enabled and/or threshold_value on an existing alert config.
 */
export async function updateAlertConfig(
  leaseId: string,
  alertId: string,
  data: { is_enabled?: boolean; threshold_value?: number | null }
): Promise<IAlertConfig | undefined> {
  const [row] = await getDb()<IAlertConfig>("alert_configs")
    .where({ id: alertId, lease_id: leaseId })
    .update(data)
    .returning("*");
  return row;
}

/**
 * Creates a custom alert config for a lease.
 */
export async function createAlertConfig(
  leaseId: string,
  userId: string,
  data: { alert_type: string; threshold_value?: number; is_enabled?: boolean }
): Promise<IAlertConfig> {
  const [row] = await getDb()<IAlertConfig>("alert_configs")
    .insert({
      lease_id: leaseId,
      user_id: userId,
      alert_type: data.alert_type,
      threshold_value: data.threshold_value ?? null,
      is_enabled: data.is_enabled ?? true,
    })
    .returning("*");
  return row;
}

/**
 * Deletes an alert config scoped to the given lease and returns the deleted row,
 * or undefined if no matching record was found.
 */
export async function deleteAlertConfig(
  leaseId: string,
  alertId: string
): Promise<IAlertConfig | undefined> {
  const [row] = await getDb()<IAlertConfig>("alert_configs")
    .where({ id: alertId, lease_id: leaseId })
    .delete()
    .returning("*");
  return row;
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
