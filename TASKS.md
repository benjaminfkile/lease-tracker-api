# lease-tracker-api — Task List

## Overview

This document tracks every task required to bring `lease-tracker-api` to a fully
functional, production-deployable state.

**Deployment targets:**
- Standalone on its own EC2 (direct URL) — always supported, no gateway dependency
- Behind `bk-gateway-api` (port 3005 / dev port 4005) — transparent proxy, auth
  middleware works identically either way

**Auth strategy:** Amazon Cognito — the API verifies Cognito-issued JWTs on every
protected route. It never stores passwords.

**Database:** Existing PostgreSQL instance. Migrations managed with Knex CLI.

---

## Database Schema Design

All migrations must be applied in order. Run locally with `knex migrate:latest`.

### `users`
```
id                    UUID PK  DEFAULT gen_random_uuid()
cognito_user_id       VARCHAR(255) UNIQUE NOT NULL   -- Cognito sub claim
email                 VARCHAR(255) UNIQUE NOT NULL
display_name          VARCHAR(100)
subscription_tier     VARCHAR(20)  DEFAULT 'free'    -- 'free' | 'premium'
subscription_expires_at TIMESTAMPTZ
push_token            VARCHAR(500)                   -- APNs / FCM device token
created_at            TIMESTAMPTZ DEFAULT NOW()
updated_at            TIMESTAMPTZ DEFAULT NOW()
```

### `leases`
```
id                    UUID PK
user_id               UUID FK → users(id) ON DELETE CASCADE
display_name          VARCHAR(150) NOT NULL           -- "2024 Honda Accord"
make                  VARCHAR(100)
model                 VARCHAR(100)
year                  SMALLINT
trim                  VARCHAR(100)
color                 VARCHAR(50)
vin                   VARCHAR(17)
license_plate         VARCHAR(20)
lease_start_date      DATE NOT NULL
lease_end_date        DATE NOT NULL
total_miles_allowed   INTEGER NOT NULL                -- total for full term
miles_per_year        INTEGER NOT NULL
starting_odometer     INTEGER NOT NULL DEFAULT 0
current_odometer      INTEGER                        -- cached from latest reading
overage_cost_per_mile DECIMAL(6,4) NOT NULL          -- e.g. 0.25
monthly_payment       DECIMAL(10,2)
dealer_name           VARCHAR(150)
dealer_phone          VARCHAR(30)
contract_number       VARCHAR(100)
notes                 TEXT
is_active             BOOLEAN DEFAULT TRUE
created_at            TIMESTAMPTZ DEFAULT NOW()
updated_at            TIMESTAMPTZ DEFAULT NOW()
```

### `odometer_readings`
```
id            UUID PK
lease_id      UUID FK → leases(id) ON DELETE CASCADE
user_id       UUID FK → users(id) ON DELETE CASCADE   -- who logged it
odometer      INTEGER NOT NULL
reading_date  DATE NOT NULL
notes         TEXT
source        VARCHAR(20) DEFAULT 'manual'            -- 'manual' | 'photo_ocr' | 'obd'
created_at    TIMESTAMPTZ DEFAULT NOW()

INDEX: (lease_id, reading_date)
```

### `saved_trips`
```
id               UUID PK
lease_id         UUID FK → leases(id) ON DELETE CASCADE
user_id          UUID FK → users(id) ON DELETE CASCADE
name             VARCHAR(150) NOT NULL
estimated_miles  INTEGER NOT NULL
trip_date        DATE
notes            TEXT
is_completed     BOOLEAN DEFAULT FALSE
created_at       TIMESTAMPTZ DEFAULT NOW()
updated_at       TIMESTAMPTZ DEFAULT NOW()

INDEX: (lease_id)
```

### `alert_configs`
```
id               UUID PK
lease_id         UUID FK → leases(id) ON DELETE CASCADE
user_id          UUID FK → users(id) ON DELETE CASCADE
alert_type       VARCHAR(50) NOT NULL
                 -- 'miles_threshold' | 'over_pace' | 'days_remaining' | 'trip_upcoming'
threshold_value  INTEGER     -- e.g. 80 (percent), 30 (days)
is_enabled       BOOLEAN DEFAULT TRUE
last_sent_at     TIMESTAMPTZ
created_at       TIMESTAMPTZ DEFAULT NOW()
```

