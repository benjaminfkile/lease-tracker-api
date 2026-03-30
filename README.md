# lease-tracker-api

REST API powering the **LeaseTracker** mobile app. Built with Node.js, TypeScript, and Express; backed by PostgreSQL (via Knex) and secured with AWS Cognito JWT authentication.

## Table of Contents

- [Project Purpose & Feature Scope](#project-purpose--feature-scope)
- [Environment Variables](#environment-variables)
- [Local Development Setup](#local-development-setup)
- [Running Migrations in Production](#running-migrations-in-production)
- [Standalone EC2 Deployment](#standalone-ec2-deployment)
- [Gateway Deployment](#gateway-deployment)
- [API Endpoint Reference](#api-endpoint-reference)

---

## Project Purpose & Feature Scope

LeaseTracker helps car-lease holders monitor and manage every aspect of their lease in one place.

| Feature | Description |
|---------|-------------|
| **Lease management** | Create, update, and delete car leases; track make, model, year, mileage allowance, dates, and payment details |
| **Odometer readings** | Log and review odometer readings over time to track mileage consumption |
| **Mileage analytics** | Projected overage/underage, pace analysis, buyback analysis, and end-of-lease option recommendations |
| **Saved trips** | Plan upcoming trips and factor them into remaining mileage projections |
| **Alert configurations** | Per-lease alerts for mileage thresholds, over-pace driving, and days remaining |
| **Lease sharing** | Invite other users to a lease as viewers or co-managers via a role-based membership system |
| **Push notifications** | Apple APNs and Firebase FCM push notifications via AWS SNS |
| **Subscriptions** | Apple App Store and Google Play in-app purchase verification and lifecycle webhook handling |
| **User management** | Cognito-backed user accounts with display names and push-token registration |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values before starting the server.

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | HTTP port the server listens on. Defaults to `3005`. |
| `NODE_ENV` | Yes | Runtime environment (`development`, `test`, or `production`). |
| `IS_LOCAL` | No | Set to `true` to enable local mode (reads secrets from env vars instead of AWS Secrets Manager, opens CORS, enables verbose logging). |
| `ALLOWED_ORIGINS` | No* | Comma-separated list of allowed CORS origins in non-local mode. *Required when `IS_LOCAL` is not `true`. |
| `AWS_REGION` | Yes | AWS region for all AWS SDK calls (e.g. `us-east-1`). |
| `AWS_SECRET_ARN` | No* | ARN of the AWS Secrets Manager secret that holds app-level configuration. *Required in non-local mode. |
| `AWS_DB_SECRET_ARN` | No* | ARN of the AWS Secrets Manager secret that holds database credentials. *Required in non-local mode. |
| `AWS_PUSH_SECRET_ARN` | No* | ARN of the AWS Secrets Manager secret that holds APNs and FCM SNS platform application ARNs. *Required for push notifications. |
| `COGNITO_USER_POOL_ID` | Yes | AWS Cognito user pool ID (e.g. `us-east-1_XXXXXXXX`). |
| `COGNITO_CLIENT_ID` | Yes | AWS Cognito app client ID. |
| `DB_HOST` | Yes | PostgreSQL host. |
| `DB_PORT` | No | PostgreSQL port. Defaults to `5432`. |
| `DB_NAME` | Yes | PostgreSQL database name. |
| `DB_USER` | Yes | PostgreSQL username. |
| `DB_PASSWORD` | Yes | PostgreSQL password. |
| `INTERNAL_API_KEY` | Yes | Secret key required to call internal endpoints (e.g. trigger alert jobs). |

---

## Local Development Setup

### Prerequisites

- Node.js ≥ 20
- PostgreSQL ≥ 14 running locally (or via Docker)
- AWS credentials configured if using real Cognito (or mock appropriately in tests)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/benjaminfkile/lease-tracker-api.git
cd lease-tracker-api

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — at minimum set DB_HOST, DB_NAME, DB_USER, DB_PASSWORD,
# COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, and INTERNAL_API_KEY.
# Set IS_LOCAL=true to skip AWS Secrets Manager lookups.

# 4. Run database migrations
npx knex migrate:latest --env development

# 5. (Optional) Seed development data
npx knex seed:run --env development

# 6. Start the development server (TypeScript watch mode)
npm run dev
```

The server will be available at `http://localhost:3005` (or the port set in `.env`).

### Other Useful Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Build then start the compiled server |
| `npm test` | Run the Jest test suite |
| `npx knex migrate:rollback --env development` | Roll back the last migration batch |
| `npx knex migrate:status --env development` | Show migration status |

---

## Running Migrations in Production

Migrations are managed by Knex and must be run **before** deploying a new version of the API that depends on schema changes.

> **Note:** In production the API reads database credentials from AWS Secrets Manager. Export the required environment variables before running Knex commands on the production host.

```bash
# On the EC2 instance (or in a one-off ECS task / deployment pipeline step):

export NODE_ENV=production
export DB_HOST=<rds-endpoint>
export DB_PORT=5432
export DB_NAME=<db-name>
export DB_USER=<db-user>
export DB_PASSWORD=<db-password>

npx knex migrate:latest --env production
```

To roll back the most recent migration batch:

```bash
npx knex migrate:rollback --env production
```

---

## Standalone EC2 Deployment

The API ships as a Docker image built by the included `dockerfile`.

### Build the image

```bash
docker build \
  --build-arg AWS_REGION=us-east-1 \
  --build-arg AWS_SECRET_ARN=<arn> \
  --build-arg AWS_DB_SECRET_ARN=<arn> \
  --build-arg NODE_ENVIRONMENT=production \
  -t lease-tracker-api:latest .
```

### Run the container

```bash
docker run -d \
  --name lease-tracker-api \
  -p 3005:3005 \
  --restart unless-stopped \
  lease-tracker-api:latest
```

The API listens on port **3005** inside the container and is mapped to port **3005** on the host. Ensure that the EC2 security group allows inbound traffic on port 3005 (or 443/80 if fronted by a load balancer).

### IAM requirements

The EC2 instance profile (or the ECS task role) must have IAM permissions to:

- `secretsmanager:GetSecretValue` on `AWS_SECRET_ARN` and `AWS_DB_SECRET_ARN`
- `secretsmanager:GetSecretValue` on `AWS_PUSH_SECRET_ARN` (for push notifications)
- `sns:Publish` to the APNs and FCM SNS platform application ARNs

---

## Gateway Deployment

When deployed behind **bk-gateway-api**, the lease-tracker-api runs on its own port and the gateway proxies requests to it.

| Mode | Port | Notes |
|------|------|-------|
| Standalone / direct EC2 | **3005** | Access the API directly at `http://<ec2-host>:3005` |
| Behind bk-gateway-api | **4005** | Gateway listens on 4005 and forwards to the API on 3005 internally |

Set `ALLOWED_ORIGINS` to include the gateway's public domain so CORS allows requests originating from the gateway or the mobile app:

```
ALLOWED_ORIGINS=https://your-gateway-domain.com,https://your-other-allowed-origin.com
```

The API itself is gateway-agnostic — it does not require or detect the presence of a gateway. Both deployment modes use the same Docker image and the same environment variable configuration.

---

## API Endpoint Reference

All routes except `/` and `/api/health` require a valid **Cognito access token** in the `Authorization: Bearer <token>` header.

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | No | Returns API status and DB connectivity |

### Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/users/me` | Yes | Get authenticated user's profile |
| `PUT` | `/api/users/me` | Yes | Update display name and/or push token |
| `PATCH` | `/api/users/me/push-token` | Yes | Update push token only |
| `DELETE` | `/api/users/me` | Yes | Hard-delete the authenticated user and all related data |

### Leases

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/leases` | Yes | List all leases for the authenticated user |
| `POST` | `/api/leases` | Yes | Create a new lease |
| `GET` | `/api/leases/:leaseId` | Yes | Get a single lease with its members |
| `PUT` | `/api/leases/:leaseId` | Yes | Update a lease |
| `DELETE` | `/api/leases/:leaseId` | Yes | Delete a lease |
| `GET` | `/api/leases/:leaseId/summary` | Yes | Get lease mileage summary |
| `GET` | `/api/leases/:leaseId/mileage-history` | Yes | Get mileage history over time |
| `GET` | `/api/leases/:leaseId/buyback-analysis` | Yes | Get buyback cost analysis |
| `GET` | `/api/leases/:leaseId/end-options` | Yes | Get end-of-lease option recommendations |

### Lease Members (Sharing)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/leases/:leaseId/members` | Yes | List members of a lease |
| `POST` | `/api/leases/:leaseId/members` | Yes | Invite a user to the lease |
| `POST` | `/api/leases/:leaseId/members/accept` | Yes | Accept a lease invitation |
| `PUT` | `/api/leases/:leaseId/members/:userId/role` | Yes | Update a member's role |
| `DELETE` | `/api/leases/:leaseId/members/:userId` | Yes | Remove a member from the lease |

### Odometer Readings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/leases/:leaseId/readings` | Yes | List odometer readings for a lease |
| `POST` | `/api/leases/:leaseId/readings` | Yes | Add an odometer reading |
| `PUT` | `/api/leases/:leaseId/readings/:readingId` | Yes | Update an odometer reading |
| `DELETE` | `/api/leases/:leaseId/readings/:readingId` | Yes | Delete an odometer reading |

### Saved Trips

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/leases/:leaseId/trips` | Yes | List saved trips for a lease |
| `POST` | `/api/leases/:leaseId/trips` | Yes | Create a saved trip |
| `PUT` | `/api/leases/:leaseId/trips/:tripId` | Yes | Update a saved trip |
| `DELETE` | `/api/leases/:leaseId/trips/:tripId` | Yes | Delete a saved trip |

### Alert Configurations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/leases/:leaseId/alerts` | Yes | List alert configs for a lease |
| `POST` | `/api/leases/:leaseId/alerts` | Yes | Create an alert config |
| `PUT` | `/api/leases/:leaseId/alerts/:alertId` | Yes | Update an alert config |
| `DELETE` | `/api/leases/:leaseId/alerts/:alertId` | Yes | Delete an alert config |

### Subscriptions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/subscriptions/status` | Yes | Get the authenticated user's subscription status |
| `POST` | `/api/subscriptions/apple/verify` | Yes | Verify an Apple App Store receipt |
| `POST` | `/api/subscriptions/google/verify` | Yes | Verify a Google Play purchase token |
| `POST` | `/api/subscriptions/apple/webhook` | No | Receive Apple App Store server notifications |
| `POST` | `/api/subscriptions/google/webhook` | No | Receive Google Play Pub/Sub notifications |

### Internal

> These endpoints are not part of the public API. They require the `x-internal-api-key` header set to the value of the `INTERNAL_API_KEY` environment variable.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/internal/trigger-alerts` | API key | Evaluate and dispatch pending lease alerts |
