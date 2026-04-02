import knex, { Knex } from "knex";
import { IAppSecrets, IDBSecrets } from "../interfaces";
import health from "./health";

let db: Knex | null = null;

export async function initDb(
  dbSecrets: IDBSecrets,
  appSecrets: IAppSecrets,
  //environmnet: TNodeEnviromnent
): Promise<Knex> {
  if (db) return db;

  const { DB_NAME, DB_HOST } = appSecrets;

  // const dbUrl = environmnet !== "local" ? PROXY_URL : HOST;
  const dbUrl = DB_HOST; //proxy is currently disbaled, its exensive AF

  db = knex({
    client: "pg",
    connection: {
      host: dbUrl,
      user: dbSecrets.username,
      password: dbSecrets.password,
      database: DB_NAME,
      port: 5432,
      ssl: { rejectUnauthorized: false },
    },
  });

  const dbHealth = await health.getDBConnectionHealth(db, true);

  console.log(dbHealth.logs);

  return db;
}

export function getDb(): Knex {
  if (!db) {
    throw new Error("Database has not been initialized. Call initDb() first.");
  }
  return db;
}
