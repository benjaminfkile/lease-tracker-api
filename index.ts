import dotenv from "dotenv";
import http from "http";
import { initDb } from "./src/db/db";
import { getAppSecrets } from "./src/aws/getAppSecrets";
import { getDBSecrets } from "./src/aws/getDBSecrets";
import { IAPISecrets, IDBSecrets } from "./src/interfaces";
import app from "./src/app";
import morgan from "morgan";
import { TNodeEnviromnent } from "./src/types";

dotenv.config();

process.on("uncaughtException", function (err) {
  console.error(err);
  console.log("Node NOT Exiting...");
});

async function start() {
  try {
    const isLocal = process.env.IS_LOCAL === "true";

    const appSecrets: IAPISecrets = await getAppSecrets();
    const dbSecrets: IDBSecrets = await getDBSecrets();

    console.log("App Secrets:", appSecrets);
    console.log("DB Secrets:", dbSecrets);

    app.set("secrets", appSecrets);

    const environment: TNodeEnviromnent = isLocal
      ? "local"
      : appSecrets.node_env || "local";
    const morganOption = environment === "production" ? "tiny" : "common";
    app.use(morgan(morganOption));

    const port = parseInt(appSecrets.port) || 3005;
    const server = http.createServer({}, app);

    const db = await initDb(dbSecrets, appSecrets, environment);

    async function shutdown(signal: string) {
      console.log(`Received ${signal}, shutting down gracefully`);
      server.close(async () => {
        try {
          await db.destroy();
          console.log("Database pool closed");
        } catch (dbErr) {
          console.error("Error closing database pool:", dbErr);
        }
        console.log("Server closed");
        process.exit(0);
      });
    }

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    server.listen(port, () => {
      console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
