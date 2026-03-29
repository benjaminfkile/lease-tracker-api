import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("leases", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.string("display_name", 150).notNullable();
    table.string("make", 100);
    table.string("model", 100);
    table.specificType("year", "SMALLINT");
    table.string("trim", 100);
    table.string("color", 50);
    table.string("vin", 17);
    table.string("license_plate", 20);
    table.date("lease_start_date").notNullable();
    table.date("lease_end_date").notNullable();
    table.integer("total_miles_allowed").notNullable();
    table.integer("miles_per_year").notNullable();
    table.integer("starting_odometer").notNullable().defaultTo(0);
    table.integer("current_odometer");
    table.decimal("overage_cost_per_mile", 6, 4).notNullable();
    table.decimal("monthly_payment", 10, 2);
    table.string("dealer_name", 150);
    table.string("dealer_phone", 30);
    table.string("contract_number", 100);
    table.text("notes");
    table.boolean("is_active").defaultTo(true);
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("leases");
}
