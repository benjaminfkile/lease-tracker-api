import {
  CreateLeaseSchema,
  UpdateLeaseSchema,
  CreateOdometerReadingSchema,
  UpdateOdometerReadingSchema,
  CreateSavedTripSchema,
  UpdateSavedTripSchema,
  CreateAlertConfigSchema,
  UpdateAlertConfigSchema,
  VerifyAppleReceiptSchema,
  VerifyGoogleReceiptSchema,
  InviteMemberSchema,
} from "../src/validation/schemas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectValid<T>(schema: { parse: (v: unknown) => T }, data: unknown) {
  expect(() => schema.parse(data)).not.toThrow();
}

function expectInvalid<T>(schema: { parse: (v: unknown) => T }, data: unknown) {
  expect(() => schema.parse(data)).toThrow();
}

// ---------------------------------------------------------------------------
// CreateLeaseSchema
// ---------------------------------------------------------------------------

describe("CreateLeaseSchema", () => {
  const valid = {
    display_name: "My Lease",
    lease_start_date: "2024-01-01",
    lease_end_date: "2027-01-01",
    total_miles_allowed: 36000,
    miles_per_year: 12000,
    overage_cost_per_mile: 0.25,
  };

  it("accepts minimal valid input", () => {
    expectValid(CreateLeaseSchema, valid);
  });

  it("accepts full valid input", () => {
    expectValid(CreateLeaseSchema, {
      ...valid,
      make: "Honda",
      model: "Accord",
      year: 2024,
      trim: "Sport",
      color: "White",
      vin: "1HGCM82633A123456",
      license_plate: "ABC1234",
      starting_odometer: 0,
      current_odometer: 1000,
      monthly_payment: 350.0,
      dealer_name: "Honda Dealer",
      dealer_phone: "555-1234",
      contract_number: "CN001",
      notes: "Good deal",
      is_active: true,
    });
  });

  it("rejects missing display_name", () => {
    const { display_name, ...rest } = valid;
    expectInvalid(CreateLeaseSchema, rest);
  });

  it("rejects empty display_name", () => {
    expectInvalid(CreateLeaseSchema, { ...valid, display_name: "" });
  });

  it("rejects missing lease_start_date", () => {
    const { lease_start_date, ...rest } = valid;
    expectInvalid(CreateLeaseSchema, rest);
  });

  it("rejects invalid date format", () => {
    expectInvalid(CreateLeaseSchema, {
      ...valid,
      lease_start_date: "01/01/2024",
    });
  });

  it("rejects non-positive total_miles_allowed", () => {
    expectInvalid(CreateLeaseSchema, { ...valid, total_miles_allowed: 0 });
  });

  it("rejects non-positive miles_per_year", () => {
    expectInvalid(CreateLeaseSchema, { ...valid, miles_per_year: -1 });
  });

  it("rejects negative overage_cost_per_mile", () => {
    expectInvalid(CreateLeaseSchema, {
      ...valid,
      overage_cost_per_mile: -0.1,
    });
  });

  it("rejects vin with wrong length", () => {
    expectInvalid(CreateLeaseSchema, { ...valid, vin: "TOOSHORT" });
  });

  it("rejects year below 1900", () => {
    expectInvalid(CreateLeaseSchema, { ...valid, year: 1800 });
  });

  it("rejects year above 2100", () => {
    expectInvalid(CreateLeaseSchema, { ...valid, year: 2200 });
  });

  it("rejects lease_end_date before lease_start_date", () => {
    expectInvalid(CreateLeaseSchema, {
      ...valid,
      lease_start_date: "2024-01-01",
      lease_end_date: "2023-12-31",
    });
  });

  it("rejects lease_end_date equal to lease_start_date", () => {
    expectInvalid(CreateLeaseSchema, {
      ...valid,
      lease_start_date: "2024-01-01",
      lease_end_date: "2024-01-01",
    });
  });
});

// ---------------------------------------------------------------------------
// UpdateLeaseSchema
// ---------------------------------------------------------------------------

describe("UpdateLeaseSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    expectValid(UpdateLeaseSchema, {});
  });

  it("accepts partial update", () => {
    expectValid(UpdateLeaseSchema, {
      display_name: "Updated Name",
      is_active: false,
    });
  });

  it("rejects empty display_name", () => {
    expectInvalid(UpdateLeaseSchema, { display_name: "" });
  });

  it("rejects non-positive total_miles_allowed", () => {
    expectInvalid(UpdateLeaseSchema, { total_miles_allowed: 0 });
  });

  it("rejects invalid date format", () => {
    expectInvalid(UpdateLeaseSchema, { lease_end_date: "not-a-date" });
  });

  it("rejects lease_end_date before lease_start_date when both provided", () => {
    expectInvalid(UpdateLeaseSchema, {
      lease_start_date: "2024-06-01",
      lease_end_date: "2024-01-01",
    });
  });

  it("accepts update with only lease_end_date (no start date for comparison)", () => {
    expectValid(UpdateLeaseSchema, { lease_end_date: "2027-01-01" });
  });
});