### `subscriptions`
```
id               UUID PK
user_id          UUID FK → users(id) ON DELETE CASCADE
platform         VARCHAR(10) NOT NULL       -- 'ios' | 'android'
product_id       VARCHAR(200) NOT NULL
transaction_id   VARCHAR(500)
purchase_token   TEXT
is_active        BOOLEAN DEFAULT TRUE
expires_at       TIMESTAMPTZ
environment      VARCHAR(20)               -- 'sandbox' | 'production'
raw_receipt      TEXT
created_at       TIMESTAMPTZ DEFAULT NOW()
updated_at       TIMESTAMPTZ DEFAULT NOW()
```

### `lease_members`  _(shared leases / multiple drivers)_
```
id           UUID PK
lease_id     UUID FK → leases(id) ON DELETE CASCADE
user_id      UUID FK → users(id) ON DELETE CASCADE
role         VARCHAR(20) DEFAULT 'viewer'   -- 'owner' | 'editor' | 'viewer'
invited_by   UUID FK → users(id)
accepted_at  TIMESTAMPTZ
created_at   TIMESTAMPTZ DEFAULT NOW()

UNIQUE (lease_id, user_id)
INDEX: (user_id)
```

---

## Phase 1 — Project Infrastructure

- [ ] **1.1 Install missing npm dependencies**
  - `npm install zod aws-jwt-verify uuid`
  - `npm install -D @types/uuid`
  - `zod` — request body validation
  - `aws-jwt-verify` — AWS-maintained Cognito JWT verification (no jsonwebtoken)
  - `uuid` — where app-level UUID generation is needed (most UUIDs use `gen_random_uuid()` in DB)

- [ ] **1.2 Create `knexfile.ts`**
  - Reads connection config from environment variables only (no Secrets Manager at build time so CI can run migrations)
  - Exports `development`, `test`, and `production` environments
  - Migration directory: `src/db/migrations/`
  - Seed directory: `src/db/seeds/`

- [ ] **1.3 Create `.env.example`**
  ```
  PORT=3005
  NODE_ENV=development
  IS_LOCAL=true
  AWS_REGION=us-east-1
  AWS_SECRET_ARN=
  AWS_DB_SECRET_ARN=
  COGNITO_USER_POOL_ID=us-east-1_XXXXXXXX
  COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXX
  DB_HOST=
  DB_PORT=5432
  DB_NAME=
  DB_USER=
  DB_PASSWORD=
  ```

- [ ] **1.4 Complete `index.ts` startup sequence**
  - Load secrets from Secrets Manager (or `.env` in local via `dotenv`)
  - Call `initDb(dbSecrets, appSecrets, env)`
  - Start Express server on `PORT`
  - Graceful shutdown handler (SIGTERM / SIGINT) that closes the Knex pool

- [ ] **1.5 Enable helmet in `app.ts`**
  - Uncomment the `helmet` import
  - Apply `app.use(helmet())` before all routes
  - Add production CORS config (allow gateway domain + any direct EC2 domain)

---

## Phase 2 — Database Migrations

- [ ] **2.1 Create migration: `users` table**

- [ ] **2.2 Create migration: `leases` table**

- [ ] **2.3 Create migration: `odometer_readings` table**
  - Include composite index on `(lease_id, reading_date)`

- [ ] **2.4 Create migration: `saved_trips` table**

- [ ] **2.5 Create migration: `alert_configs` table**

- [ ] **2.6 Create migration: `subscriptions` table**

- [ ] **2.7 Create migration: `lease_members` table**

- [ ] **2.8 Add updated_at trigger function**
  - Create a reusable Postgres function `set_updated_at()` and apply it as a trigger
    to all tables that have an `updated_at` column so it is automatically maintained

- [ ] **2.9 Create dev seed file**
  - One user, two leases (one active, one near end), 10 odometer readings each,
    two saved trips, default alert configs — enough to develop against without
    manually inserting data

---

## Phase 3 — Auth Middleware (Cognito)

- [ ] **3.1 Create Cognito verifier helper — `src/auth/cognitoVerifier.ts`**
  - Use `CognitoJwtVerifier` from `aws-jwt-verify`
  - Reads `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID` from env
  - Export a singleton verifier instance (cached JWKS)

