import dotenv from "dotenv";
import http from "http";
import { initDb } from "./src/db/db";
import { getAppSecrets } from "./src/aws/getAppSecrets";
import { IAPISecrets, IDBSecrets } from "./src/interfaces";
import app from "./src/app";
import morgan from "morgan";
import { TNodeEnviromnent } from "./src/types";
import { getDBSecrets } from "./src/aws/getDBSecrets";

dotenv.config();

process.on("uncaughtException", function (err) {
  console.error(err);
  console.log("Node NOT Exiting...");
});

async function start() {
  try {
    const appSecrets: IAPISecrets = await getAppSecrets();
    const dbSecrets: IDBSecrets = await getDBSecrets();

    console.log("App Secrets:", appSecrets);
    console.log("DB Secrets:", dbSecrets);
    
    app.set("secrets", appSecrets);

    const environemt =
      process.env.IS_LOCAL === "true"
        ? "local"
        : appSecrets.node_env || ("local" as TNodeEnviromnent);
    const morganOption = environemt === "production" ? "tiny" : "common";
    app.use(morgan(morganOption));

    const port = parseInt(appSecrets.port) || 3005;
    const server = http.createServer({}, app);

    await initDb(dbSecrets, appSecrets, environemt);

    process.on("SIGINT", () => {
      server?.close(() => {
        console.log("Server closed");
        process.exit(0);
      });
    });

    process.on("SIGTERM", () => {
      server?.close(() => {
        console.log("Server closed");
        process.exit(0);
      });
    });

    server.listen(port, () => {
      console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
