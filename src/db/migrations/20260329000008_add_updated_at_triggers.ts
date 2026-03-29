import type { Knex } from "knex";

const TABLES_WITH_UPDATED_AT = [
  "users",
  "leases",
  "saved_trips",
  "subscriptions",
];

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  for (const table of TABLES_WITH_UPDATED_AT) {
    await knex.raw(`
      CREATE TRIGGER trg_${table}_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of TABLES_WITH_UPDATED_AT) {
    await knex.raw(
      `DROP TRIGGER IF EXISTS trg_${table}_updated_at ON ${table};`
    );
  }

  await knex.raw("DROP FUNCTION IF EXISTS set_updated_at();");
}
