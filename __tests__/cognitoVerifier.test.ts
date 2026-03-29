describe("cognitoVerifier", () => {
  const originalUserPoolId = process.env.COGNITO_USER_POOL_ID;
  const originalClientId = process.env.COGNITO_CLIENT_ID;

  afterEach(() => {
    if (originalUserPoolId === undefined) {
      delete process.env.COGNITO_USER_POOL_ID;
    } else {
      process.env.COGNITO_USER_POOL_ID = originalUserPoolId;
    }
    if (originalClientId === undefined) {
      delete process.env.COGNITO_CLIENT_ID;
    } else {
      process.env.COGNITO_CLIENT_ID = originalClientId;
    }
  });

  it("calls CognitoJwtVerifier.create with env var values", () => {
    process.env.COGNITO_USER_POOL_ID = "us-east-1_TestPool";
    process.env.COGNITO_CLIENT_ID = "testClientId123";

    const mockCreate = jest.fn().mockReturnValue({ verify: jest.fn() });

    jest.isolateModules(() => {
      jest.doMock("aws-jwt-verify", () => ({
        CognitoJwtVerifier: { create: mockCreate },
      }));
      require("../src/auth/cognitoVerifier");
    });

    expect(mockCreate).toHaveBeenCalledWith({
      userPoolId: "us-east-1_TestPool",
      clientId: "testClientId123",
      tokenUse: "access",
    });
  });

  it("exports the verifier instance returned by CognitoJwtVerifier.create", () => {
    process.env.COGNITO_USER_POOL_ID = "us-east-1_TestPool";
    process.env.COGNITO_CLIENT_ID = "testClientId123";

    const mockVerifier = { verify: jest.fn() };
    const mockCreate = jest.fn().mockReturnValue(mockVerifier);
    let verifier: unknown;

    jest.isolateModules(() => {
      jest.doMock("aws-jwt-verify", () => ({
        CognitoJwtVerifier: { create: mockCreate },
      }));
      verifier = require("../src/auth/cognitoVerifier").default;
    });

    expect(verifier).toBe(mockVerifier);
  });

  it("falls back to empty string when env vars are not set", () => {
    delete process.env.COGNITO_USER_POOL_ID;
    delete process.env.COGNITO_CLIENT_ID;

    const mockCreate = jest.fn().mockReturnValue({ verify: jest.fn() });

    expect(() => {
      jest.isolateModules(() => {
        jest.doMock("aws-jwt-verify", () => ({
          CognitoJwtVerifier: { create: mockCreate },
        }));
        require("../src/auth/cognitoVerifier");
      });
    }).toThrow("Missing required environment variable: COGNITO_USER_POOL_ID");
  });

  it("throws when only COGNITO_CLIENT_ID is missing", () => {
    process.env.COGNITO_USER_POOL_ID = "us-east-1_TestPool";
    delete process.env.COGNITO_CLIENT_ID;

    const mockCreate = jest.fn().mockReturnValue({ verify: jest.fn() });

    expect(() => {
      jest.isolateModules(() => {
        jest.doMock("aws-jwt-verify", () => ({
          CognitoJwtVerifier: { create: mockCreate },
        }));
        require("../src/auth/cognitoVerifier");
      });
    }).toThrow("Missing required environment variable: COGNITO_CLIENT_ID");
  });
});
