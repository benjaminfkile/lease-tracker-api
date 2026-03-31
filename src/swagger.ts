import swaggerUi from "swagger-ui-express";
import { Router } from "express";

const swaggerDocument: object = {
  openapi: "3.0.0",
  info: {
    title: "LeaseTracker API",
    version: "1.0.0",
    description:
      "REST API for the LeaseTracker mobile app. Manages car leases, odometer readings, mileage analytics, push notifications, and Apple/Google subscriptions.",
  },
  servers: [{ url: "/", description: "Current server" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Amazon Cognito ID token",
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Health", description: "Service health and readiness" },
    { name: "Users", description: "Authenticated user profile" },
    { name: "Leases", description: "Lease CRUD" },
    { name: "Members", description: "Lease sharing and member management" },
    { name: "Readings", description: "Odometer readings" },
    { name: "Trips", description: "Saved / reserved trips" },
    { name: "Alerts", description: "Mileage alert configurations" },
    { name: "Analytics", description: "Lease analytics and projections" },
    { name: "Subscriptions", description: "Apple and Google subscription management" },
    { name: "Internal", description: "Internal / scheduled-job endpoints" },
  ],
  paths: {
    // ─── Health ───────────────────────────────────────────────────────────
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        description: "Returns API version, uptime, environment, and DB connectivity.",
        security: [],
        parameters: [
          {
            name: "verbose",
            in: "query",
            description: "Include verbose DB diagnostics",
            schema: { type: "boolean" },
          },
        ],
        responses: {
          200: {
            description: "Healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    version: { type: "string", example: "1.0.0" },
                    environment: { type: "string", example: "development" },
                    uptime_seconds: { type: "integer", example: 120 },
                    db: {
                      type: "object",
                      properties: { connected: { type: "boolean" } },
                    },
                  },
                },
              },
            },
          },
          500: { description: "DB connection failed" },
        },
      },
    },

    // ─── Users ────────────────────────────────────────────────────────────
    "/api/users/me": {
      get: {
        tags: ["Users"],
        summary: "Get current user",
        description: "Returns the authenticated user's profile, upserting on first request.",
        responses: {
          200: { description: "User profile" },
          401: { description: "Unauthorized" },
        },
      },
      put: {
        tags: ["Users"],
        summary: "Update current user",
        description: "Updates display_name and/or push_token. Unknown fields are stripped.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  display_name: { type: "string", example: "John Doe" },
                  push_token: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Updated user profile" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
        },
      },
      delete: {
        tags: ["Users"],
        summary: "Delete current user",
        description: "Hard-deletes the authenticated user and all their data via FK cascade. Requires `{ confirm: 'DELETE' }` in the body.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["confirm"],
                properties: {
                  confirm: { type: "string", enum: ["DELETE"] },
                },
              },
            },
          },
        },
        responses: {
          204: { description: "Deleted" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/api/users/me/push-token": {
      patch: {
        tags: ["Users"],
        summary: "Refresh push token",
        description: "Lightweight endpoint called on app launch to keep the push token fresh.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["push_token"],
                properties: {
                  push_token: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          204: { description: "Updated" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
        },
      },
    },

    // ─── Leases ───────────────────────────────────────────────────────────
    "/api/leases": {
      get: {
        tags: ["Leases"],
        summary: "List leases",
        description: "Returns all active leases for the authenticated user (owned + shared), ordered by lease_end_date ASC.",
        responses: {
          200: { description: "Array of leases" },
          401: { description: "Unauthorized" },
        },
      },
      post: {
        tags: ["Leases"],
        summary: "Create lease",
        description: "Creates a new lease, auto-creates an owner member record, and seeds default alert configs.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: [
                  "vehicle_make",
                  "vehicle_model",
                  "vehicle_year",
                  "lease_start_date",
                  "lease_end_date",
                  "allowed_miles_per_year",
                  "starting_odometer",
                  "overage_cost_per_mile",
                ],
                properties: {
                  vehicle_make: { type: "string", example: "Toyota" },
                  vehicle_model: { type: "string", example: "Camry" },
                  vehicle_year: { type: "integer", example: 2024 },
                  lease_start_date: { type: "string", format: "date", example: "2024-01-01" },
                  lease_end_date: { type: "string", format: "date", example: "2027-01-01" },
                  allowed_miles_per_year: { type: "integer", example: 12000 },
                  starting_odometer: { type: "integer", example: 10 },
                  overage_cost_per_mile: { type: "number", example: 0.25 },
                  monthly_payment: { type: "number", example: 450.0 },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Created lease" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/api/leases/{leaseId}": {
      get: {
        tags: ["Leases"],
        summary: "Get lease",
        description: "Returns a single lease with its member list. Requires at least viewer role.",
        parameters: [{ name: "leaseId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Lease object" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Lease not found" },
        },
      },
      put: {
        tags: ["Leases"],
        summary: "Update lease",
        description: "Updates lease fields. Requires at least editor role.",
        parameters: [{ name: "leaseId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  vehicle_make: { type: "string" },
                  vehicle_model: { type: "string" },
                  vehicle_year: { type: "integer" },
                  lease_start_date: { type: "string", format: "date" },
                  lease_end_date: { type: "string", format: "date" },
                  allowed_miles_per_year: { type: "integer" },
                  overage_cost_per_mile: { type: "number" },
                  monthly_payment: { type: "number" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Updated lease" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Lease not found" },
        },
      },
      delete: {
        tags: ["Leases"],
        summary: "Delete lease",
        description: "Soft-deletes a lease (sets is_active = false). Only the lease owner may delete.",
        parameters: [{ name: "leaseId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          204: { description: "Deleted" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Lease not found" },
        },
      },
    },

    // ─── Members ──────────────────────────────────────────────────────────
    "/api/leases/{leaseId}/members": {
      get: {
        tags: ["Members"],
        summary: "List members",
        description: "Returns all members of the lease including display_name and email. Requires viewer role.",
        parameters: [{ name: "leaseId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Array of lease members" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
        },
      },
      post: {
        tags: ["Members"],
        summary: "Invite member",
        description: "Invites a registered user (by email) to the lease. Sends a push notification to the invitee. Requires owner role.",
        parameters: [{ name: "leaseId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: {
                  email: { type: "string", format: "email" },
                  role: { type: "string", enum: ["viewer", "editor"], default: "viewer" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Created member record" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "User not found" },
          409: { description: "User is already a member" },
        },
      },
    },
    "/api/leases/{leaseId}/members/accept": {
      post: {
        tags: ["Members"],
        summary: "Accept invitation",
        description: "Accepts an outstanding invitation for the current user by setting accepted_at = NOW().",
        parameters: [{ name: "leaseId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Accepted member record" },
          401: { description: "Unauthorized" },
          404: { description: "Invitation not found" },
          409: { description: "Invitation already accepted" },
        },
      },
    },
    "/api/leases/{leaseId}/members/{userId}/role": {
      patch: {
        tags: ["Members"],
        summary: "Update member role",
        description: "Updates the role of an existing member. Owner cannot change their own role. Requires owner role.",
        parameters: [
          { name: "leaseId", in: "path", required: true, schema: { type: "string" } },
          { name: "userId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["role"],
                properties: {
                  role: { type: "string", enum: ["viewer", "editor"] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Updated member record" },
          400: { description: "Cannot change your own role" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Member not found" },
        },
      },
    },
    "/api/leases/{leaseId}/members/{userId}": {
      delete: {
        tags: ["Members"],
        summary: "Remove member",
        description: "Removes a member from the lease. Owner can remove any member; any member can remove themselves. Cannot remove the owner while other members exist.",
        parameters: [
          { name: "leaseId", in: "path", required: true, schema: { type: "string" } },
          { name: "userId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          204: { description: "Removed" },
          400: { description: "Cannot remove owner while other members exist" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Member not found" },
        },
      },
    },

    // ─── Readings ─────────────────────────────────────────────────────────
    "/api/leases/{leaseId}/readings": {
      get: {
        tags: ["Readings"],
        summary: "List odometer readings",
        description: "Returns all odometer readings ordered by reading_date DESC. Supports optional ?limit and ?before filters.",
        parameters: [
          { name: "leaseId", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", description: "Max results to return", schema: { type: "integer", minimum: 1 } },
          { name: "before", in: "query", description: "Only return readings before this date (YYYY-MM-DD)", schema: { type: "string", format: "date" } },
        ],
        responses: {
          200: { description: "Array of odometer readings" },
          400: { description: "Invalid query params" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
        },
      },
      post: {
        tags: ["Readings"],
        summary: "Create odometer reading",
        description: "Records a new odometer reading. Must be >= starting_odometer, on or after lease start date, and not go backward. Requires editor role.",
        parameters: [{ name: "leaseId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["odometer", "reading_date"],
                properties: {
                  odometer: { type: "integer", example: 15000 },
                  reading_date: { type: "string", format: "date", example: "2025-06-01" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Created reading" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Lease not found" },
        },
      },
    },
    "/api/leases/{leaseId}/readings/{readingId}": {
      put: {
        tags: ["Readings"],
        summary: "Update reading",
        description: "Updates an existing odometer reading. odometer must still pass min and ordering validations. Requires editor role.",
        parameters: [
          { name: "leaseId", in: "path", required: true, schema: { type: "string" } },
          { name: "readingId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  odometer: { type: "integer" },
                  reading_date: { type: "string", format: "date" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Updated reading" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Reading not found" },
        },
      },
      delete: {
        tags: ["Readings"],
        summary: "Delete reading",
        description: "Deletes a reading and recomputes the lease's current_odometer cache. Requires editor role.",
        parameters: [
          { name: "leaseId", in: "path", required: true, schema: { type: "string" } },
          { name: "readingId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          204: { description: "Deleted" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Reading not found" },
        },
      },
    },

    // ─── Trips ────────────────────────────────────────────────────────────
    "/api/leases/{leaseId}/trips": {
      get: {
        tags: ["Trips"],
        summary: "List saved trips",
        description: "Returns all saved trips separated into active and completed, ordered by trip_date ASC NULLS LAST.",
        parameters: [{ name: "leaseId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "{ active: Trip[], completed: Trip[] }",
          },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
        },
      },
      post: {
        tags: ["Trips"],
        summary: "Create saved trip",
        description: "Creates a new saved trip. estimated_miles must be >= 1. Requires editor role.",
        parameters: [{ name: "leaseId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "estimated_miles"],
                properties: {
                  name: { type: "string", example: "Annual road trip" },
                  estimated_miles: { type: "integer", minimum: 1, example: 500 },
                  trip_date: { type: "string", format: "date" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Created trip" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
        },
      },
    },
    "/api/leases/{leaseId}/trips/{tripId}": {
      put: {
        tags: ["Trips"],
        summary: "Update trip",
        description: "Updates an existing trip. Updatable: name, estimated_miles, trip_date, notes, is_completed. Requires editor role.",
        parameters: [
          { name: "leaseId", in: "path", required: true, schema: { type: "string" } },
          { name: "tripId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  estimated_miles: { type: "integer", minimum: 1 },
                  trip_date: { type: "string", format: "date" },
                  notes: { type: "string" },
                  is_completed: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Updated trip" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Trip not found" },
        },
      },
      delete: {
        tags: ["Trips"],
        summary: "Delete trip",
        description: "Deletes a saved trip. Requires editor role.",
        parameters: [
          { name: "leaseId", in: "path", required: true, schema: { type: "string" } },
          { name: "tripId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          204: { description: "Deleted" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Trip not found" },
        },
      },
    },

    // ─── Alerts ───────────────────────────────────────────────────────────
    "/api/leases/{leaseId}/alerts": {
      get: {
        tags: ["Alerts"],
        summary: "List alert configs",
        description: "Returns all alert configs for the lease ordered by created_at ASC. Requires viewer role.",
        parameters: [{ name: "leaseId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Array of alert configs" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
        },
      },
      post: {
        tags: ["Alerts"],
        summary: "Create alert config",
        description: "Creates a custom alert config for the lease. Requires editor role.",
        parameters: [{ name: "leaseId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["alert_type", "threshold_value"],
                properties: {
                  alert_type: { type: "string", example: "mileage_pace" },
                  threshold_value: { type: "number", example: 90 },
                  is_enabled: { type: "boolean", default: true },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Created alert config" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
        },
      },
    },
    "/api/leases/{leaseId}/alerts/{alertId}": {
      put: {
        tags: ["Alerts"],
        summary: "Update alert config",
        description: "Toggles is_enabled and/or adjusts threshold_value. Requires editor role.",
        parameters: [
          { name: "leaseId", in: "path", required: true, schema: { type: "string" } },
          { name: "alertId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  is_enabled: { type: "boolean" },
                  threshold_value: { type: "number" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Updated alert config" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Alert config not found" },
        },
      },
      delete: {
        tags: ["Alerts"],
        summary: "Delete alert config",
        description: "Deletes an alert config. Requires editor role.",
        parameters: [
          { name: "leaseId", in: "path", required: true, schema: { type: "string" } },
          { name: "alertId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          204: { description: "Deleted" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Alert config not found" },
        },
      },
    },

    // ─── Analytics ────────────────────────────────────────────────────────
    "/api/leases/{leaseId}/summary": {
      get: {
        tags: ["Analytics"],
        summary: "Lease summary",
        description: "Returns computed analytics: mileage, pace, projections, and trip-reservation totals. Requires viewer role.",
        parameters: [{ name: "leaseId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Lease summary object" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Lease not found" },
        },
      },
    },
    "/api/leases/{leaseId}/buyback-analysis": {
      get: {
        tags: ["Analytics"],
        summary: "Buyback analysis",
        description: "Compares the cost of paying overage miles at turn-in vs. purchasing them now at the dealer's buyback rate.",
        parameters: [
          { name: "leaseId", in: "path", required: true, schema: { type: "string" } },
          {
            name: "dealer_buyback_rate",
            in: "query",
            required: true,
            description: "Per-mile buyback price offered by dealer",
            schema: { type: "number", example: 0.15 },
          },
        ],
        responses: {
          200: { description: "Buyback analysis result" },
          400: { description: "Missing or invalid query param" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Lease not found" },
        },
      },
    },
    "/api/leases/{leaseId}/end-options": {
      get: {
        tags: ["Analytics"],
        summary: "Lease-end options",
        description: "Models costs for three end-of-lease scenarios (return, buyout, roll) and returns the lowest-cost recommendation.",
        parameters: [
          { name: "leaseId", in: "path", required: true, schema: { type: "string" } },
          {
            name: "residual_value",
            in: "query",
            required: true,
            description: "Vehicle purchase price offered at end of lease",
            schema: { type: "number" },
          },
          {
            name: "new_monthly_payment",
            in: "query",
            required: true,
            description: "Hypothetical monthly payment for a new lease",
            schema: { type: "number" },
          },
        ],
        responses: {
          200: { description: "End-option costs and recommendation" },
          400: { description: "Missing or invalid query params" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Lease not found" },
        },
      },
    },
    "/api/leases/{leaseId}/mileage-history": {
      get: {
        tags: ["Analytics"],
        summary: "Mileage history",
        description: "Returns a monthly mileage summary suitable for charting, covering lease_start_date through the earlier of today and lease_end_date.",
        parameters: [{ name: "leaseId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Array of monthly mileage entries" },
          401: { description: "Unauthorized" },
          403: { description: "Forbidden" },
          404: { description: "Lease not found" },
        },
      },
    },

    // ─── Subscriptions ────────────────────────────────────────────────────
    "/api/subscriptions/status": {
      get: {
        tags: ["Subscriptions"],
        summary: "Get subscription status",
        description: "Returns current subscription status for the authenticated user.",
        responses: {
          200: { description: "Subscription status" },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/api/subscriptions/apple/verify": {
      post: {
        tags: ["Subscriptions"],
        summary: "Verify Apple receipt",
        description: "Verifies an Apple App Store receipt, upserts the subscription record, and upgrades the user's tier to premium.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["receipt_data", "product_id"],
                properties: {
                  receipt_data: { type: "string" },
                  product_id: { type: "string", example: "com.example.premium_monthly" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "{ is_active, expires_at, product_id }" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/api/subscriptions/google/verify": {
      post: {
        tags: ["Subscriptions"],
        summary: "Verify Google Play purchase",
        description: "Verifies a Google Play purchase token, upserts the subscription record, and upgrades the user's tier to premium.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["product_id", "purchase_token"],
                properties: {
                  product_id: { type: "string" },
                  purchase_token: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "{ is_active, expires_at, product_id }" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/api/subscriptions/apple/webhook": {
      post: {
        tags: ["Subscriptions"],
        summary: "Apple App Store webhook",
        description: "Receives signed JWT (JWS) notifications from Apple's App Store Server for events such as renewals and cancellations. Always returns 200.",
        security: [],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { signedPayload: { type: "string" } },
              },
            },
          },
        },
        responses: {
          200: { description: "Acknowledged" },
        },
      },
    },
    "/api/subscriptions/google/webhook": {
      post: {
        tags: ["Subscriptions"],
        summary: "Google Play Pub/Sub webhook",
        description: "Receives Pub/Sub push notifications from Google Play billing. Always returns 200.",
        security: [],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "object",
                    properties: { data: { type: "string", description: "base64-encoded DeveloperNotification" } },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Acknowledged" },
        },
      },
    },

    // ─── Internal ─────────────────────────────────────────────────────────
    "/api/internal/trigger-alerts": {
      post: {
        tags: ["Internal"],
        summary: "Trigger alert evaluator",
        description: "Runs the alert evaluator job. Protected by the x-internal-key header.",
        security: [],
        parameters: [
          {
            name: "x-internal-key",
            in: "header",
            required: true,
            description: "Must match the INTERNAL_API_KEY environment variable",
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "{ ok: true }" },
          401: { description: "Invalid or missing internal key" },
        },
      },
    },
  },
};

const swaggerRouter = Router();
// setup must be registered before serve so it handles GET / directly.
// If serve runs first, express.static redirects /api-docs → /api-docs/ using an
// absolute path that strips the gateway prefix from the Location header.
swaggerRouter.get("/", swaggerUi.setup(swaggerDocument));
swaggerRouter.use(swaggerUi.serve);

export default swaggerRouter;