- [ ] **3.2 Create `requireAuth` middleware — `src/middleware/requireAuth.ts`**
  - Extract `Authorization: Bearer <token>` from header
  - Verify with the Cognito verifier
  - Attach decoded claims as `req.cognitoUser` (`{ sub, email, ... }`)
  - 401 if header missing or token invalid
  - 403 if token expired (let the client refresh and retry)
  - Works identically whether called directly or through the gateway

- [ ] **3.3 Create `upsertUser` helper — `src/db/users.ts`**
  - On first authenticated request, INSERT the Cognito user into `users` table
    using `ON CONFLICT (cognito_user_id) DO UPDATE SET email=...`
  - Attach full `users` row as `req.dbUser` for use in route handlers
  - Called as part of every protected route (combine with `requireAuth` in a
    `authAndLoad` composed middleware)

- [ ] **3.4 Create `requireRole` lease-access guard — `src/middleware/requireLeaseAccess.ts`**
  - Given `:leaseId` in params, verify the authenticated user is in `lease_members`
    with sufficient role (`viewer` | `editor` | `owner`)
  - 404 if lease not found, 403 if user is not a member
  - Accept minimum required role as parameter: `requireLeaseAccess('editor')`

---

## Phase 4 — User Endpoints

- [ ] **4.1 `GET /api/users/me`**
  - Returns the authenticated user from the `users` table
  - Creates the user row if this is their first request (upsert via `upsertUser`)
  - Response includes `{ id, email, display_name, subscription_tier, subscription_expires_at }`

- [ ] **4.2 `PUT /api/users/me`**
  - Update `display_name`, `push_token`
  - Validate with Zod; ignore unknown fields

- [ ] **4.3 `PATCH /api/users/me/push-token`**
  - Lightweight endpoint called on app launch to keep the push token fresh
  - Body: `{ push_token: string }`

- [ ] **4.4 `DELETE /api/users/me`**
  - Hard-delete the user row; cascade deletes all leases, readings, trips, alerts
    via FK constraints
  - Require a confirmation body `{ confirm: "DELETE" }` to prevent accidents
  - GDPR-ready: all personal data removed

---

## Phase 5 — Lease Endpoints

- [ ] **5.1 `GET /api/leases`**
  - Return all active leases for the authenticated user (owned + shared via `lease_members`)
  - Include `role` of the requesting user per lease
  - Order by `lease_end_date ASC` (soonest ending first)

- [ ] **5.2 `POST /api/leases`**
  - Validate body with `CreateLeaseSchema` (Zod)
  - Insert into `leases` table
  - Auto-create an `owner` record in `lease_members`
  - Create default alert configs: `miles_threshold` at 80%, `over_pace`, `days_remaining` at 30

- [ ] **5.3 `GET /api/leases/:id`**
  - Return a single lease with member list
  - Uses `requireLeaseAccess('viewer')`

- [ ] **5.4 `PUT /api/leases/:id`**
  - Update lease fields
  - Uses `requireLeaseAccess('editor')`
  - Validate with `UpdateLeaseSchema`

- [ ] **5.5 `DELETE /api/leases/:id`**
  - Soft-delete: set `is_active = false` (preserves history)
  - Only `owner` role can delete
  - Uses `requireLeaseAccess('owner')`

- [ ] **5.6 `GET /api/leases/:id/summary`** _(core business logic)_
  - Computed analytics endpoint. Returns:
    ```
    miles_driven              = current_odometer - starting_odometer
    miles_remaining           = total_miles_allowed - miles_driven - reserved_trip_miles
    days_elapsed              = today - lease_start_date
    days_remaining            = lease_end_date - today
    lease_length_days         = lease_end_date - lease_start_date
    expected_miles_to_date    = (total_miles_allowed / lease_length_days) * days_elapsed
    current_pace_per_month    = (miles_driven / days_elapsed) * 30.44
    pace_status               = 'ahead' | 'on_track' | 'behind'
    miles_over_under_pace     = miles_driven - expected_miles_to_date  (+ = over)
    projected_miles_at_end    = (miles_driven / days_elapsed) * lease_length_days
    projected_overage         = max(0, projected_miles_at_end - total_miles_allowed)
    projected_overage_cost    = projected_overage * overage_cost_per_mile
    recommended_daily_miles   = miles_remaining / days_remaining
    reserved_trip_miles       = SUM of active saved_trips.estimated_miles
    is_premium                = subscription_tier === 'premium'
    ```
  - Extract all calculation logic into `src/utils/leaseCalculations.ts` (pure
    functions — no DB calls) so they are easily unit-testable

