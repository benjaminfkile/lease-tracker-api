import type { Knex } from "knex";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildConnection(): Knex.PgConnectionConfig {
  return {
    host: requireEnv("DB_HOST"),
    port: Number(process.env.DB_PORT) || 5432,
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    database: requireEnv("DB_NAME"),
  };
}

const migrations = {
  directory: "./src/db/migrations",
};

const seeds = {
  directory: "./src/db/seeds",
};

const config: Record<string, Knex.Config> = {
  development: {
    client: "pg",
    connection: buildConnection,
    migrations,
    seeds,
  },
  test: {
    client: "pg",
    connection: buildConnection,
    migrations,
    seeds,
  },
  production: {
    client: "pg",
    connection: () => ({
      ...buildConnection(),
      // Self-signed RDS cert — matches the pattern used by the existing db client
      ssl: { rejectUnauthorized: false },
    }),
    migrations,
    seeds,
  },
};

export default config;