// ---------------------------------------------------------------------------
// CreateOdometerReadingSchema
// ---------------------------------------------------------------------------

describe("CreateOdometerReadingSchema", () => {
  const valid = {
    lease_id: "550e8400-e29b-41d4-a716-446655440000",
    odometer: 12500,
    reading_date: "2024-06-01",
  };

  it("accepts valid input", () => {
    expectValid(CreateOdometerReadingSchema, valid);
  });

  it("accepts optional fields", () => {
    expectValid(CreateOdometerReadingSchema, {
      ...valid,
      notes: "Monthly check",
      source: "manual",
    });
  });

  it("rejects missing lease_id", () => {
    const { lease_id, ...rest } = valid;
    expectInvalid(CreateOdometerReadingSchema, rest);
  });

  it("rejects invalid uuid for lease_id", () => {
    expectInvalid(CreateOdometerReadingSchema, {
      ...valid,
      lease_id: "not-a-uuid",
    });
  });

  it("rejects negative odometer", () => {
    expectInvalid(CreateOdometerReadingSchema, { ...valid, odometer: -1 });
  });

  it("rejects missing reading_date", () => {
    const { reading_date, ...rest } = valid;
    expectInvalid(CreateOdometerReadingSchema, rest);
  });
});

// ---------------------------------------------------------------------------
// UpdateOdometerReadingSchema
// ---------------------------------------------------------------------------

describe("UpdateOdometerReadingSchema", () => {
  it("accepts empty object", () => {
    expectValid(UpdateOdometerReadingSchema, {});
  });

  it("accepts partial update", () => {
    expectValid(UpdateOdometerReadingSchema, { odometer: 13000 });
  });

  it("rejects negative odometer", () => {
    expectInvalid(UpdateOdometerReadingSchema, { odometer: -5 });
  });

  it("rejects invalid date", () => {
    expectInvalid(UpdateOdometerReadingSchema, { reading_date: "bad-date" });
  });
});

// ---------------------------------------------------------------------------
// CreateSavedTripSchema
// ---------------------------------------------------------------------------

describe("CreateSavedTripSchema", () => {
  const valid = {
    lease_id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Weekend trip",
    estimated_miles: 200,
  };

  it("accepts valid input", () => {
    expectValid(CreateSavedTripSchema, valid);
  });

  it("accepts optional fields", () => {
    expectValid(CreateSavedTripSchema, {
      ...valid,
      trip_date: "2024-07-04",
      notes: "Family trip",
      is_completed: false,
    });
  });

  it("rejects missing name", () => {
    const { name, ...rest } = valid;
    expectInvalid(CreateSavedTripSchema, rest);
  });

  it("rejects empty name", () => {
    expectInvalid(CreateSavedTripSchema, { ...valid, name: "" });
  });

  it("rejects non-positive estimated_miles", () => {
    expectInvalid(CreateSavedTripSchema, { ...valid, estimated_miles: 0 });
  });

  it("rejects invalid uuid for lease_id", () => {
    expectInvalid(CreateSavedTripSchema, { ...valid, lease_id: "bad-id" });
  });
});

// ---------------------------------------------------------------------------
// UpdateSavedTripSchema
// ---------------------------------------------------------------------------

describe("UpdateSavedTripSchema", () => {
  it("accepts empty object", () => {
    expectValid(UpdateSavedTripSchema, {});
  });

  it("accepts partial update", () => {
    expectValid(UpdateSavedTripSchema, {
      name: "New name",
      is_completed: true,
    });
  });

  it("rejects empty name", () => {
    expectInvalid(UpdateSavedTripSchema, { name: "" });
  });

  it("rejects non-positive estimated_miles", () => {
    expectInvalid(UpdateSavedTripSchema, { estimated_miles: -10 });
  });
});

// ---------------------------------------------------------------------------
// CreateAlertConfigSchema
// ---------------------------------------------------------------------------

