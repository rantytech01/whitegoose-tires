// Normalises Kenyan mobile numbers to the 2547XXXXXXXX / 2541XXXXXXXX form
// Daraja expects. Accepts 07XX, 01XX, +254..., 254... with spaces or dashes.
export function normalizeKenyanMsisdn(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[\s\-()]/g, "");
  const match = digits.match(/^(?:\+?254|0)([17]\d{8})$/);
  return match ? `254${match[1]}` : null;
}
