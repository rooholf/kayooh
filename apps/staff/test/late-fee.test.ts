import { describe, expect, it } from "vitest";
import { estimateLateFeeIdr } from "../src/lib/late-fee";

/**
 * FR-RNT-02.4 AC (mirror of the server check-in formula): grace 15,
 * 20 000 per started 30-minute block. 12:15 -> fee 0, 12:16 -> 20000,
 * 13:01 -> 40000.
 */
describe("estimateLateFeeIdr (check-in late-fee preview)", () => {
  it("is zero at or inside the grace window", () => {
    expect(estimateLateFeeIdr(0)).toBe(0);
    expect(estimateLateFeeIdr(15)).toBe(0); // exactly grace -> 0
    expect(estimateLateFeeIdr(-5)).toBe(0); // not late at all
  });

  it("one started block beyond grace -> one fee (AC: 12:16)", () => {
    expect(estimateLateFeeIdr(16)).toBe(20_000);
  });

  it("46 minutes beyond grace -> two blocks (AC: 13:01)", () => {
    expect(estimateLateFeeIdr(61)).toBe(40_000);
  });

  it("rounds partial blocks up, per started 30 minutes", () => {
    // 31 min beyond grace = 46 - 15 = 31 -> ceil(31/30) = 2 blocks
    expect(estimateLateFeeIdr(46)).toBe(40_000);
  });

  it("honours custom grace and rate (server config seams)", () => {
    expect(estimateLateFeeIdr(30, 0, 5_000)).toBe(5_000); // no grace, one block
    expect(estimateLateFeeIdr(15, 15, 20_000)).toBe(0); // grace covers it
  });
});
