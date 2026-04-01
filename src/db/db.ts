import knex, { Knex } from "knex";
import { IAppSecrets, IDBSecrets } from "../interfaces";
import { TNodeEnviromnent } from "../types";
import health from "./health";

let db: Knex | null = null;

export async function initDb(
  dbSecrets: IDBSecrets,
  appSecrets: IAppSecrets,
  environmnet: TNodeEnviromnent
): Promise<Knex> {
  if (db) return db;

  const { USERNAME, PASSWORD, HOST, /*PROXY_URL,*/ PORT } = dbSecrets;

  const { DB_NAME } = appSecrets;

  // const dbUrl = environmnet !== "local" ? PROXY_URL : HOST;
  const dbUrl = HOST; //proxy is currently disbaled, its exensive AF

  db = knex({
    client: "pg",
    connection: {
      host: dbUrl,
      user: USERNAME,
      password: PASSWORD,
      database: DB_NAME,
      port: PORT,
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
