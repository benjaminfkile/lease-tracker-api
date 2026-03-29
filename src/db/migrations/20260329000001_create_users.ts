import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  await knex.schema.createTable("users", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("cognito_user_id", 255).unique().notNullable();
    table.string("email", 255).unique().notNullable();
    table.string("display_name", 100);
    table.string("subscription_tier", 20).defaultTo("free");
    table.timestamp("subscription_expires_at", { useTz: true });
    table.string("push_token", 500);
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("users");
}
