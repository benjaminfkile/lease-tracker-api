import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getAppConfigValue } from "../aws/getAppConfig";

type Verifier = ReturnType<typeof CognitoJwtVerifier.create>;

let verifierPromise: Promise<Verifier> | undefined;

function createVerifierFromEnv(): Verifier {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;

  if (!userPoolId) {
    throw new Error("Missing required environment variable: COGNITO_USER_POOL_ID");
  }

  if (!clientId) {
    throw new Error("Missing required environment variable: COGNITO_CLIENT_ID");
  }

  return CognitoJwtVerifier.create({
    userPoolId,
    clientId,
    tokenUse: "access",
  });
}

async function createVerifier(): Promise<Verifier> {
  const userPoolId = await getAppConfigValue("COGNITO_USER_POOL_ID", {
    required: true,
  });
  const clientId = await getAppConfigValue("COGNITO_CLIENT_ID", {
    required: true,
  });

  if (!userPoolId) {
    throw new Error("Missing required environment variable: COGNITO_USER_POOL_ID");
  }

  if (!clientId) {
    throw new Error("Missing required environment variable: COGNITO_CLIENT_ID");
  }

  return CognitoJwtVerifier.create({
    userPoolId,
    clientId,
    tokenUse: "access",
  });
}

async function getVerifier(): Promise<Verifier> {
  if (!verifierPromise) {
    verifierPromise = createVerifier();
  }

  return verifierPromise;
}

const isTestEnv = process.env.NODE_ENV === "test";
const eagerVerifier = isTestEnv ? createVerifierFromEnv() : undefined;

const cognitoVerifier = eagerVerifier ?? {
  async verify(token: string) {
    const verifier = await getVerifier();
    return verifier.verify(token);
  },
};

export function clearCognitoVerifierCache(): void {
  verifierPromise = undefined;
}

export default cognitoVerifier;
