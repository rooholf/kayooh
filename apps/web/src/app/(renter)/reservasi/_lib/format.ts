/**
 * Money + status formatting for the reservation sheet.
 *
 * Money is integer rupiah everywhere (INV-5): the only operation performed
 * here is formatting an integer the server returned — never float arithmetic.
 */
import type { ReservationStatus } from "@repo/contracts";

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/** "Rp10.000" from an integer rupiah amount. */
export function formatIdr(amount: number): string {
  return IDR.format(amount);
}

/** The online down payment + offline balance split, per bike (FR-INV-02.4). */
export function balanceIdr(finalIdr: number, dpIdr: number): number {
  return finalIdr - dpIdr;
}

export interface StatusStamp {
  label: string;
  /** The one sentence that says what produces this state. */
  rule: string;
  tone: "commit" | "paid" | "done" | "void";
}

export const STATUS_STAMP: Record<ReservationStatus, StatusStamp> = {
  held: {
    label: "Menunggu bayar",
    rule: "Stok dikunci server. Bayar DP sebelum hitungan habis.",
    tone: "commit",
  },
  confirmed: {
    label: "Lunas",
    rule: "DP diterima. Tunjukkan QR ke staf untuk mengambil sepeda.",
    tone: "paid",
  },
  fulfilled: {
    label: "Diambil",
    rule: "Sepeda sudah diserahkan staf. Sewa berjalan.",
    tone: "done",
  },
  expired: {
    label: "Kedaluwarsa",
    rule: "DP tidak dibayar sebelum hitungan habis. Stok dilepas untuk orang lain.",
    tone: "void",
  },
  cancelled: {
    label: "Batal",
    rule: "Pembayaran gagal di gateway. Buat reservasi baru dengan kunci baru.",
    tone: "void",
  },
  no_show: {
    label: "Hangus",
    rule: "Tidak diambil sampai 1 jam setelah jam mulai. Dinyatakan no-show.",
    tone: "void",
  },
};

export function statusStamp(status: ReservationStatus): StatusStamp {
  return STATUS_STAMP[status];
}
