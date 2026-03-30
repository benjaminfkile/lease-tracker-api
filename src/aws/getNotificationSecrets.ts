import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { INotificationSecrets } from "../interfaces";

let client: SecretsManagerClient | undefined;
let cachedSecrets: INotificationSecrets | undefined;

function getClient(): SecretsManagerClient {
  if (!client) {
    client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  }
  return client;
}

export async function getNotificationSecrets(): Promise<INotificationSecrets> {
  if (cachedSecrets) {
    return cachedSecrets;
  }

  const command = new GetSecretValueCommand({
    SecretId: process.env.AWS_PUSH_SECRET_ARN,
  });

  const response = await getClient().send(command);

  if (!response.SecretString) {
    throw new Error("SecretString is empty in Secrets Manager response");
  }

  cachedSecrets = JSON.parse(response.SecretString) as INotificationSecrets;
  return cachedSecrets;
}

/** Clears the in-memory secrets cache (useful for testing). */
export function clearNotificationSecretsCache(): void {
  cachedSecrets = undefined;
}
