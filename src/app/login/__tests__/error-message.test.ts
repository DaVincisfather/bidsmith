import { describe, it, expect } from "vitest";
import { messageForOtpError } from "../page";

describe("messageForOtpError", () => {
  it("maps the signup-disabled error to the not-invited copy", () => {
    expect(messageForOtpError("Signups not allowed for otp")).toMatch(/inte inbjuden/i);
  });
  it("maps the disabled-variant too", () => {
    expect(messageForOtpError("Signup is disabled")).toMatch(/inte inbjuden/i);
  });
  it("falls back to the raw message for unknown errors", () => {
    expect(messageForOtpError("Rate limit exceeded")).toBe("Rate limit exceeded");
  });
});
