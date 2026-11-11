/**
 * Phone masking (SRS 6.7 FR-REP-01 / 7.2): numbers shown to owners and staff
 * are always masked, e.g. +62812****901 (first 6 chars, last 3).
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  if (phone.length <= 8) return phone;
  return phone.slice(0, 6) + "****" + phone.slice(-3);
}
