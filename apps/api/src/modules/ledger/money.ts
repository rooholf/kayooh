/** INV-5: pure integer (bigint) money helpers — no floating point. */

function toBigInt(v: bigint | number): bigint {
  return typeof v === "number" ? BigInt(Math.trunc(v)) : v;
}

/** Half-up division (rounds .5 away from zero), integer-only. */
export function roundHalfUp(numerator: bigint | number, denominator: bigint | number = 1n): bigint {
  let n = toBigInt(numerator);
  let d = toBigInt(denominator);
  if (d === 0n) throw new Error("division by zero");
  const neg = (n < 0n) !== (d < 0n);
  if (n < 0n) n = -n;
  if (d < 0n) d = -d;
  const q = (n + d / 2n) / d;
  return neg ? -q : q;
}

/** Floor division, integer-only (rounds toward -infinity). */
export function floorDiv(numerator: bigint | number, denominator: bigint | number = 1n): bigint {
  const n = toBigInt(numerator);
  const d = toBigInt(denominator);
  if (d === 0n) throw new Error("division by zero");
  const q = n / d; // truncates toward zero
  const r = n % d;
  if (r !== 0n && (r < 0n) !== (d < 0n)) return q - 1n;
  return q;
}

/** Alias matching the issue's `floor` name. */
export function floor(numerator: bigint | number, denominator: bigint | number = 1n): bigint {
  return floorDiv(numerator, denominator);
}

export { floorDiv as floorDivision };
