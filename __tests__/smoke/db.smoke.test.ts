/**
 * Smoke tests for database connectivity and secrets resolution.
 *
 * These tests hit real AWS Secrets Manager and a real PostgreSQL database.
 * They require the following environment variables to be set:
 *   AWS_REGION, AWS_SECRET_ARN, AWS_DB_SECRET_ARN
 *
 * Run with: npm run test:smoke
 */

import knex, { Knex } from "knex";
import knexConfig from "../../knexfile";
import { getAppSecrets } from "../../src/aws/getAppSecrets";
import { getDBSecrets } from "../../src/aws/getDBSecrets";

let db: Knex;

beforeAll(async () => {
  db = knex(knexConfig["production"]);
});

afterAll(async () => {
  await db.destroy();
});

// ---------------------------------------------------------------------------
// Secrets resolution
// ---------------------------------------------------------------------------

describe("getAppSecrets", () => {
  it("resolves without throwing", async () => {
    await expect(getAppSecrets()).resolves.toBeDefined();
  });

  it("contains all required fields", async () => {
    const secrets = await getAppSecrets();
    const required: (keyof typeof secrets)[] = [
      "DB_NAME",
      "DB_HOST",
      "NODE_ENV",
      "PORT",
      "COGNITO_USER_POOL_ID",
      "COGNITO_CLIENT_ID",
      "INTERNAL_API_KEY",
    ];
    for (const key of required) {
      expect(secrets[key]).toBeTruthy();
    }
  });
});

describe("getDBSecrets", () => {
  it("resolves without throwing", async () => {
    await expect(getDBSecrets()).resolves.toBeDefined();
  });

  it("contains username and password", async () => {
    const secrets = await getDBSecrets();
    expect(secrets.username).toBeTruthy();
    expect(secrets.password).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Database connectivity
// ---------------------------------------------------------------------------

describe("database connection", () => {
  it("can execute a basic query", async () => {
    const result = await db.raw("SELECT 1+1 AS result");
    expect(result.rows[0].result).toBe(2);
  });

  it("has no pending migrations", async () => {
    const [completed, pending] = await db.migrate.list();
    expect(pending).toHaveLength(0);
  });
});
