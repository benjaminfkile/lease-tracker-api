describe("cognitoVerifier", () => {
  it("calls CognitoJwtVerifier.create with values from getAppSecrets", async () => {
    const mockCreate = jest.fn().mockReturnValue({ verify: jest.fn().mockResolvedValue({}) });
    let cognitoVerifier: { verify: (token: string) => Promise<unknown> } | undefined;

    jest.isolateModules(() => {
      jest.doMock("../src/aws/getAppSecrets", () => ({
        getAppSecrets: jest.fn().mockResolvedValue({
          COGNITO_USER_POOL_ID: "us-east-1_TestPool",
          COGNITO_CLIENT_ID: "testClientId123",
        }),
      }));
      jest.doMock("aws-jwt-verify", () => ({
        CognitoJwtVerifier: { create: mockCreate },
      }));
      cognitoVerifier = require("../src/auth/cognitoVerifier").default;
    });

    await cognitoVerifier!.verify("fake-token");

    expect(mockCreate).toHaveBeenCalledWith({
      userPoolId: "us-east-1_TestPool",
      clientId: "testClientId123",
      tokenUse: "access",
    });
  });

  it("verify() delegates to the verifier returned by CognitoJwtVerifier.create", async () => {
    const mockVerify = jest.fn().mockResolvedValue({ sub: "user-123" });
    const mockCreate = jest.fn().mockReturnValue({ verify: mockVerify });
    let cognitoVerifier: { verify: (token: string) => Promise<unknown> } | undefined;

    jest.isolateModules(() => {
      jest.doMock("../src/aws/getAppSecrets", () => ({
        getAppSecrets: jest.fn().mockResolvedValue({
          COGNITO_USER_POOL_ID: "us-east-1_TestPool",
          COGNITO_CLIENT_ID: "testClientId123",
        }),
      }));
      jest.doMock("aws-jwt-verify", () => ({
        CognitoJwtVerifier: { create: mockCreate },
      }));
      cognitoVerifier = require("../src/auth/cognitoVerifier").default;
    });

    const result = await cognitoVerifier!.verify("test-token");

    expect(mockVerify).toHaveBeenCalledWith("test-token");
    expect(result).toEqual({ sub: "user-123" });
  });

  it("throws when COGNITO_USER_POOL_ID is missing from secrets", async () => {
    let cognitoVerifier: { verify: (token: string) => Promise<unknown> } | undefined;

    jest.isolateModules(() => {
      jest.doMock("../src/aws/getAppSecrets", () => ({
        getAppSecrets: jest.fn().mockResolvedValue({
          COGNITO_USER_POOL_ID: "",
          COGNITO_CLIENT_ID: "testClientId123",
        }),
      }));
      jest.doMock("aws-jwt-verify", () => ({
        CognitoJwtVerifier: { create: jest.fn() },
      }));
      cognitoVerifier = require("../src/auth/cognitoVerifier").default;
    });

    await expect(cognitoVerifier!.verify("fake-token")).rejects.toThrow(
      "Missing required configuration: COGNITO_USER_POOL_ID"
    );
  });

  it("throws when COGNITO_CLIENT_ID is missing from secrets", async () => {
    let cognitoVerifier: { verify: (token: string) => Promise<unknown> } | undefined;

    jest.isolateModules(() => {
      jest.doMock("../src/aws/getAppSecrets", () => ({
        getAppSecrets: jest.fn().mockResolvedValue({
          COGNITO_USER_POOL_ID: "us-east-1_TestPool",
          COGNITO_CLIENT_ID: "",
        }),
      }));
      jest.doMock("aws-jwt-verify", () => ({
        CognitoJwtVerifier: { create: jest.fn() },
      }));
      cognitoVerifier = require("../src/auth/cognitoVerifier").default;
    });

    await expect(cognitoVerifier!.verify("fake-token")).rejects.toThrow(
      "Missing required configuration: COGNITO_CLIENT_ID"
    );
  });
});
