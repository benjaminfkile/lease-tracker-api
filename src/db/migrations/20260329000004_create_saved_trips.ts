import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("saved_trips", (table) => {
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
    table.string("name", 150).notNullable();
    table.integer("estimated_miles").notNullable();
    table.date("trip_date");
    table.text("notes");
    table.boolean("is_completed").defaultTo(false);
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());

    table.index(["lease_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("saved_trips");
}
