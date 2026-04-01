import express, { Express, Request, Response } from "express";
import cors from "cors";
import healthRouter from "./routers/healthRouter";
import usersRouter from "./routers/usersRouter";
import leasesRouter from "./routers/leasesRouter";
import subscriptionsRouter from "./routers/subscriptionsRouter";
import internalRouter from "./routers/internalRouter";
import { errorHandler } from "./middleware/errorHandler";
import { swaggerUiHandler, swaggerServe } from "./swagger";

const app: Express = express();

app.use(express.json());
app.use(cors());

app.get("/", (req: Request, res: Response) => {
  res.send("api");
});

app.use("/api/health", healthRouter);
app.use("/api/users", usersRouter);
app.use("/api/leases", leasesRouter);
app.use("/api/subscriptions", subscriptionsRouter);
app.use("/api/internal", internalRouter);

app.get("/api-docs", swaggerUiHandler);
app.get("/api-docs/", swaggerUiHandler);
app.use("/api-docs", swaggerServe);

app.use(errorHandler);

export default app;
