import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getAppSecrets } from "../aws/getAppSecrets";

type Verifier = ReturnType<typeof CognitoJwtVerifier.create>;

let verifierPromise: Promise<Verifier> | undefined;

async function createVerifier(): Promise<Verifier> {
  const secrets = await getAppSecrets();
  const userPoolId = secrets.COGNITO_USER_POOL_ID;
  const clientId = secrets.COGNITO_CLIENT_ID;

  if (!userPoolId) {
    throw new Error("Missing required configuration: COGNITO_USER_POOL_ID");
  }

  if (!clientId) {
    throw new Error("Missing required configuration: COGNITO_CLIENT_ID");
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

const cognitoVerifier = {
  async verify(token: string) {
    const verifier = await getVerifier();
    return verifier.verify(token);
  },
};

export function clearCognitoVerifierCache(): void {
  verifierPromise = undefined;
}

export default cognitoVerifier;
