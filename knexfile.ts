import type { Knex } from "knex";
import { getDBSecrets } from "./src/aws/getDBSecrets";
import { getAppSecrets } from "./src/aws/getAppSecrets";

const migrations = { directory: "./src/db/migrations" };
const seeds = { directory: "./src/db/seeds" };

async function buildConnection(): Promise<Knex.PgConnectionConfig> {
  const db = await getDBSecrets();
  const app = await getAppSecrets();
  return {
    host: app.DB_HOST,
    user: db.username,
    password: db.password,
    database: app.DB_NAME,
    ssl: { rejectUnauthorized: false },
  };
}

const config: Record<string, Knex.Config> = {
  development: { client: "pg", connection: buildConnection, migrations, seeds },
  test: { client: "pg", connection: buildConnection, migrations, seeds },
  production: { client: "pg", connection: buildConnection, migrations, seeds },
};

export default config;
