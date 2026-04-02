# Deployment Guide

This document covers every step needed to build, push, and run `lease-tracker-api` in production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Secrets Manager Key Names Reference](#secrets-manager-key-names-reference)
- [Migration Runbook](#migration-runbook)
- [Docker Build and Push to ECR](#docker-build-and-push-to-ecr)
- [ECS Task Definition Notes](#ecs-task-definition-notes)
- [CloudWatch Alert Setup for Health Endpoint](#cloudwatch-alert-setup-for-health-endpoint)

---

## Prerequisites

- AWS CLI configured with credentials that have permissions for ECR, Secrets Manager, ECS/EC2, and CloudWatch.
- Docker with Buildx support (for multi-architecture builds).
- Node.js ≥ 20 and `npx` available (for running migrations).
- Access to the production PostgreSQL database from the machine running migrations.

---

## Secrets Manager Key Names Reference

The API reads configuration from three AWS Secrets Manager secrets. Each secret must be a JSON object stored as a `SecretString`. The ARNs for these secrets are passed to the container at build time and as environment variables.

### App Config Secret (`AWS_SECRET_ARN`)

Holds application-level runtime configuration.

| Key | Type | Description |
|-----|------|-------------|
| `db_name` | `string` | PostgreSQL database name |
| `node_env` | `"development"` \| `"production"` | Runtime environment |
| `port` | `string` | HTTP port the server listens on (e.g. `"3005"`) |
| `cognito_user_pool_id` | `string` | Cognito user pool ID used for JWT verification |
| `cognito_client_id` | `string` | Cognito app client ID used for JWT verification |
| `internal_api_key` | `string` | Shared key required by internal protected endpoints |
| `google_play_package_name` | `string` | Android package name used for Google Play purchase verification |
| `google_service_account_key` | `string (JSON)` | Google service account credentials JSON used for Play API access |
| `apple_shared_secret` | `string` | App Store shared secret for Apple receipt verification |
| `apple_root_ca_pem` | `string` | PEM-encoded Apple Root CA certificate for webhook signature verification |

**Example JSON:**
```json
{
  "db_name": "leasetracker",
  "node_env": "production",
  "port": "3005",
  "cognito_user_pool_id": "us-east-1_jDeByVRDz",
  "cognito_client_id": "4qjv485gtrrl4db41sme3epr17",
  "internal_api_key": "replace-with-strong-random-value",
  "google_play_package_name": "com.example.app",
  "google_service_account_key": "{\"type\":\"service_account\",\"project_id\":\"...\"}",
  "apple_shared_secret": "replace-with-app-store-shared-secret",
  "apple_root_ca_pem": "-----BEGIN CERTIFICATE-----\\n...\\n-----END CERTIFICATE-----"
}
```

### Database Credentials Secret (`AWS_DB_SECRET_ARN`)

Holds PostgreSQL connection credentials. Matches the format produced by RDS-managed secrets.

| Key | Type | Description |
|-----|------|-------------|
| `username` | `string` | PostgreSQL username |
| `password` | `string` | PostgreSQL password |
| `engine` | `"postgres"` | Database engine (always `"postgres"`) |
| `host` | `string` | RDS instance endpoint or hostname |
| `proxy_url` | `string` | RDS Proxy URL (if using a proxy; otherwise same as `host`) |
| `port` | `number` | PostgreSQL port (always `5432`) |
| `dbInstanceIdentifier` | `string` | RDS instance identifier |

**Example JSON:**
```json
{
  "username": "leasetracker_user",
  "password": "s3cr3t",
  "engine": "postgres",
  "host": "leasetracker.cluster-xxxx.us-east-1.rds.amazonaws.com",
  "proxy_url": "leasetracker.proxy-xxxx.us-east-1.rds.amazonaws.com",
  "port": 5432,
  "dbInstanceIdentifier": "leasetracker-db"
}
```

### Push Notification Secret (`AWS_PUSH_SECRET_ARN`)

Holds SNS Platform Application ARNs for Apple APNs and Firebase FCM push notifications.

| Key | Type | Description |
|-----|------|-------------|
| `sns_apns_platform_arn` | `string` | SNS Platform Application ARN for Apple APNs (iOS) |
| `sns_fcm_platform_arn` | `string` | SNS Platform Application ARN for Firebase FCM (Android) |

**Example JSON:**
```json
{
  "sns_apns_platform_arn": "arn:aws:sns:us-east-1:123456789012:app/APNS/LeaseTrackerAPNS",
  "sns_fcm_platform_arn": "arn:aws:sns:us-east-1:123456789012:app/GCM/LeaseTrackerFCM"
}
```

### Required IAM Permissions

The EC2 instance profile or ECS task role must allow:

```json
{
  "Effect": "Allow",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": [
    "<AWS_SECRET_ARN>",
    "<AWS_DB_SECRET_ARN>",
    "<AWS_PUSH_SECRET_ARN>"
  ]
}
```

Additionally, the role must allow SNS `Publish` to the APNs and FCM platform application ARNs:

```json
{
  "Effect": "Allow",
  "Action": "sns:Publish",
  "Resource": [
    "<sns_apns_platform_arn>",
    "<sns_fcm_platform_arn>"
  ]
}
```

---

## Migration Runbook

> ⚠️ **Always run migrations before deploying a new API version.** The new container may depend on schema changes that must be present before it starts.

Migrations are managed by Knex. All migration files live in `src/db/migrations/` and are compiled to `dist/db/migrations/` at build time.

### Step 1 — Connect to the production database

From the machine that will run migrations (e.g. a bastion host, CI runner, or the EC2 instance itself), export the production database credentials:

```bash
export NODE_ENV=production
export DB_HOST=<rds-endpoint-or-proxy-url>
export DB_PORT=5432
export DB_NAME=<db-name>
export DB_USER=<db-user>
export DB_PASSWORD=<db-password>
```

### Step 2 — Check current migration status

```bash
npx knex migrate:status --env production
```

Review the output and confirm which migrations are pending.

### Step 3 — Run pending migrations

```bash
npx knex migrate:latest --env production
```

Knex will apply all pending migrations in timestamp order and print each file as it runs. A successful run ends with `Batch N run: M migrations`.

### Step 4 — Verify

```bash
npx knex migrate:status --env production
```

All migrations should now show as `Already run`.

### Rolling Back

To undo the most recently applied migration batch:

```bash
npx knex migrate:rollback --env production
```

To roll back all migrations:

```bash
npx knex migrate:rollback --all --env production
```

---

## Docker Build and Push to ECR

The CI/CD pipeline (`.github/workflows/deploy.yaml`) handles builds automatically on pushes to `main` (prod) and `dev` (dev environment). The steps below document how to perform a manual build and push.

### Step 1 — Authenticate Docker with ECR

```bash
aws ecr get-login-password --region <AWS_REGION> | \
  docker login --username AWS --password-stdin <ECR_REGISTRY>
```

Replace `<ECR_REGISTRY>` with the ECR registry URI (e.g. `123456789012.dkr.ecr.us-east-1.amazonaws.com`).

### Step 2 — Build the multi-architecture image

The Dockerfile accepts four build arguments that are baked into the runtime image as environment variables:

| Build Arg | Description |
|-----------|-------------|
| `AWS_REGION` | AWS region for SDK calls |
| `AWS_SECRET_ARN` | ARN of the app config secret |
| `AWS_DB_SECRET_ARN` | ARN of the database credentials secret |
| `NODE_ENVIRONMENT` | Runtime environment (`production`) |

```bash
IMAGE_URI=<ECR_REGISTRY>/<ECR_REPOSITORY>
GIT_SHA=$(git rev-parse --short HEAD)

docker buildx create --use || true
docker buildx inspect --bootstrap

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg AWS_REGION=<AWS_REGION> \
  --build-arg AWS_SECRET_ARN=<AWS_SECRET_ARN> \
  --build-arg AWS_DB_SECRET_ARN=<AWS_DB_SECRET_ARN> \
  --build-arg NODE_ENVIRONMENT=production \
  -t $IMAGE_URI:$GIT_SHA \
  -t $IMAGE_URI:latest \
  --push .
```

### Step 3 — Verify the image in ECR

```bash
aws ecr describe-images \
  --repository-name <ECR_REPOSITORY> \
  --region <AWS_REGION> \
  --query 'sort_by(imageDetails, &imagePushedAt)[-1]'
```

### Step 4 — Trigger a rolling deployment (ASG)

The current deployment target is an EC2 Auto Scaling Group. After pushing a new image, trigger a rolling instance refresh:

```bash
# Cancel any in-progress refresh first
aws autoscaling cancel-instance-refresh \
  --auto-scaling-group-name "<ASG_NAME>" || true

# Wait until cancelled
while true; do
  STATUS=$(aws autoscaling describe-instance-refreshes \
    --auto-scaling-group-name "<ASG_NAME>" \
    --query 'InstanceRefreshes[0].Status' --output text)
  [ "$STATUS" = "Cancelled" ] || [ "$STATUS" = "Successful" ] || [ "$STATUS" = "None" ] && break
  echo "Waiting... ($STATUS)" && sleep 10
done

# Start new rolling refresh
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name "<ASG_NAME>" \
  --strategy Rolling \
  --preferences '{"MinHealthyPercentage": 100, "InstanceWarmup": 120}'
```

---

## ECS Task Definition Notes

If the service is migrated from an Auto Scaling Group to Amazon ECS (Fargate or EC2 launch type), use the following reference when authoring the task definition.

### Container definition

```json
{
  "name": "lease-tracker-api",
  "image": "<ECR_REGISTRY>/<ECR_REPOSITORY>:latest",
  "portMappings": [
    {
      "containerPort": 3005,
      "protocol": "tcp"
    }
  ],
  "essential": true,
  "environment": [
    { "name": "AWS_REGION",        "value": "<AWS_REGION>" },
    { "name": "AWS_SECRET_ARN",    "value": "<AWS_SECRET_ARN>" },
    { "name": "AWS_DB_SECRET_ARN", "value": "<AWS_DB_SECRET_ARN>" },
    { "name": "AWS_PUSH_SECRET_ARN", "value": "<AWS_PUSH_SECRET_ARN>" }
  ],
  "logConfiguration": {
    "logDriver": "awslogs",
    "options": {
      "awslogs-group": "/ecs/lease-tracker-api",
      "awslogs-region": "<AWS_REGION>",
      "awslogs-stream-prefix": "ecs"
    }
  },
  "healthCheck": {
    "command": [
      "CMD-SHELL",
      "curl -f http://localhost:3005/api/health || exit 1"
    ],
    "interval": 30,
    "timeout": 5,
    "retries": 3,
    "startPeriod": 60
  }
}
```

> **Tip:** Keep the task definition `environment` array limited to bootstrap values such as region and secret ARNs. Store all runtime credentials/config in Secrets Manager (`AWS_SECRET_ARN`, `AWS_DB_SECRET_ARN`, `AWS_PUSH_SECRET_ARN`) rather than plaintext env vars.

### Task role

The ECS task role must carry the same IAM permissions described in the [Secrets Manager Key Names Reference](#secrets-manager-key-names-reference) — `secretsmanager:GetSecretValue` on the three secret ARNs and `sns:Publish` on the platform application ARNs.

### Recommended resource allocation (Fargate)

| Setting | Recommended value |
|---------|-------------------|
| CPU | 512 (.5 vCPU) |
| Memory | 1024 MB |
| Launch type | Fargate |
| Platform version | `LATEST` |
| Network mode | `awsvpc` |

### Migration task

Run migrations as a standalone ECS task before updating the service. Use the same task definition but override the container command:

```bash
aws ecs run-task \
  --cluster <ECS_CLUSTER> \
  --task-definition lease-tracker-api \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<SUBNET_ID>],securityGroups=[<SG_ID>],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"lease-tracker-api","command":["npx","knex","migrate:latest","--env","production"]}]}'
```

---

## CloudWatch Alert Setup for Health Endpoint

The `/api/health` endpoint returns HTTP `200` when the API and database are healthy, or a non-`200` code when degraded. Use CloudWatch Synthetics (canary) or a Route 53 health check combined with a CloudWatch alarm to monitor it.

### Option A — CloudWatch Synthetics Canary

1. **Open** the CloudWatch console → **Synthetics** → **Create canary**.
2. **Blueprint:** Choose *Heartbeat monitoring*.
3. **Name:** `lease-tracker-api-health`.
4. **URL:** `http://<EC2_OR_ALB_HOST>:3005/api/health` (or the HTTPS URL if behind a load balancer).
5. **Schedule:** Every **1 minute**.
6. **Success criteria:** HTTP status `200`.
7. **Create canary.**

After creation, attach an alarm:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "lease-tracker-api-health-canary" \
  --namespace CloudWatchSynthetics \
  --metric-name SuccessPercent \
  --dimensions Name=CanaryName,Value=lease-tracker-api-health \
  --statistic Average \
  --period 60 \
  --evaluation-periods 2 \
  --threshold 100 \
  --comparison-operator LessThanThreshold \
  --treat-missing-data breaching \
  --alarm-actions <SNS_TOPIC_ARN> \
  --ok-actions <SNS_TOPIC_ARN>
```

### Option B — Route 53 Health Check + CloudWatch Alarm

1. **Create a Route 53 health check** targeting the `/api/health` path on port `3005` (HTTP) or `443` (HTTPS).
2. Route 53 publishes `HealthCheckStatus` metrics to the `AWS/Route53` namespace automatically.
3. Create an alarm on that metric:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "lease-tracker-api-health-r53" \
  --namespace AWS/Route53 \
  --metric-name HealthCheckStatus \
  --dimensions Name=HealthCheckId,Value=<HEALTH_CHECK_ID> \
  --statistic Minimum \
  --period 60 \
  --evaluation-periods 2 \
  --threshold 1 \
  --comparison-operator LessThanThreshold \
  --treat-missing-data breaching \
  --alarm-actions <SNS_TOPIC_ARN> \
  --ok-actions <SNS_TOPIC_ARN>
```

### Option C — ALB Target Group Health Alarm (if behind a load balancer)

If the service sits behind an Application Load Balancer, monitor the `UnHealthyHostCount` metric:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "lease-tracker-api-unhealthy-hosts" \
  --namespace AWS/ApplicationELB \
  --metric-name UnHealthyHostCount \
  --dimensions \
      Name=LoadBalancer,Value=<ALB_ARN_SUFFIX> \
      Name=TargetGroup,Value=<TG_ARN_SUFFIX> \
  --statistic Maximum \
  --period 60 \
  --evaluation-periods 2 \
  --threshold 0 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions <SNS_TOPIC_ARN> \
  --ok-actions <SNS_TOPIC_ARN>
```

### SNS notification topic

All alarms above reference an SNS topic ARN for alert delivery. Create a standard topic and subscribe your on-call email or PagerDuty endpoint:

```bash
# Create topic
aws sns create-topic --name lease-tracker-api-alerts

# Subscribe an email address
aws sns subscribe \
  --topic-arn <SNS_TOPIC_ARN> \
  --protocol email \
  --notification-endpoint ops@example.com
```

Confirm the subscription by clicking the link in the confirmation email.
