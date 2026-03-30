import { z } from "zod";

// ---------------------------------------------------------------------------
// Lease schemas
// ---------------------------------------------------------------------------

export const CreateLeaseSchema = z.object({
  display_name: z.string().min(1).max(150),
  make: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  trim: z.string().max(100).optional(),
  color: z.string().max(50).optional(),
  vin: z.string().length(17).optional(),
  license_plate: z.string().max(20).optional(),
  lease_start_date: z.string().date(),
  lease_end_date: z.string().date(),
  total_miles_allowed: z.number().int().positive(),
  miles_per_year: z.number().int().positive(),
  starting_odometer: z.number().int().min(0).optional(),
  current_odometer: z.number().int().min(0).optional(),
  overage_cost_per_mile: z.number().nonnegative(),
  monthly_payment: z.number().nonnegative().optional(),
  dealer_name: z.string().max(150).optional(),
  dealer_phone: z.string().max(30).optional(),
  contract_number: z.string().max(100).optional(),
  notes: z.string().optional(),
  is_active: z.boolean().optional(),
}).refine(
  (data) => data.lease_end_date > data.lease_start_date,
  { message: "lease_end_date must be after lease_start_date", path: ["lease_end_date"] }
);

export const UpdateLeaseSchema = z.object({
  display_name: z.string().min(1).max(150).optional(),
  make: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  trim: z.string().max(100).optional(),
  color: z.string().max(50).optional(),
  vin: z.string().length(17).optional(),
  license_plate: z.string().max(20).optional(),
  lease_start_date: z.string().date().optional(),
  lease_end_date: z.string().date().optional(),
  total_miles_allowed: z.number().int().positive().optional(),
  miles_per_year: z.number().int().positive().optional(),
  starting_odometer: z.number().int().min(0).optional(),
  current_odometer: z.number().int().min(0).optional(),
  overage_cost_per_mile: z.number().nonnegative().optional(),
  monthly_payment: z.number().nonnegative().optional(),
  dealer_name: z.string().max(150).optional(),
  dealer_phone: z.string().max(30).optional(),
  contract_number: z.string().max(100).optional(),
  notes: z.string().optional(),
  is_active: z.boolean().optional(),
}).refine(
  (data) =>
    data.lease_start_date === undefined ||
    data.lease_end_date === undefined ||
    data.lease_end_date > data.lease_start_date,
  { message: "lease_end_date must be after lease_start_date", path: ["lease_end_date"] }
);

// ---------------------------------------------------------------------------
// Odometer reading schemas
// ---------------------------------------------------------------------------

export const CreateOdometerReadingSchema = z.object({
  lease_id: z.string().uuid(),
  odometer: z.number().int().min(0),
  reading_date: z.string().date(),
  notes: z.string().optional(),
  source: z.string().max(20).optional(),
});

export const UpdateOdometerReadingSchema = z.object({
  odometer: z.number().int().min(0).optional(),
  reading_date: z.string().date().optional(),
  notes: z.string().nullable().optional(),
  source: z.string().max(20).optional(),
});

// ---------------------------------------------------------------------------
// Saved trip schemas
// ---------------------------------------------------------------------------

export const CreateSavedTripSchema = z.object({
  lease_id: z.string().uuid(),
  name: z.string().min(1).max(150),
  estimated_miles: z.number().int().positive(),
  trip_date: z.string().date().optional(),
  notes: z.string().optional(),
  is_completed: z.boolean().optional(),
});

export const UpdateSavedTripSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  estimated_miles: z.number().int().positive().optional(),
  trip_date: z.string().date().optional(),
  notes: z.string().optional(),
  is_completed: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Alert config schemas
// ---------------------------------------------------------------------------

const AlertTypeSchema = z.union([
  z.literal("miles_threshold"),
  z.literal("over_pace"),
  z.literal("days_remaining"),
]);

export const CreateAlertConfigSchema = z.object({
  lease_id: z.string().uuid(),
  alert_type: AlertTypeSchema,
  threshold_value: z.number().int().min(0).optional(),
  is_enabled: z.boolean().optional(),
});

export const UpdateAlertConfigSchema = z.object({
  alert_type: AlertTypeSchema.optional(),
  threshold_value: z.number().int().min(0).optional(),
  is_enabled: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Subscription receipt schemas
// ---------------------------------------------------------------------------

export const VerifyAppleReceiptSchema = z.object({
  receipt_data: z.string().min(1),
  product_id: z.string().min(1).max(200),
});

export const VerifyGoogleReceiptSchema = z.object({
  purchase_token: z.string().min(1),
  product_id: z.string().min(1).max(200),
});

// ---------------------------------------------------------------------------
// Lease sharing schema
// ---------------------------------------------------------------------------

export const InviteMemberSchema = z.object({
  lease_id: z.string().uuid(),
  email: z.string().email(),
  role: z.union([z.literal("viewer"), z.literal("editor")]).optional(),
});

export const UpdateMemberRoleSchema = z.object({
  role: z.union([z.literal("viewer"), z.literal("editor"), z.literal("owner")]),
});

// ---------------------------------------------------------------------------
// Analytics schemas
// ---------------------------------------------------------------------------

export const BuybackAnalysisQuerySchema = z.object({
  dealer_buyback_rate: z.coerce.number().positive(),
});

// ---------------------------------------------------------------------------
// User schemas
// ---------------------------------------------------------------------------

export const UpdateUserSchema = z.object({
  display_name: z.string().min(1).max(150).nullable().optional(),
  push_token: z.string().min(1).nullable().optional(),
});

export const UpdatePushTokenSchema = z.object({
  push_token: z.string().min(1),
});

export const DeleteUserSchema = z.object({
  confirm: z.literal("DELETE"),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type UpdatePushTokenInput = z.infer<typeof UpdatePushTokenSchema>;
export type DeleteUserInput = z.infer<typeof DeleteUserSchema>;
export type CreateLeaseInput = z.infer<typeof CreateLeaseSchema>;
export type UpdateLeaseInput = z.infer<typeof UpdateLeaseSchema>;
export type CreateOdometerReadingInput = z.infer<typeof CreateOdometerReadingSchema>;
export type UpdateOdometerReadingInput = z.infer<typeof UpdateOdometerReadingSchema>;
export type CreateSavedTripInput = z.infer<typeof CreateSavedTripSchema>;
export type UpdateSavedTripInput = z.infer<typeof UpdateSavedTripSchema>;
export type CreateAlertConfigInput = z.infer<typeof CreateAlertConfigSchema>;
export type UpdateAlertConfigInput = z.infer<typeof UpdateAlertConfigSchema>;
export type VerifyAppleReceiptInput = z.infer<typeof VerifyAppleReceiptSchema>;
export type VerifyGoogleReceiptInput = z.infer<typeof VerifyGoogleReceiptSchema>;
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleSchema>;
export type BuybackAnalysisQueryInput = z.infer<typeof BuybackAnalysisQuerySchema>;
