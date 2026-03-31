import express, { Express, Request, Response } from "express";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import healthRouter from "./routers/healthRouter";
import usersRouter from "./routers/usersRouter";
import leasesRouter from "./routers/leasesRouter";
import subscriptionsRouter from "./routers/subscriptionsRouter";
import internalRouter from "./routers/internalRouter";
import { isLocal } from "./utils/isLocal";
import { errorHandler } from "./middleware/errorHandler";
import { getAppConfigValue } from "./aws/getAppConfig";

const app: Express = express();

function getAllowedOrigins(): Promise<string[]> {
  return getAppConfigValue("ALLOWED_ORIGINS")
    .then((rawOrigins) =>
      (rawOrigins ?? "")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    )
    .catch(() => []);
}

app.use(helmet());
app.use(express.json());

if (isLocal()) {
  app.use(morgan("dev"));
  app.use(cors());
} else {
  app.use(
    cors({
      origin: (origin, callback) => {
        void getAllowedOrigins().then((allowedOrigins) => {
          // Requests without an Origin header are direct/server-to-server calls
          // (e.g. the bk-gateway-api proxy). These bypass browser CORS and are allowed.
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, origin ?? true);
          } else {
            callback(null, false);
          }
        });
      },
    })
  );
}

app.get("/", (req: Request, res: Response) => {
  res.send("api");
});

app.use("/api/health", healthRouter);
app.use("/api/users", usersRouter);
app.use("/api/leases", leasesRouter);
app.use("/api/subscriptions", subscriptionsRouter);
app.use("/api/internal", internalRouter);

app.use(errorHandler);

export default app;