---

## Phase 6 — Odometer Reading Endpoints

- [ ] **6.1 `GET /api/leases/:id/readings`**
  - Return all readings ordered by `reading_date DESC`
  - Support `?limit=` and `?before=<date>` query params for pagination
  - Uses `requireLeaseAccess('viewer')`

- [ ] **6.2 `POST /api/leases/:id/readings`**
  - Validate that `odometer >= starting_odometer`
  - Validate that `odometer >= previous_max_odometer` (no going backward)
  - Validate `reading_date >= lease_start_date`
  - After insert, update `leases.current_odometer` cache to the new value
    (only if it is the new maximum)
  - Uses `requireLeaseAccess('editor')`

- [ ] **6.3 `PUT /api/leases/:id/readings/:readingId`**
  - Edit notes and `reading_date` freely; editing `odometer` must still pass
    the ordering and minimum validations
  - Re-compute `current_odometer` cache after update (use `MAX(odometer)`)
  - Uses `requireLeaseAccess('editor')`

- [ ] **6.4 `DELETE /api/leases/:id/readings/:readingId`**
  - Delete reading, then recompute `current_odometer` as `MAX(odometer)` from
    remaining readings (or `starting_odometer` if no readings left)
  - Uses `requireLeaseAccess('editor')`

---

## Phase 7 — Saved Trips Endpoints

- [ ] **7.1 `GET /api/leases/:id/trips`**
  - Return all trips ordered by `trip_date ASC NULLS LAST`
  - Separate active vs completed in response: `{ active: [], completed: [] }`

- [ ] **7.2 `POST /api/leases/:id/trips`**
  - Validate `estimated_miles >= 1`
  - Uses `requireLeaseAccess('editor')`

- [ ] **7.3 `PUT /api/leases/:id/trips/:tripId`**
  - Update name, miles, date, notes, `is_completed`
  - Uses `requireLeaseAccess('editor')`

- [ ] **7.4 `DELETE /api/leases/:id/trips/:tripId`**
  - Uses `requireLeaseAccess('editor')`

---

## Phase 8 — Alert Configuration Endpoints

- [ ] **8.1 `GET /api/leases/:id/alerts`**
  - Return all alert configs for a lease

- [ ] **8.2 `POST /api/leases/:id/alerts`**
  - Create a custom alert config
  - Uses `requireLeaseAccess('editor')`

- [ ] **8.3 `PUT /api/leases/:id/alerts/:alertId`**
  - Toggle `is_enabled`, adjust `threshold_value`
  - Uses `requireLeaseAccess('editor')`

- [ ] **8.4 `DELETE /api/leases/:id/alerts/:alertId`**
  - Uses `requireLeaseAccess('editor')`

---

## Phase 9 — Lease Sharing (Multiple Drivers)

- [ ] **9.1 `GET /api/leases/:id/members`**
  - List all `lease_members` rows with user `display_name` and `email`

- [ ] **9.2 `POST /api/leases/:id/members`**
  - Invite a user by email
  - Look up invitee in `users` table (must have signed up)
  - Create `lease_members` row with `accepted_at = NULL`
  - Send a push notification if invitee has a `push_token` (or stub email via SES)
  - Uses `requireLeaseAccess('owner')`

- [ ] **9.3 `POST /api/leases/:id/members/accept`**
  - Accepts an outstanding invitation for the current user
  - Sets `accepted_at = NOW()`

- [ ] **9.4 `PATCH /api/leases/:id/members/:userId/role`**
  - Owner can change another member's role

- [ ] **9.5 `DELETE /api/leases/:id/members/:userId`**
  - Owner can remove any member; members can remove themselves (leave)
  - Cannot remove the owner if there are still other members (transfer first)

---

## Phase 10 — Subscription & Tier Management

- [ ] **10.1 `POST /api/subscriptions/apple/verify`**
  - Accept `{ receiptData: string }`
  - Verify with Apple's `verifyReceipt` endpoint (production first, fallback to sandbox)
  - Parse `latest_receipt_info` to determine `expires_date_ms`
  - Upsert into `subscriptions` table
  - Update `users.subscription_tier = 'premium'` and `subscription_expires_at`
  - Return `{ is_active, expires_at, product_id }`

- [ ] **10.2 `POST /api/subscriptions/google/verify`**
  - Accept `{ productId: string, purchaseToken: string }`
  - Verify with Google Play Developer API (`purchases.subscriptions.get`)
  - Upsert into `subscriptions` table and update user tier

