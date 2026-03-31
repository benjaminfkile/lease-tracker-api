import { getAppSecrets } from "./getAppSecrets";
import { isLocal } from "../utils/isLocal";

const KEY_ALIASES: Record<string, string[]> = {
  COGNITO_USER_POOL_ID: ["cognito_user_pool_id"],
  COGNITO_CLIENT_ID: ["cognito_client_id"],
  INTERNAL_API_KEY: ["internal_api_key"],
  GOOGLE_PLAY_PACKAGE_NAME: ["google_play_package_name"],
  GOOGLE_SERVICE_ACCOUNT_KEY: ["google_service_account_key"],
  APPLE_SHARED_SECRET: ["apple_shared_secret"],
  APPLE_ROOT_CA_PEM: ["apple_root_ca_pem"],
  ALLOWED_ORIGINS: ["allowed_origins"],
};

function getStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveSecretValue(
  secrets: Record<string, unknown>,
  key: string
): string | undefined {
  const candidates = [
    key,
    ...(KEY_ALIASES[key] ?? []),
    key.toLowerCase(),
  ];

  for (const candidate of candidates) {
    const value = getStringValue(secrets[candidate]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

export async function getAppConfigValue(
  key: string,
  options?: { required?: boolean; allowEnvFallback?: boolean }
): Promise<string | undefined> {
  const allowEnvFallback =
    options?.allowEnvFallback ?? (isLocal() || process.env.NODE_ENV === "test");

  let fromSecrets: string | undefined;
  try {
    const secrets = (await getAppSecrets()) as unknown as Record<string, unknown>;
    fromSecrets = resolveSecretValue(secrets, key);
  } catch (err) {
    if (!allowEnvFallback) {
      throw err;
    }
  }

  if (fromSecrets) {
    return fromSecrets;
  }

  if (allowEnvFallback) {
    const fromEnv = getStringValue(process.env[key]);
    if (fromEnv) {
      return fromEnv;
    }
  }

  if (options?.required) {
    throw new Error(`Missing required configuration: ${key}`);
  }

  return undefined;
}