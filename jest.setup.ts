import knex, { Knex } from "knex";
import knexConfig from "./knexfile";

const isDbConfigured = !!(
  process.env.DB_HOST &&
  process.env.DB_USER &&
  process.env.DB_PASSWORD &&
  process.env.DB_NAME
);

let db: Knex | undefined;

if (isDbConfigured) {
  db = knex(knexConfig["test"]);
}

beforeAll(async () => {
  if (!db) return;
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
});

afterAll(async () => {
  if (!db) return;
  await db.destroy();
});
