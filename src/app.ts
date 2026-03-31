import express, { Express, Request, Response } from "express";
import morgan from "morgan";
import cors from "cors";
import healthRouter from "./routers/healthRouter";
import usersRouter from "./routers/usersRouter";
import leasesRouter from "./routers/leasesRouter";
import subscriptionsRouter from "./routers/subscriptionsRouter";
import internalRouter from "./routers/internalRouter";
import { isLocal } from "./utils/isLocal";
import { errorHandler } from "./middleware/errorHandler";
import swaggerRouter from "./swagger";

const app: Express = express();

app.use(express.json());

if (isLocal()) {
  app.use(morgan("dev"));
  app.use(cors());
}

app.get("/", (req: Request, res: Response) => {
  res.send("api");
});

app.use("/api/health", healthRouter);
app.use("/api/users", usersRouter);
app.use("/api/leases", leasesRouter);
app.use("/api/subscriptions", subscriptionsRouter);
app.use("/api/internal", internalRouter);

if (process.env.NODE_ENV !== "production") {
  app.use("/api-docs", swaggerRouter);
}

app.use(errorHandler);

export default app;
