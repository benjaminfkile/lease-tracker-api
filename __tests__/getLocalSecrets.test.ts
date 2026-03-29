import { getLocalAppSecrets, getLocalDBSecrets } from "../src/aws/getLocalSecrets";

describe("getLocalAppSecrets", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("reads db_name from DB_NAME env var", () => {
    process.env.DB_NAME = "my_lease_db";
    const secrets = getLocalAppSecrets();
    expect(secrets.db_name).toBe("my_lease_db");
  });

  it("reads node_env from NODE_ENV env var", () => {
    process.env.NODE_ENV = "development";
    const secrets = getLocalAppSecrets();
    expect(secrets.node_env).toBe("development");
  });

  it("reads port from PORT env var", () => {
    process.env.PORT = "4000";
    const secrets = getLocalAppSecrets();
    expect(secrets.port).toBe("4000");
  });

  it("defaults db_name to empty string when DB_NAME is not set", () => {
    delete process.env.DB_NAME;
    const secrets = getLocalAppSecrets();
    expect(secrets.db_name).toBe("");
  });

  it("defaults node_env to 'local' when NODE_ENV is not set", () => {
    delete process.env.NODE_ENV;
    const secrets = getLocalAppSecrets();
    expect(secrets.node_env).toBe("local");
  });

  it("defaults port to '3005' when PORT is not set", () => {
    delete process.env.PORT;
    const secrets = getLocalAppSecrets();
    expect(secrets.port).toBe("3005");
  });
});

describe("getLocalDBSecrets", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("reads username from DB_USER env var", () => {
    process.env.DB_USER = "admin";
    const secrets = getLocalDBSecrets();
    expect(secrets.username).toBe("admin");
  });

  it("reads password from DB_PASSWORD env var", () => {
    process.env.DB_PASSWORD = "s3cr3t";
    const secrets = getLocalDBSecrets();
    expect(secrets.password).toBe("s3cr3t");
  });

  it("reads host from DB_HOST env var", () => {
    process.env.DB_HOST = "localhost";
    const secrets = getLocalDBSecrets();
    expect(secrets.host).toBe("localhost");
    expect(secrets.proxy_url).toBe("localhost");
  });

  it("always uses port 5432 (matches IDBSecrets literal type)", () => {
    process.env.DB_PORT = "5433";
    const secrets = getLocalDBSecrets();
    expect(secrets.port).toBe(5432);
  });

  it("defaults username to empty string when DB_USER is not set", () => {
    delete process.env.DB_USER;
    const secrets = getLocalDBSecrets();
    expect(secrets.username).toBe("");
  });

  it("defaults password to empty string when DB_PASSWORD is not set", () => {
    delete process.env.DB_PASSWORD;
    const secrets = getLocalDBSecrets();
    expect(secrets.password).toBe("");
  });

  it("defaults host and proxy_url to empty string when DB_HOST is not set", () => {
    delete process.env.DB_HOST;
    const secrets = getLocalDBSecrets();
    expect(secrets.host).toBe("");
    expect(secrets.proxy_url).toBe("");
  });

  it("defaults port to 5432", () => {
    delete process.env.DB_PORT;
    const secrets = getLocalDBSecrets();
    expect(secrets.port).toBe(5432);
  });

  it("sets engine to 'postgres'", () => {
    const secrets = getLocalDBSecrets();
    expect(secrets.engine).toBe("postgres");
  });

  it("sets dbInstanceIdentifier to empty string", () => {
    const secrets = getLocalDBSecrets();
    expect(secrets.dbInstanceIdentifier).toBe("");
  });
});
