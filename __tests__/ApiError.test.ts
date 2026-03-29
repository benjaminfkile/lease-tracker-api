import { ApiError } from "../src/utils/ApiError";

describe("ApiError", () => {
  it("is an instance of Error", () => {
    const err = new ApiError(400, "Bad Request");
    expect(err).toBeInstanceOf(Error);
  });

  it("is an instance of ApiError", () => {
    const err = new ApiError(400, "Bad Request");
    expect(err).toBeInstanceOf(ApiError);
  });

  it("sets name to 'ApiError'", () => {
    const err = new ApiError(404, "Not Found");
    expect(err.name).toBe("ApiError");
  });

  it("sets statusCode correctly", () => {
    const err = new ApiError(422, "Unprocessable Entity");
    expect(err.statusCode).toBe(422);
  });

  it("sets message correctly", () => {
    const err = new ApiError(500, "Internal Server Error");
    expect(err.message).toBe("Internal Server Error");
  });

  it("details is undefined when not provided", () => {
    const err = new ApiError(400, "Bad Request");
    expect(err.details).toBeUndefined();
  });

  it("sets details when provided as a string", () => {
    const err = new ApiError(400, "Bad Request", "extra info");
    expect(err.details).toBe("extra info");
  });

  it("sets details when provided as an object", () => {
    const details = { field: "email", issue: "invalid format" };
    const err = new ApiError(400, "Validation failed", details);
    expect(err.details).toEqual(details);
  });

  it("sets details when provided as an array", () => {
    const details = [{ path: ["name"], message: "Required" }];
    const err = new ApiError(400, "Validation failed", details);
    expect(err.details).toEqual(details);
  });

  it("works with common 4xx status codes", () => {
    const codes = [400, 401, 403, 404, 409, 422];
    for (const code of codes) {
      const err = new ApiError(code, "error");
      expect(err.statusCode).toBe(code);
    }
  });

  it("works with 5xx status codes", () => {
    const err = new ApiError(503, "Service Unavailable");
    expect(err.statusCode).toBe(503);
  });

  it("instanceof check passes across prototype boundaries", () => {
    function throwApiError(): never {
      throw new ApiError(403, "Forbidden");
    }
    try {
      throwApiError();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});
