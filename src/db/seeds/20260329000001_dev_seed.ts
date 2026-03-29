import type { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
  // Clean tables in reverse dependency order
  await knex("alert_configs").del();
  await knex("saved_trips").del();
  await knex("odometer_readings").del();
  await knex("lease_members").del();
  await knex("subscriptions").del();
  await knex("leases").del();
  await knex("users").del();

  // Insert seed user
  const [user] = await knex("users")
    .insert({
      cognito_user_id: "us-east-1_DEV000001:dev-user-sub",
      email: "dev@example.com",
      display_name: "Dev User",
      subscription_tier: "free",
    })
    .returning("*");

  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const activeLeaseStart = new Date(today);
  activeLeaseStart.setFullYear(today.getFullYear() - 1);

  const activeLeaseEnd = new Date(today);
  activeLeaseEnd.setFullYear(today.getFullYear() + 2);

  const nearEndLeaseStart = new Date(today);
  nearEndLeaseStart.setFullYear(today.getFullYear() - 2);
  nearEndLeaseStart.setMonth(today.getMonth() - 10);

  const nearEndLeaseEnd = new Date(today);
  nearEndLeaseEnd.setDate(today.getDate() + 20);

  // Insert two leases
  const [activeLease] = await knex("leases")
    .insert({
      user_id: user.id,
      display_name: "2024 Honda Accord",
      make: "Honda",
      model: "Accord",
      year: 2024,
      trim: "Sport",
      color: "Sonic Gray Pearl",
      vin: "1HGCV1F30RA000001",
      license_plate: "DEV-001",
      lease_start_date: fmt(activeLeaseStart),
      lease_end_date: fmt(activeLeaseEnd),
      total_miles_allowed: 36000,
      miles_per_year: 12000,
      starting_odometer: 10,
      current_odometer: 10 + 10 * 900,
      overage_cost_per_mile: 0.25,
      monthly_payment: 389.0,
      dealer_name: "Honda of Dev City",
      dealer_phone: "555-000-0001",
      contract_number: "DEV-CONTRACT-001",
      is_active: true,
    })
    .returning("*");

  const [nearEndLease] = await knex("leases")
    .insert({
      user_id: user.id,
      display_name: "2022 Toyota Camry",
      make: "Toyota",
      model: "Camry",
      year: 2022,
      trim: "SE",
      color: "Midnight Black",
      vin: "4T1BF1FK5NU000001",
      license_plate: "DEV-002",
      lease_start_date: fmt(nearEndLeaseStart),
      lease_end_date: fmt(nearEndLeaseEnd),
      total_miles_allowed: 36000,
      miles_per_year: 12000,
      starting_odometer: 5,
      current_odometer: 5 + 10 * 2900,
      overage_cost_per_mile: 0.25,
      monthly_payment: 349.0,
      dealer_name: "Toyota of Dev City",
      dealer_phone: "555-000-0002",
      contract_number: "DEV-CONTRACT-002",
      is_active: true,
    })
    .returning("*");

  // Insert 10 odometer readings for each lease
  const activeReadings = [];
  const nearEndReadings = [];

  for (let i = 1; i <= 10; i++) {
    const readingDate = new Date(activeLeaseStart);
    readingDate.setMonth(activeLeaseStart.getMonth() + i);

    activeReadings.push({
      lease_id: activeLease.id,
      user_id: user.id,
      odometer: 10 + i * 900,
      reading_date: fmt(readingDate),
      notes: `Active lease reading ${i}`,
      source: "manual",
    });
  }

  for (let i = 1; i <= 10; i++) {
    const readingDate = new Date(nearEndLeaseStart);
    readingDate.setMonth(nearEndLeaseStart.getMonth() + i * 3);

    nearEndReadings.push({
      lease_id: nearEndLease.id,
      user_id: user.id,
      odometer: 5 + i * 2900,
      reading_date: fmt(readingDate),
      notes: `Near-end lease reading ${i}`,
      source: "manual",
    });
  }

  await knex("odometer_readings").insert(activeReadings);
  await knex("odometer_readings").insert(nearEndReadings);

  // Insert two saved trips (one per lease)
  await knex("saved_trips").insert([
    {
      lease_id: activeLease.id,
      user_id: user.id,
      name: "Annual road trip",
      estimated_miles: 1200,
      trip_date: fmt(new Date(today.getFullYear(), today.getMonth() + 2, 1)),
      notes: "Summer family road trip",
      is_completed: false,
    },
    {
      lease_id: nearEndLease.id,
      user_id: user.id,
      name: "Weekend getaway",
      estimated_miles: 300,
      trip_date: fmt(new Date(today.getFullYear(), today.getMonth() + 1, 15)),
      notes: "Short weekend trip before lease ends",
      is_completed: false,
    },
  ]);

  // Insert default alert configs for each lease
  const alertTypes = [
    { alert_type: "miles_threshold", threshold_value: 80 },
    { alert_type: "over_pace", threshold_value: null },
    { alert_type: "days_remaining", threshold_value: 30 },
  ];

  const alertRows = [activeLease.id, nearEndLease.id].flatMap((leaseId) =>
    alertTypes.map(({ alert_type, threshold_value }) => ({
      lease_id: leaseId,
      user_id: user.id,
      alert_type,
      threshold_value,
      is_enabled: true,
    }))
  );

  await knex("alert_configs").insert(alertRows);
}
