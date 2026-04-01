import knex, { Knex } from "knex";
import knexConfig from "./knexfile";

const isDbConfigured = !!(
  process.env.AWS_SECRET_ARN &&
  process.env.AWS_DB_SECRET_ARN
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
