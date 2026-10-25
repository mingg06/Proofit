import { timingSafeEqual } from "node:crypto";
/** Runtime service identity only; it grants no PROOFIT customer/staff authority. */
export function eveServiceAuth(request: Request, secret: string | undefined) {
  if (!secret || secret.length < 32 || /[\r\n]/.test(secret)) return null;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from("Bearer " + secret);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return null;
  return {
    authenticator: "proofit-worker",
    principalId: "isolated-investigator",
    principalType: "service",
    attributes: {},
  };
}
