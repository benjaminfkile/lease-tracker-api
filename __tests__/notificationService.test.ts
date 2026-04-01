import { IUser } from "../src/interfaces";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing tested modules
// ---------------------------------------------------------------------------

jest.mock("../src/db/users", () => ({
  getUserById: jest.fn(),
}));

jest.mock("../src/aws/getAppSecrets", () => ({
  getAppSecrets: jest.fn(),
}));

// Mock @aws-sdk/client-sns so no real AWS calls are made.
const mockSend = jest.fn();
jest.mock("@aws-sdk/client-sns", () => ({
  SNSClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  CreatePlatformEndpointCommand: jest.fn().mockImplementation((input) => ({
    _tag: "CreatePlatformEndpointCommand",
    input,
  })),
  PublishCommand: jest.fn().mockImplementation((input) => ({
    _tag: "PublishCommand",
    input,
  })),
}));

// Import after mocks are in place.
import { getUserById } from "../src/db/users";
import { getAppSecrets } from "../src/aws/getAppSecrets";
import {
  CreatePlatformEndpointCommand,
  PublishCommand,
} from "@aws-sdk/client-sns";
import {
  send,
  parseToken,
  buildSnsMessage,
} from "../src/services/notificationService";

const mockGetUserById = getUserById as jest.Mock;
const mockGetAppSecrets = getAppSecrets as jest.Mock;
const MockCreatePlatformEndpointCommand =
  CreatePlatformEndpointCommand as unknown as jest.Mock;
const MockPublishCommand = PublishCommand as unknown as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeUser = (push_token: string | null): IUser => ({
  id: "00000000-0000-0000-0000-000000000001",
  cognito_user_id: "us-east-1_TEST:sub-001",
  email: "test@example.com",
  display_name: "Test User",
  subscription_tier: "free",
  subscription_expires_at: null,
  push_token,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
});

const fakeSecrets = {
  SNS_APNS_PLATFORM_ARN: "arn:aws:sns:us-east-1:123456789012:app/APNS/MyApp",
  SNS_FCM_PLATFORM_ARN: "arn:aws:sns:us-east-1:123456789012:app/GCM/MyApp",
};

const apnsEndpointArn = "arn:aws:sns:us-east-1:123456789012:endpoint/APNS/MyApp/abc123";
const fcmEndpointArn = "arn:aws:sns:us-east-1:123456789012:endpoint/GCM/MyApp/def456";

// ---------------------------------------------------------------------------
// parseToken
// ---------------------------------------------------------------------------

describe("parseToken", () => {
  it("returns apns platform and raw token for 'apns:' prefix", () => {
    const result = parseToken("apns:abc123devicetoken");
    expect(result).toEqual({ platform: "apns", rawToken: "abc123devicetoken" });
  });

  it("returns fcm platform and raw token for 'fcm:' prefix", () => {
    const result = parseToken("fcm:regId:APA91bHPR...");
    expect(result).toEqual({ platform: "fcm", rawToken: "regId:APA91bHPR..." });
  });

  it("returns null for an unrecognised prefix", () => {
    expect(parseToken("unknown:sometoken")).toBeNull();
  });

  it("returns null for a plain token without any prefix", () => {
    expect(parseToken("plaintokennoprefix")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseToken("")).toBeNull();
  });

  it("preserves colons inside the raw FCM token", () => {
    const result = parseToken("fcm:part1:part2:part3");
    expect(result).toEqual({ platform: "fcm", rawToken: "part1:part2:part3" });
  });
});

// ---------------------------------------------------------------------------
// buildSnsMessage
// ---------------------------------------------------------------------------

describe("buildSnsMessage", () => {
  it("builds a valid APNs SNS message without extra data", () => {
    const msg = buildSnsMessage("apns", "Hello", "World");
    const parsed = JSON.parse(msg);
    expect(parsed).toHaveProperty("APNS");
    expect(parsed).toHaveProperty("APNS_SANDBOX");
    const apnsPayload = JSON.parse(parsed.APNS);
    expect(apnsPayload.aps.alert).toEqual({ title: "Hello", body: "World" });
    expect(apnsPayload.aps.sound).toBe("default");
    expect(apnsPayload).not.toHaveProperty("data");
  });

  it("includes the data object in the APNs payload when provided", () => {
    const msg = buildSnsMessage("apns", "Hi", "There", { leaseId: "l1" });
    const parsed = JSON.parse(msg);
    const apnsPayload = JSON.parse(parsed.APNS);
    expect(apnsPayload.data).toEqual({ leaseId: "l1" });
  });

  it("APNs APNS and APNS_SANDBOX carry identical payloads", () => {
    const msg = buildSnsMessage("apns", "T", "B");
    const parsed = JSON.parse(msg);
    expect(parsed.APNS).toBe(parsed.APNS_SANDBOX);
  });

  it("builds a valid FCM SNS message without extra data", () => {
    const msg = buildSnsMessage("fcm", "Alert", "Pay attention");
    const parsed = JSON.parse(msg);
    expect(parsed).toHaveProperty("GCM");
    const gcmPayload = JSON.parse(parsed.GCM);
    expect(gcmPayload.notification).toEqual({ title: "Alert", body: "Pay attention" });
    expect(gcmPayload.data).toEqual({});
  });

  it("includes the data object in the FCM payload when provided", () => {
    const msg = buildSnsMessage("fcm", "Hi", "There", { key: "value" });
    const parsed = JSON.parse(msg);
    const gcmPayload = JSON.parse(parsed.GCM);
    expect(gcmPayload.data).toEqual({ key: "value" });
  });
});

