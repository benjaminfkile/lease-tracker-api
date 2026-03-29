import { CognitoJwtVerifier } from "aws-jwt-verify";

const userPoolId = process.env.COGNITO_USER_POOL_ID;
const clientId = process.env.COGNITO_CLIENT_ID;

if (!userPoolId) {
  throw new Error("Missing required environment variable: COGNITO_USER_POOL_ID");
}

if (!clientId) {
  throw new Error("Missing required environment variable: COGNITO_CLIENT_ID");
}

const cognitoVerifier = CognitoJwtVerifier.create({
  userPoolId,
  clientId,
  tokenUse: "access",
});

export default cognitoVerifier;
