import { normalizeIndianPhoneInput } from "@/lib/validation/indianPhone";

describe("normalizeIndianPhoneInput", () => {
  it("accepts a 10-digit Indian mobile number", () => {
    expect(normalizeIndianPhoneInput("9876543210")).toEqual({
      isValid: true,
      nationalNumber: "9876543210",
      e164: "+919876543210",
      message: null,
    });
  });

  it("normalizes pasted +91 numbers", () => {
    expect(normalizeIndianPhoneInput("+91 98765 43210")).toMatchObject({
      isValid: true,
      nationalNumber: "9876543210",
      e164: "+919876543210",
    });
  });

  it("normalizes local trunk-prefix numbers", () => {
    expect(normalizeIndianPhoneInput("09876543210")).toMatchObject({
      isValid: true,
      nationalNumber: "9876543210",
      e164: "+919876543210",
    });
  });

  it("rejects landline-style starting digits", () => {
    expect(normalizeIndianPhoneInput("5123456789")).toMatchObject({
      isValid: false,
      e164: null,
    });
  });

  it("rejects overlong numbers without a recognized India prefix", () => {
    expect(normalizeIndianPhoneInput("98765432109")).toMatchObject({
      isValid: false,
      e164: null,
    });
  });

  it("rejects repeated fake numbers", () => {
    expect(normalizeIndianPhoneInput("9999999999")).toMatchObject({
      isValid: false,
      e164: null,
    });
  });
});