describe("CreateAlertConfigSchema", () => {
  const valid = {
    lease_id: "550e8400-e29b-41d4-a716-446655440000",
    alert_type: "miles_threshold",
  };

  it("accepts valid input with miles_threshold", () => {
    expectValid(CreateAlertConfigSchema, {
      ...valid,
      threshold_value: 80,
    });
  });

  it("accepts over_pace alert type", () => {
    expectValid(CreateAlertConfigSchema, {
      ...valid,
      alert_type: "over_pace",
    });
  });

  it("accepts days_remaining alert type", () => {
    expectValid(CreateAlertConfigSchema, {
      ...valid,
      alert_type: "days_remaining",
      threshold_value: 30,
    });
  });

  it("accepts optional is_enabled", () => {
    expectValid(CreateAlertConfigSchema, {
      ...valid,
      is_enabled: false,
    });
  });

  it("rejects invalid alert_type", () => {
    expectInvalid(CreateAlertConfigSchema, {
      ...valid,
      alert_type: "unknown_type",
    });
  });

  it("rejects missing alert_type", () => {
    expectInvalid(CreateAlertConfigSchema, {
      lease_id: valid.lease_id,
    });
  });

  it("rejects invalid uuid for lease_id", () => {
    expectInvalid(CreateAlertConfigSchema, {
      ...valid,
      lease_id: "bad-uuid",
    });
  });

  it("rejects negative threshold_value", () => {
    expectInvalid(CreateAlertConfigSchema, {
      ...valid,
      threshold_value: -1,
    });
  });
});

// ---------------------------------------------------------------------------
// UpdateAlertConfigSchema
// ---------------------------------------------------------------------------

describe("UpdateAlertConfigSchema", () => {
  it("accepts empty object", () => {
    expectValid(UpdateAlertConfigSchema, {});
  });

  it("accepts partial update", () => {
    expectValid(UpdateAlertConfigSchema, { is_enabled: true });
  });

  it("accepts valid alert_type update", () => {
    expectValid(UpdateAlertConfigSchema, { alert_type: "over_pace" });
  });

  it("rejects invalid alert_type", () => {
    expectInvalid(UpdateAlertConfigSchema, { alert_type: "bad_type" });
  });

  it("rejects negative threshold_value", () => {
    expectInvalid(UpdateAlertConfigSchema, { threshold_value: -5 });
  });
});

// ---------------------------------------------------------------------------
// VerifyAppleReceiptSchema
// ---------------------------------------------------------------------------

describe("VerifyAppleReceiptSchema", () => {
  const valid = {
    receipt_data: "base64encodedreceiptdata==",
    product_id: "com.example.premium_monthly",
  };

  it("accepts valid input", () => {
    expectValid(VerifyAppleReceiptSchema, valid);
  });

  it("rejects missing receipt_data", () => {
    expectInvalid(VerifyAppleReceiptSchema, { product_id: valid.product_id });
  });

  it("rejects empty receipt_data", () => {
    expectInvalid(VerifyAppleReceiptSchema, {
      ...valid,
      receipt_data: "",
    });
  });

  it("rejects missing product_id", () => {
    expectInvalid(VerifyAppleReceiptSchema, {
      receipt_data: valid.receipt_data,
    });
  });

  it("rejects empty product_id", () => {
    expectInvalid(VerifyAppleReceiptSchema, {
      ...valid,
      product_id: "",
    });
  });
});

// ---------------------------------------------------------------------------
// VerifyGoogleReceiptSchema
// ---------------------------------------------------------------------------

describe("VerifyGoogleReceiptSchema", () => {
  const valid = {
    purchase_token: "some.long.purchase.token",
    product_id: "com.example.premium_monthly",
  };

  it("accepts valid input", () => {
    expectValid(VerifyGoogleReceiptSchema, valid);
  });

  it("rejects missing purchase_token", () => {
    const { purchase_token, ...rest } = valid;
    expectInvalid(VerifyGoogleReceiptSchema, rest);
  });

  it("rejects empty purchase_token", () => {
    expectInvalid(VerifyGoogleReceiptSchema, {
      ...valid,
      purchase_token: "",
    });
  });
});

// ---------------------------------------------------------------------------
// InviteMemberSchema
// ---------------------------------------------------------------------------

describe("InviteMemberSchema", () => {
  const valid = {
    lease_id: "550e8400-e29b-41d4-a716-446655440000",
    email: "friend@example.com",
  };

  it("accepts valid input", () => {
    expectValid(InviteMemberSchema, valid);
  });

  it("accepts viewer role", () => {
    expectValid(InviteMemberSchema, { ...valid, role: "viewer" });
  });

  it("accepts editor role", () => {
    expectValid(InviteMemberSchema, { ...valid, role: "editor" });
  });

  it("rejects invalid role", () => {
    expectInvalid(InviteMemberSchema, { ...valid, role: "admin" });
  });

  it("rejects missing email", () => {
    expectInvalid(InviteMemberSchema, { lease_id: valid.lease_id });
  });

  it("rejects invalid email format", () => {
    expectInvalid(InviteMemberSchema, { ...valid, email: "not-an-email" });
  });

  it("rejects invalid uuid for lease_id", () => {
    expectInvalid(InviteMemberSchema, { ...valid, lease_id: "bad-uuid" });
  });

  it("rejects missing lease_id", () => {
    expectInvalid(InviteMemberSchema, { email: valid.email });
  });
});
