import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager"
import { IAppSecrets } from "../interfaces"

let cachedAppSecrets: IAppSecrets | undefined;
let appSecretsPromise: Promise<IAppSecrets> | undefined;

// Fetch and parse secrets from AWS
export async function getAppSecrets(): Promise<IAppSecrets> {
  if (cachedAppSecrets) {
    return cachedAppSecrets;
  }

  if (appSecretsPromise) {
    return appSecretsPromise;
  }

  appSecretsPromise = (async () => {
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION
  })

  const command = new GetSecretValueCommand({
    SecretId: process.env.AWS_SECRET_ARN
  })

  const response = await client.send(command)

  if (!response.SecretString) {
    throw new Error("SecretString is empty in Secrets Manager response")
  }

    cachedAppSecrets = JSON.parse(response.SecretString) as IAppSecrets
    return cachedAppSecrets
  })();

  try {
    return await appSecretsPromise;
  } finally {
    appSecretsPromise = undefined;
  }
}

export function clearAppSecretsCache(): void {
  cachedAppSecrets = undefined;
  appSecretsPromise = undefined;
}
