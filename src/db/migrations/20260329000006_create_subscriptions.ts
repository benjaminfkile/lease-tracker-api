import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("subscriptions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.string("platform", 10).notNullable();
    table.string("product_id", 200).notNullable();
    table.string("transaction_id", 500);
    table.text("purchase_token");
    table.boolean("is_active").defaultTo(true);
    table.timestamp("expires_at", { useTz: true });
    table.string("environment", 20);
    table.text("raw_receipt");
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("subscriptions");
}
