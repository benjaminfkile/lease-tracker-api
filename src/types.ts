import { IUser, ILeaseMember } from "./interfaces";

export type TNodeEnviromnent = "local" | "development" | "production";

export type TLeaseRole = "viewer" | "editor" | "owner";

declare global {
  namespace Express {
    interface Request {
      cognitoUser?: Record<string, unknown>;
      dbUser?: IUser;
      leaseMember?: ILeaseMember;
    }
  }
}