import { TNodeEnviromnent } from "./types";

export interface IAPISecrets {
  db_name: string;
  node_env: TNodeEnviromnent;
  port: string;
}

export interface IDBSecrets {
  username: string
  password: string
  engine: "postgres"
  host: string
  proxy_url: string
  port: 5432
  dbInstanceIdentifier: string
}

export interface IDBHealth {
  connected: boolean;
  connectionUsesProxy: boolean;
  logs?: {
    messages: string[];
    host?: string;
    timestamp: string;
    error?: string;
  };
}

export interface IRawSQL {
  command: string;
  rowCount: number;
  oid: null | string;
  rows: any[];
}

export interface IUser {
  id: string;
  cognito_user_id: string;
  email: string;
  display_name: string | null;
  subscription_tier: string;
  subscription_expires_at: Date | null;
  push_token: string | null;
  created_at: Date;
  updated_at: Date;
}
