# lease-tracker-api — Copilot Coding Agent Instructions

## Project Overview
Node.js/TypeScript Express REST API for the LeaseTracker mobile app. Deployed on AWS EC2.
Manages car lease data, odometer readings, mileage analytics, push notifications, and Apple/Google subscriptions.

## Tech Stack
- **Runtime:** Node.js, TypeScript, Express
- **Database:** PostgreSQL via Knex (migrations in `src/db/migrations/`)
- **Auth:** Amazon Cognito — JWT verification with `aws-jwt-verify` (never `jsonwebtoken`)
- **Validation:** Zod schemas in `src/validation/schemas.ts`
- **Build:** `npm run build` (compiles TypeScript to `dist/`)

## Branch & PR Rules — CRITICAL
- **Always base your branch off `dev`.** Never branch from `main`.
- **All PRs must target `dev`.** Never open a PR targeting `main`.
- `main` is production-only and is never a valid PR target under any circumstances.

## Standing Rules
- Run `npm run build` after completing changes to confirm zero TypeScript errors. **Do not run tests** — the test suite is being updated separately and is not required to pass.
- Never hardcode secrets, credentials, or environment-specific values — use AWS Secrets Manager only. The only allowed `process.env` reads are `AWS_REGION`, `AWS_SECRET_ARN`, and `AWS_DB_SECRET_ARN`.
- All protected routes must use the `requireAuth` middleware. Never skip auth on a route that reads or writes user data.

## File Conventions
- Routes: `src/routers/<resource>Router.ts`
- Middleware: `src/middleware/<name>.ts`
- DB helpers: `src/db/<resource>.ts`
- Services: `src/services/<name>.ts`
- Types: `src/interfaces.ts` and `src/types.ts`
- Validation: `src/validation/schemas.ts`
- Auth: `src/auth/cognitoVerifier.ts`
- Always read `src/app.ts`, `src/interfaces.ts`, and `src/types.ts` before writing new routes.

## PR Naming
The PR **branch name and title must both start with the issue number**, e.g. branch `161-rename-iappsecrets` and title `161 Rename IAPISecrets to IAppSecrets`. This is required for the automation workflow.

## PR Description Format
The PR body **must** include `Closes #<issue_number>` (e.g. `Closes #42`) so the issue is automatically closed when the PR is merged.

## Commit Message Format
A single plain sentence describing what was done. No `feat:` or conventional commit prefixes.
