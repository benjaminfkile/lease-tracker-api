# lease-tracker-api

## Project overview

`lease-tracker-api` is a small backend API used to serve content and media for a personal portfolio site. It provides endpoints to fetch content (about, portfolio items, skills, timeline) and media assets.

## Purpose and responsibilities

- Serve portfolio content and media to the frontend site
- Provide a lightweight health endpoint for monitoring
- Integrate with S3 and a Postgres-backed content store via Knex

## Tech stack

- Node.js (TypeScript)
- Express
- Knex + pg
- AWS S3 clients for media
- Jest + Supertest for tests

## Folder structure

- `src/`
  - `app.ts` — Express app and route registration
  - `routers/` — `contentRouter`, `mediaRouter`, and `healthRouter`
  - `db/` — content DB helper functions
  - `utils/` — helper utilities such as `isLocal`

## Environment variables

- `NODE_ENV`
- `IS_LOCAL` — enable development behaviors
- `AWS_REGION` — used by AWS SDK when fetching secrets or S3
- `AWS_SECRET_ARN`, `AWS_DB_SECRET_ARN` — for app & DB secrets if applicable

If you don’t have secrets configured, running locally should still allow health and basic routes to run; DB-backed routes may expect a database connection.

## Run locally

1. Install dependencies: `npm install`
2. Dev: `npm run dev`
3. Build & start: `npm run build && npm start`
4. Tests: `npm test`

## Deployment

Containerize with the included `Dockerfile` and deploy to your preferred container platform (ECS/Fargate, Kubernetes, or EC2). In the example EC2 bootstrap used by this fleet the process:

- Logs in to ECR and pulls images for `portfolio-api`, `wmsfo-api`, `wmsfo-api-dev`, and `bk-gateway-api`.
- Runs containers on a user-defined Docker network (example: `app-net`) so services can address each other by name (e.g., `portfolio-api:3005`).
- Starts the CloudWatch agent to collect host memory and other metrics.

Operational notes:

- Ensure database credentials and S3 access are provided via Secrets Manager so the app can initialize DB connections at startup.
- When running behind `bk-gateway-api`, make sure `serviceMap` is configured to point at internal hostnames and ports used in your Docker or orchestration environment.

## Tests

Tests live in `__tests__/` and use Jest + Supertest. They mock DB access so they run quickly in CI.

## Notes & assumptions

- The API is intentionally lightweight and is primarily a data provider for a static or dynamic frontend.
- If the database or S3 are unavailable, the health endpoint will still reply but some routes may return 500s.
# lease-tracker-api
