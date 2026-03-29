import express, { Express, NextFunction, Request, Response } from "express";
import morgan from "morgan";
import cors from "cors";
//import helmet from "helmet";
import healthRouter from "./routers/healthRouter";
import { isLocal } from "./utils/isLocal";

const app: Express = express();

if (isLocal()) {
  app.use(morgan("dev"));
  app.use(cors());
}

app.get("/", (req: Request, res: Response) => {
  res.send("api");
});

app.use("/api/health", healthRouter);

app.use(function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (res.headersSent) {
    return next(err);
  }
  res.status(500);
  res.render("error", { error: err });
});

export default app;
