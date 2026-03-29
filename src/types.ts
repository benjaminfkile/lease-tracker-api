import { IUser } from "./interfaces";

export type TNodeEnviromnent = "local" | "development" | "production";

declare global {
  namespace Express {
    interface Request {
      cognitoUser?: Record<string, unknown>;
      dbUser?: IUser;
    }
  }
}