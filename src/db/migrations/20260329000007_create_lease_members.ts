import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("lease_members", (table) => {
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
    table.string("role", 20).defaultTo("viewer");
    table.uuid("invited_by").references("id").inTable("users");
    table.timestamp("accepted_at", { useTz: true });
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());

    table.unique(["lease_id", "user_id"]);
    table.index(["user_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("lease_members");
}
