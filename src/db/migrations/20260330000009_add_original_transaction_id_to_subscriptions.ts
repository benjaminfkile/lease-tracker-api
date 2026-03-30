import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("subscriptions", (table) => {
    table.string("original_transaction_id", 500).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("subscriptions", (table) => {
    table.dropColumn("original_transaction_id");
  });
}