// ---------------------------------------------------------------------------
// send
// ---------------------------------------------------------------------------

describe("send", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AWS_REGION = "us-east-1";
  });

  it("returns early without calling SNS when the user has no push token", async () => {
    mockGetUserById.mockResolvedValue(fakeUser(null));

    await send("user-1", "Title", "Body");

    expect(mockGetAppSecrets).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns early without calling SNS when getUserById returns undefined", async () => {
    mockGetUserById.mockResolvedValue(undefined);

    await send("user-1", "Title", "Body");

    expect(mockGetAppSecrets).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("logs a warning and returns early for an unrecognised push token format", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockGetUserById.mockResolvedValue(fakeUser("unknown:token"));

    await send("user-1", "Title", "Body");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unrecognised push token format")
    );
    expect(mockSend).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("dispatches to APNs endpoint for an 'apns:' prefixed token", async () => {
    mockGetUserById.mockResolvedValue(fakeUser("apns:devicetoken64hex"));
    mockGetAppSecrets.mockResolvedValue(fakeSecrets);
    mockSend
      .mockResolvedValueOnce({ EndpointArn: apnsEndpointArn })
      .mockResolvedValueOnce({ MessageId: "msg-1" });

    await send("user-1", "Hello", "World");

    expect(MockCreatePlatformEndpointCommand).toHaveBeenCalledWith({
      PlatformApplicationArn: fakeSecrets.SNS_APNS_PLATFORM_ARN,
      Token: "devicetoken64hex",
    });
    expect(MockPublishCommand).toHaveBeenCalledWith({
      TargetArn: apnsEndpointArn,
      Message: expect.stringContaining("APNS"),
      MessageStructure: "json",
    });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("dispatches to FCM endpoint for a 'fcm:' prefixed token", async () => {
    mockGetUserById.mockResolvedValue(fakeUser("fcm:APA91bHPregistrationId"));
    mockGetAppSecrets.mockResolvedValue(fakeSecrets);
    mockSend
      .mockResolvedValueOnce({ EndpointArn: fcmEndpointArn })
      .mockResolvedValueOnce({ MessageId: "msg-2" });

    await send("user-1", "Alert", "Check your lease");

    expect(MockCreatePlatformEndpointCommand).toHaveBeenCalledWith({
      PlatformApplicationArn: fakeSecrets.SNS_FCM_PLATFORM_ARN,
      Token: "APA91bHPregistrationId",
    });
    expect(MockPublishCommand).toHaveBeenCalledWith({
      TargetArn: fcmEndpointArn,
      Message: expect.stringContaining("GCM"),
      MessageStructure: "json",
    });
  });

  it("passes extra data to the SNS message when provided", async () => {
    mockGetUserById.mockResolvedValue(fakeUser("apns:tok"));
    mockGetAppSecrets.mockResolvedValue(fakeSecrets);
    mockSend
      .mockResolvedValueOnce({ EndpointArn: apnsEndpointArn })
      .mockResolvedValueOnce({});

    await send("user-1", "T", "B", { leaseId: "lease-abc" });

    const publishCall = MockPublishCommand.mock.calls[0][0];
    const snsMsgParsed = JSON.parse(publishCall.Message);
    const apnsPayload = JSON.parse(snsMsgParsed.APNS);
    expect(apnsPayload.data).toEqual({ leaseId: "lease-abc" });
  });

  it("looks up the user with the provided userId", async () => {
    mockGetUserById.mockResolvedValue(fakeUser(null));

    await send("user-42", "T", "B");

    expect(mockGetUserById).toHaveBeenCalledWith("user-42");
  });

  it("fetches notification secrets when dispatch is needed", async () => {
    mockGetUserById.mockResolvedValue(fakeUser("apns:tok"));
    mockGetAppSecrets.mockResolvedValue(fakeSecrets);
    mockSend
      .mockResolvedValueOnce({ EndpointArn: apnsEndpointArn })
      .mockResolvedValueOnce({});

    await send("user-1", "T", "B");

    expect(mockGetAppSecrets).toHaveBeenCalledTimes(1);
  });

  it("throws when SNS CreatePlatformEndpoint does not return an EndpointArn", async () => {
    mockGetUserById.mockResolvedValue(fakeUser("apns:tok"));
    mockGetAppSecrets.mockResolvedValue(fakeSecrets);
    mockSend.mockResolvedValueOnce({ EndpointArn: undefined });

    await expect(send("user-1", "T", "B")).rejects.toThrow(
      "SNS did not return an EndpointArn"
    );
  });

  it("propagates errors thrown by getUserById", async () => {
    mockGetUserById.mockRejectedValue(new Error("DB failure"));

    await expect(send("user-1", "T", "B")).rejects.toThrow("DB failure");
  });

  it("propagates errors thrown by getAppSecrets", async () => {
    mockGetUserById.mockResolvedValue(fakeUser("fcm:token"));
    mockGetAppSecrets.mockRejectedValue(
      new Error("Secrets Manager unavailable")
    );

    await expect(send("user-1", "T", "B")).rejects.toThrow(
      "Secrets Manager unavailable"
    );
  });

  it("propagates errors thrown by SNS publish", async () => {
    mockGetUserById.mockResolvedValue(fakeUser("fcm:token"));
    mockGetAppSecrets.mockResolvedValue(fakeSecrets);
    mockSend
      .mockResolvedValueOnce({ EndpointArn: fcmEndpointArn })
      .mockRejectedValueOnce(new Error("SNS publish error"));

    await expect(send("user-1", "T", "B")).rejects.toThrow("SNS publish error");
  });
});
