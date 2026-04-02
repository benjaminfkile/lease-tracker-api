# ---- Build stage ----
FROM node:20 AS builder

WORKDIR /app

# Install dependencies
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy ALL source (root index.ts + src/)
COPY . .

# Compile TS → dist/
RUN npm run build

# ---- Runtime stage ----
FROM node:20-slim AS runtime

WORKDIR /app

# Install only prod deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JS
COPY --from=builder /app/dist ./dist

# ---- Accept required build args ----
ARG AWS_REGION
ARG AWS_SECRET_ARN
ARG AWS_DB_SECRET_ARN

# ---- Expose them as runtime env vars ----
ENV AWS_REGION=$AWS_REGION
ENV AWS_SECRET_ARN=$AWS_SECRET_ARN
ENV AWS_DB_SECRET_ARN=$AWS_DB_SECRET_ARN

EXPOSE 3005

CMD ["node", "dist/index.js"]