- [ ] **10.3 `GET /api/subscriptions/status`**
  - Return current subscription status for authenticated user
  - Re-check expiry against `NOW()` in case the row is stale

- [ ] **10.4 App Store Server Notifications webhook — `POST /api/subscriptions/apple/webhook`**
  - Receive signed JWT notifications from Apple for renewals, cancellations,
    billing retries, grace periods
  - Verify the `signedPayload` with Apple's certificate chain
  - Update `subscriptions.is_active` and `users.subscription_tier` accordingly
  - Returns 200 immediately (Apple retries on non-200)

- [ ] **10.5 Google Play real-time developer notifications — `POST /api/subscriptions/google/webhook`**
  - Receive Pub/Sub push notifications from Google
  - Verify and process `subscriptionNotification` events
  - Update subscription and user tier as appropriate

---

## Phase 11 — Push Notifications

- [ ] **11.1 Create notification service — `src/services/notificationService.ts`**
  - Abstract sender that routes to APNs (iOS) or FCM (Android) based on
    `push_token` prefix or a stored `platform` field on the user
  - Configure via AWS SNS platform application ARNs stored in Secrets Manager
  - `send(userId, title, body, data)` — looks up user's `push_token` → dispatches

- [ ] **11.2 Create alert evaluator job — `src/jobs/alertEvaluator.ts`**
  - For each active lease with `is_enabled` alert configs and a user with a `push_token`:
    - **`miles_threshold`**: compute `(miles_driven / total_miles_allowed * 100)`;
      if >= `threshold_value` and not sent in last 24h → send
    - **`over_pace`**: if `pace_status === 'behind'` and not sent in last 24h → send
    - **`days_remaining`**: if `days_remaining <= threshold_value` and not sent in 24h → send
  - Update `alert_configs.last_sent_at` after each send
  - Pure function that takes a Knex instance so it can be tested without a real DB

- [ ] **11.3 `POST /api/internal/trigger-alerts`**
  - Protected route (uses `protectedRoute` middleware from gateway-api pattern)
  - Triggers `alertEvaluator.run()` — callable by a CloudWatch scheduled event
    or cron Lambda

---

## Phase 12 — Advanced Analytics Endpoints

- [ ] **12.1 `GET /api/leases/:id/buyback-analysis`**
  - Query params: `?dealer_buyback_rate=0.15` (per-mile buyback price offered by dealer)
  - Returns:
    ```
    projected_overage_miles
    cost_if_paying_at_turnin     = projected_overage * overage_cost_per_mile
    cost_if_buying_now           = projected_overage * dealer_buyback_rate
    recommendation               = 'buy_now' | 'pay_at_end' | 'on_track'
    savings                      = cost_if_paying_at_turnin - cost_if_buying_now
    ```

- [ ] **12.2 `GET /api/leases/:id/end-options`**
  - Computes modeled costs for three lease-end scenarios:
    - **Return**: overage miles * overage_cost_per_mile
    - **Buy out**: residual value (user-entered) + costs
    - **Roll to new lease**: remaining months * hypothetical new monthly payment
  - Returns all three with a recommendation based on lowest total cost

- [ ] **12.3 `GET /api/leases/:id/mileage-history`**
  - Return monthly mileage summary for charting
  - Groups `odometer_readings` by calendar month, computes miles driven per month
  - Includes `expected_miles` per month for comparison line

---

## Phase 13 — Input Validation & Error Handling

- [ ] **13.1 Create Zod schemas — `src/validation/schemas.ts`**
  - `CreateLeaseSchema`
  - `UpdateLeaseSchema`
  - `CreateOdometerReadingSchema`
  - `UpdateOdometerReadingSchema`
  - `CreateSavedTripSchema`
  - `UpdateSavedTripSchema`
  - `CreateAlertConfigSchema`
  - `UpdateAlertConfigSchema`
  - `VerifyAppleReceiptSchema`
  - `VerifyGoogleReceiptSchema`
  - `InviteMemberSchema`

- [ ] **13.2 Create `validate` middleware — `src/middleware/validate.ts`**
  - Accepts a Zod schema, validates `req.body`, returns structured 400 with
    field-level Zod error messages on failure

