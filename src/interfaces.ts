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

export interface ILeaseMemberWithUser extends ILeaseMember {
  display_name: string | null;
  email: string;
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

export interface ISavedTrip {
  id: string;
  lease_id: string;
  user_id: string;
  name: string;
  estimated_miles: number;
  trip_date: string | null;
  notes: string | null;
  is_completed: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface IOdometerReading {
  id: string;
  lease_id: string;
  user_id: string;
  odometer: number;
  reading_date: string;
  notes: string | null;
  source: string;
  created_at: Date;
}

export interface ISubscription {
  id: string;
  user_id: string;
  platform: string;
  product_id: string;
  transaction_id: string | null;
  original_transaction_id: string | null;
  purchase_token: string | null;
  is_active: boolean;
  expires_at: Date | null;
  environment: string | null;
  raw_receipt: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface INotificationSecrets {
  sns_apns_platform_arn: string;
  sns_fcm_platform_arn: string;
}

export interface ILeaseSummary {
  miles_driven: number;
  miles_remaining: number;
  days_elapsed: number;
  days_remaining: number;
  lease_length_days: number;
  expected_miles_to_date: number;
  current_pace_per_month: number;
  pace_status: "ahead" | "on_track" | "behind";
  miles_over_under_pace: number;
  projected_miles_at_end: number;
  projected_overage: number;
  projected_overage_cost: number;
  recommended_daily_miles: number;
  reserved_trip_miles: number;
  is_premium: boolean;
}
