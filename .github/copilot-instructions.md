# lease-tracker-api — Copilot Coding Agent Instructions

## Project Overview
Node.js/TypeScript Express REST API for the LeaseTracker mobile app. Deployed on AWS EC2,
either standalone or behind `bk-gateway-api`. Manages car lease data, odometer readings,
mileage analytics, push notifications, and Apple/Google subscriptions.

## Tech Stack
- **Runtime:** Node.js, TypeScript, Express
- **Database:** PostgreSQL via Knex (migrations in `src/db/migrations/`)
- **Auth:** Amazon Cognito — JWT verification with `aws-jwt-verify` (never `jsonwebtoken`)
- **Validation:** Zod schemas in `src/validation/schemas.ts`
- **Tests:** Jest + Supertest (`npm test`)
- **Build:** `npm run build` (compiles TypeScript to `dist/`)

## Branch & PR Rules — CRITICAL
- **Always base your branch off `dev`.** Never branch from `main`.
- **All PRs must target `dev`.** Never open a PR targeting `main`.
- `main` is production-only and is never a valid PR target under any circumstances.

## Standing Rules
- All existing unit and integration tests must continue to pass.
- New tests must be added for all new and modified code, matching the style of existing test files, achieving 90–95%+ coverage.
- Run `npm run build` after completing changes to confirm zero TypeScript errors.
- Run `npm test` after completing changes to confirm all tests pass.
- Never hardcode secrets, credentials, or environment-specific values — use environment variables or AWS Secrets Manager references only.
- The API must work standalone (direct EC2) **and** behind `bk-gateway-api` — do not introduce any gateway dependency.
- Knex migrations must be non-destructive and include both `up` and `down` functions.
- All protected routes must use the `requireAuth` middleware. Never skip auth on a route that reads or writes user data.
- Infrastructure tasks (manual AWS, Cognito, Secrets Manager, ECR setup) cannot be executed by code — describe the exact manual steps required.

## File Conventions
- Routes: `src/routers/<resource>Router.ts`
- Middleware: `src/middleware/<name>.ts`
- DB helpers: `src/db/<resource>.ts`
- Services: `src/services/<name>.ts`
- Types: `src/interfaces.ts` and `src/types.ts`
- Validation: `src/validation/schemas.ts`
- Auth: `src/auth/cognitoVerifier.ts`
- Always read `src/app.ts`, `src/interfaces.ts`, and `src/types.ts` before writing new routes.

## Sequencing Reference
> ⚠️ Phase 13 (Validation & Error Handling) must be implemented before Phase 3.
> Every route from Phase 4 onward depends on the Zod schemas and `ApiError` class it creates.

| Order | Phase | Description |
|-------|-------|-------------|
| 1 | 1 | Project Infrastructure |
| 2 | 2 | Database Migrations |
| 3 | 13 | Input Validation & Error Handling |
| 4 | 14 | Health Endpoint |
| 5 | 3 | Auth Middleware (Cognito) |
| 6 | 4 | User Endpoints |
| 7 | 5 | Lease Endpoints |
| 8 | 6 | Odometer Reading Endpoints |
| 9 | 7 | Saved Trips Endpoints |
| 10 | 8 | Alert Configuration Endpoints |
| 11 | 9 | Lease Sharing |
| 12 | 10 | Subscription & Tier Management |
| 13 | 11 | Push Notifications |
| 14 | 12 | Advanced Analytics |
| 15 | 15 | Testing |
| 16 | 16 | Documentation & Deployment |

## Commit Message Format
A single plain sentence describing what was done. No `feat:` or conventional commit prefixes.
