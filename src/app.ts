import express, { Express, Request, Response } from "express";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import healthRouter from "./routers/healthRouter";
import usersRouter from "./routers/usersRouter";
import { isLocal } from "./utils/isLocal";
import { errorHandler } from "./middleware/errorHandler";

const app: Express = express();

app.use(helmet());

if (isLocal()) {
  app.use(morgan("dev"));
  app.use(cors());
} else {
  app.use(
    cors({
      origin: (origin, callback) => {
        const rawOrigins = process.env.ALLOWED_ORIGINS ?? "";
        const allowedOrigins = rawOrigins
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean);
        // Requests without an Origin header are direct/server-to-server calls
        // (e.g. the bk-gateway-api proxy). These bypass browser CORS and are allowed.
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, origin ?? true);
        } else {
          callback(null, false);
        }
      },
    })
  );
}

app.get("/", (req: Request, res: Response) => {
  res.send("api");
});

app.use("/api/health", healthRouter);
app.use("/api/users", usersRouter);

app.use(errorHandler);

export default app;
