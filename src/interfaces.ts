import { TNodeEnviromnent, TLeaseRole } from "./types";

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

export interface ILeaseMember {
  id: string;
  lease_id: string;
  user_id: string;
  role: TLeaseRole;
  invited_by: string | null;
  accepted_at: Date | null;
  created_at: Date;
}

export interface ILease {
  id: string;
  user_id: string;
  display_name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  trim: string | null;
  color: string | null;
  vin: string | null;
  license_plate: string | null;
  lease_start_date: string;
  lease_end_date: string;
  total_miles_allowed: number;
  miles_per_year: number;
  starting_odometer: number;
  current_odometer: number | null;
  overage_cost_per_mile: string;
  monthly_payment: string | null;
  dealer_name: string | null;
  dealer_phone: string | null;
  contract_number: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ILeaseWithRole extends ILease {
  role: TLeaseRole;
}

export interface ILeaseWithMembers extends ILease {
  members: ILeaseMember[];
}

export interface IAlertConfig {
  id: string;
  lease_id: string;
  user_id: string;
  alert_type: string;
  threshold_value: number | null;
  is_enabled: boolean;
  last_sent_at: Date | null;
  created_at: Date;
}
