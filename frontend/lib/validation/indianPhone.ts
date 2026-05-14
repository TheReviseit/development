export type IndianPhoneValidationResult = {
  isValid: boolean;
  nationalNumber: string;
  e164: string | null;
  message: string | null;
};

const INDIA_DIAL_CODE = "91";
const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;
const REPEATED_DIGITS_RE = /^(\d)\1{9}$/;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeIndianPhoneInput(
  rawValue: string | null | undefined,
): IndianPhoneValidationResult {
  const rawDigits = digitsOnly(rawValue ?? "");
  let nationalNumber = rawDigits;

  if (nationalNumber.startsWith("00" + INDIA_DIAL_CODE)) {
    nationalNumber = nationalNumber.slice(4);
  } else if (nationalNumber.startsWith(INDIA_DIAL_CODE) && nationalNumber.length > 10) {
    nationalNumber = nationalNumber.slice(2);
  } else if (nationalNumber.startsWith("0") && nationalNumber.length > 10) {
    nationalNumber = nationalNumber.slice(1);
  }

  if (!nationalNumber) {
    return {
      isValid: false,
      nationalNumber,
      e164: null,
      message: "Kindly enter your mobile number.",
    };
  }

  if (nationalNumber.length !== 10) {
    return {
      isValid: false,
      nationalNumber,
      e164: null,
      message: "Kindly enter a valid 10-digit Indian mobile number.",
    };
  }

  if (!INDIAN_MOBILE_RE.test(nationalNumber)) {
    return {
      isValid: false,
      nationalNumber,
      e164: null,
      message: "Kindly enter a valid Indian mobile number starting with 6, 7, 8, or 9.",
    };
  }

  if (REPEATED_DIGITS_RE.test(nationalNumber)) {
    return {
      isValid: false,
      nationalNumber,
      e164: null,
      message: "Kindly enter a valid mobile number.",
    };
  }

  return {
    isValid: true,
    nationalNumber,
    e164: `+${INDIA_DIAL_CODE}${nationalNumber}`,
    message: null,
  };
}
