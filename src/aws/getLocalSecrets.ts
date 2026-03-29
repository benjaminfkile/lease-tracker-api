import { IAPISecrets, IDBSecrets } from "../interfaces";
import { TNodeEnviromnent } from "../types";

export function getLocalAppSecrets(): IAPISecrets {
  return {
    db_name: process.env.DB_NAME || "",
    node_env: (process.env.NODE_ENV as TNodeEnviromnent) || "local",
    port: process.env.PORT || "3005",
  };
}

export function getLocalDBSecrets(): IDBSecrets {
  return {
    username: process.env.DB_USER || "",
    password: process.env.DB_PASSWORD || "",
    engine: "postgres",
    host: process.env.DB_HOST || "",
    proxy_url: process.env.DB_HOST || "",
    port: 5432,
    dbInstanceIdentifier: "",
  };
}