- [ ] **13.3 Create `ApiError` class — `src/utils/ApiError.ts`**
  - `new ApiError(statusCode, message, details?)`
  - Used by route handlers and middleware to signal HTTP errors

- [ ] **13.4 Improve global error handler in `app.ts`**
  - Catch `ApiError` instances → respond with `{ error: true, message, details }`
  - Catch Zod errors (if any bubble up) → 400
  - Catch Knex/pg constraint violations → 409
  - Catch unknown errors → 500, never leak stack trace in production

---

## Phase 14 — Health Endpoint

- [ ] **14.1 Restore DB health check in `GET /api/health`**
  - Re-enable the commented-out DB check in `healthRouter.ts`
  - Guard with a 3-second timeout so a slow DB does not hang the health check

- [ ] **14.2 Enrich health response**
  ```json
  {
    "status": "ok",
    "version": "1.0.0",
    "environment": "production",
    "uptime_seconds": 3600,
    "db": { "connected": true }
  }
  ```

---

## Phase 15 — Testing

- [ ] **15.1 Unit tests — `src/utils/leaseCalculations.ts`**
  - Pace calculation (first day, mid-lease, over limit, no readings)
  - Projected overage rounding edge cases
  - `miles_remaining` respects reserved trip miles
  - `recommended_daily_miles` handles 0 days remaining (lease over)

- [ ] **15.2 Unit tests — auth middleware**
  - Valid Cognito token → 200
  - Expired token → 403
  - Malformed token → 401
  - Missing header → 401
  - Wrong audience → 401

- [ ] **15.3 Integration tests — lease CRUD**
  - Create, read, update, delete lifecycle
  - Access control: user B cannot read user A's lease

- [ ] **15.4 Integration tests — odometer validation**
  - Reject reading below previous max
  - Reject reading below starting odometer
  - Accept first reading
  - `current_odometer` cache is updated correctly

- [ ] **15.5 Integration tests — summary endpoint**
  - Expected values match manual calculation for a seeded lease

- [ ] **15.6 Integration tests — subscriptions**
  - Mock Apple `verifyReceipt` call with jest mock / MSW
  - Active receipt → tier updated to premium
  - Expired receipt → tier stays free

- [ ] **15.7 Configure test database setup in `jest.setup.ts`**
  - Run migrations against a dedicated test DB
  - Reset test DB before each test suite with `knex.migrate.rollback` + `migrate.latest`

---

## Phase 16 — Documentation & Deployment

- [ ] **16.1 Write full `README.md`**
  - Project purpose and feature scope
  - Environment variables table (name, required, description)
  - Local dev setup (clone → install → migrate → seed → run)
  - Running migrations in production
  - Standalone EC2 deployment notes
  - Gateway deployment notes (ports 3005 / 4005)
  - API endpoint reference table

- [ ] **16.2 Write `DEPLOY.md`**
  - Docker build and push to ECR
  - ECS task definition notes
  - Migration runbook (run before deploy)
  - Secrets Manager key names reference
  - CloudWatch alert setup for health endpoint

- [ ] **16.3 Confirm gateway serviceMap entry**
  - `bk-gateway-api/src/config/serviceMap.ts` already has `lease-tracker-api`
    at port 3005 / 4005
  - Set `includeInHealthCheck: true` once health endpoint is complete
  - Verify `Authorization` header passes through `http-proxy-middleware`

---

## Post-MVP / Standout Features

- [ ] **A.1 Annual rollover tracking**
  - Store per-year mileage sub-budgets for multi-year leases
  - The summary endpoint can switch between `full_lease` and `current_year` view

- [ ] **A.2 Mileage buyback calculator** _(see Phase 12.1)_

- [ ] **A.3 Lease-end options comparison** _(see Phase 12.2)_

- [ ] **A.4 Per-driver activity log**
  - When multiple `lease_members` exist, each reading is attributed to the
    member who logged it
  - `GET /api/leases/:id/readings?member=:userId` filters by driver

- [ ] **A.5 Carbon footprint endpoint**
  - Accept `mpg` on the lease; compute estimated CO2 emissions from miles driven
    using EPA emission factor (19.6 lbs CO2/gallon)
  - Return `{ lbs_co2, equivalent_trees }` in the summary or as a separate endpoint

- [ ] **A.6 Lease comparison endpoint**
  - `GET /api/leases/compare?ids=id1,id2` — returns side-by-side summary for
    two or more active leases (for users tracking multiple vehicles)
