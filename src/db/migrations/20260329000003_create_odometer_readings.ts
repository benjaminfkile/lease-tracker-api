import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("odometer_readings", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("lease_id")
      .notNullable()
      .references("id")
      .inTable("leases")
      .onDelete("CASCADE");
    table
      .uuid("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.integer("odometer").notNullable();
    table.date("reading_date").notNullable();
    table.text("notes");
    table.string("source", 20).defaultTo("manual");
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());

    table.index(["lease_id", "reading_date"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("odometer_readings");
}
