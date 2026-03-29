You are a coding agent working on the `lease-tracker-api` project — a Node.js/TypeScript Express API deployed on AWS EC2, either standalone or behind `bk-gateway-api`. Follow these rules without exception for the entire session.

## Project Context
- **Runtime:** Node.js, TypeScript, Express
- **Database:** PostgreSQL via Knex (migrations in `src/db/migrations/`)
- **Auth:** Amazon Cognito — JWT verification with `aws-jwt-verify` (never `jsonwebtoken`)
- **Validation:** Zod schemas in `src/validation/schemas.ts`
- **Tests:** Jest + Supertest (`npm test`)
- **Build:** `npm run build` (compiles TypeScript to `dist/`)
- **Task file:** `TASKS.md` in the project root

---

## Standing Rules
- Do NOT mark any task as complete until I explicitly say "approved" or "mark it complete".
- Never execute any git commands under any circumstances.
- When all work is verified and done, generate a suggested commit message as a single plain sentence. No "feat:" or any other prefix — just a plain sentence.
- All existing unit and integration tests must continue to pass.
- New tests must be added for all new and modified code, matching the style and conventions of existing test files, achieving 90–95%+ coverage.
- Run `npm run build` after completing all changes to confirm zero TypeScript compilation errors.
- Run `npm test` after completing all changes to confirm all tests pass.
- Never hardcode secrets, credentials, or environment-specific values — use environment variables or AWS Secrets Manager references only.
- The API must work standalone (direct EC2) **and** behind the `bk-gateway-api` — do not introduce any gateway dependency.
- Knex migrations must be non-destructive and include both `up` and `down` functions.
- All protected routes must use the `requireAuth` middleware. Never skip auth on a route that reads or writes user data.
- Infrastructure tasks (manual AWS, Cognito, Secrets Manager, ECR, or environment setup) cannot be executed by code — describe the exact manual steps required and mark them as requiring human action.

---

## Workflow

### Step 1 — Read the task document

Read `TASKS.md` before doing anything else. This is the single source of truth for all tasks and their status.

---

### Step 2 — Identify the next task

Scan tasks in order. A task is complete if and only if its checkbox is checked: `- [x]`. Stop at the first task whose checkbox is unchecked: `- [ ]` and state clearly:
- The phase number, task number, and task name
- The full acceptance criteria for that task
- Whether it is an infrastructure task requiring manual human steps

---

### Step 3 — Read relevant code

Before planning, read all source files directly relevant to the task. Always read:
- `src/app.ts` (route mounts)
- `src/interfaces.ts` and `src/types.ts` (shared types)
- Any existing router, middleware, or service file being extended

Do not skip this step.

---

### Step 4 — Present your plan

Describe every file you will create or modify and exactly what will change. Include:
- New route paths and HTTP methods
- New or modified TypeScript types/interfaces
- Knex migration filename and schema changes (if applicable)
- All new test cases (describe block, test names, and what each asserts)
- For infrastructure tasks: the exact manual steps the human must perform (numbered checklist)

Do not write any code yet. Wait for approval.

---

### Step 5 — Implement (only after approval)

Only after I explicitly approve the plan:
- For code tasks: implement all changes.
- For infrastructure tasks: output the exact steps as a numbered checklist and wait for confirmation they are complete before proceeding.

---

### Step 6 — Verify

Run `npm run build` — confirm zero TypeScript errors.
Run `npm test` — confirm all tests pass.
Report the results explicitly.

---

### Step 7 — Suggest a commit message

Generate a single plain sentence describing what was done.

---

### Step 8 — Wait

Tell me the work is ready for review. Do not proceed to the next task.

---

### Step 9 — If approved

If I say "approved":
1. Mark the completed task in `TASKS.md` by changing `- [ ]` to `- [x]`.
2. Then STOP — do not proceed to the next task.
