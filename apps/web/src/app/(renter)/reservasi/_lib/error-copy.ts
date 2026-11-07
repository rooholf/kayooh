/**
 * One honest Indonesian sentence per SRS §3.3 error code, each naming the
 * recovery (mock shop voice: say what happened, then what to do).
 *
 * There is deliberately NO `VERIFICATION_REQUIRED` and NO `DEPOSIT_REQUIRED`
 * (revision 1.2 removed both); if the server ever sent one it would fall
 * through to the generic line rather than invent a gate.
 */
export interface ErrorCopy {
  title: string;
  body: string;
}

const ERROR_COPY: Record<string, ErrorCopy> = {
  SOLD_OUT: {
    title: "Sepeda untuk jam ini habis",
    body: "Ada yang mengambil slot ini lebih dulu. Pilih jam atau jumlah lain lalu coba lagi.",
  },
  DUPLICATE_RESOURCE: {
    title: "Nomor ini sudah punya terlalu banyak reservasi",
    body: "Satu nomor HP boleh memegang paling banyak 3 reservasi aktif. Selesaikan atau tunggu salah satunya kedaluwarsa.",
  },
  IDEMPOTENCY_IN_PROGRESS: {
    title: "Permintaan sedang diproses",
    body: "Percobaan yang sama masih berjalan. Tunggu sebentar, lalu tekan sekali lagi.",
  },
  IDEMPOTENCY_KEY_REUSED: {
    title: "Percobaan ini sudah selesai",
    body: "Permintaan sebelumnya dengan kunci yang sama sudah tercatat. Mulai percobaan baru dari awal.",
  },
  UNAUTHENTICATED: {
    title: "Kode promo butuh akun",
    body: "Kode promo hanya untuk pengguna yang sudah masuk. Lanjutkan tanpa kode, atau masuk lebih dulu.",
  },
  OUTSIDE_OPENING_HOURS: {
    title: "Di luar jam buka",
    body: "Jam ambil atau jam kembali berada di luar jam buka outlet ini. Pilih jam di dalam jam buka.",
  },
  DURATION_OUT_OF_RANGE: {
    title: "Durasi tidak sesuai",
    body: "Durasi sewa harus kelipatan 15 menit, minimal 1 jam dan maksimal 24 jam.",
  },
  WINDOW_OUT_OF_RANGE: {
    title: "Waktu ambil tidak sesuai",
    body: "Pilih waktu ambil mulai hari ini sampai 7 hari ke depan.",
  },
  CATEGORY_NOT_OFFERED: {
    title: "Jenis ini tidak tersedia di outlet ini",
    body: "Outlet ini tidak menyediakan jenis sepeda yang dipilih. Pilih jenis lain atau outlet lain.",
  },
  PROMO_INVALID: {
    title: "Kode promo tidak berlaku",
    body: "Kode promo tidak dikenali. Periksa ejaannya atau lanjutkan tanpa kode.",
  },
  AMOUNT_BELOW_MINIMUM: {
    title: "Jumlah di bawah minimum",
    body: "Total sewa di bawah minimum pembayaran online. Tambah durasi atau jumlah sepeda.",
  },
  GATEWAY_UNAVAILABLE: {
    title: "Pembayaran sedang tidak tersedia",
    body: "Gateway pembayaran tidak merespons. Pilihanmu masih aman — tekan sekali lagi untuk mencoba.",
  },
  RATE_LIMITED: {
    title: "Terlalu banyak percobaan",
    body: "Tunggu sebentar sebelum mencoba lagi.",
  },
  STATE_CONFLICT: {
    title: "Status berubah",
    body: "Reservasi sudah berpindah status. Muat ulang untuk melihat keadaan terbaru.",
  },
  NOT_FOUND: {
    title: "Tidak ditemukan",
    body: "Reservasi ini tidak ada atau bukan milik tautan ini.",
  },
  VALIDATION_ERROR: {
    title: "Data belum lengkap",
    body: "Periksa kembali isian di atas — ada bagian yang belum sesuai.",
  },
};

const GENERIC: ErrorCopy = {
  title: "Gagal membuat reservasi",
  body: "Ada masalah di sisi server. Coba lagi sebentar lagi.",
};

export function errorCopy(code: string | undefined): ErrorCopy {
  if (code === undefined) return GENERIC;
  return ERROR_COPY[code] ?? GENERIC;
}
