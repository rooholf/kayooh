"use client";

/**
 * /masuk — phone-OTP sign-in (#20, FR-ID-01).
 *
 * Sign-in is OPTIONAL (revision 1.2): a guest books from a public session and
 * only needs an account to use promo codes/vouchers and to see booking
 * history. This page says so up front and carries a "lanjut tanpa akun"
 * escape at the top — it must never read as a gate.
 *
 * Two slotted steps (1 NOMOR → 2 OTP) on the established Poster Solidaritas
 * vocabulary. Server is the only authority: the code is issued, rate-limited
 * and verified by the API (`{ phoneNumber }` / `{ phoneNumber, code }` per
 * Better Auth phone-number plugin); a verified call lands the session cookie
 * on this origin and `GET /renters/me` prints the account back as `{phone}` —
 * no verification or deposit status exists in revision 1.2. No bike ids, no
 * coordinates (NEG-2/NEG-4).
 *
 * Mobile-first (NFR-07): 360 px minimum, 44 px+ targets, AA contrast.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { isValidNominalPhone, normalizePhone } from "@repo/contracts";
import { Slogan } from "../_components/Slogan";
import { useRentersMe, useSendOtp, useVerifyOtp } from "./_hooks/auth";

/** 60 s between sends (the API enforces the same per-phone cooldown). */
const RESEND_SECONDS = 60;

export default function MasukPage() {
  const me = useRentersMe();

  // Signed-in re-entry (or a fresh verify): the account plate replaces the form.
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const send = useSendOtp();
  const verify = useVerifyOtp();

  const otpRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (step === "otp") otpRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => (s > 1 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const phoneNorm = normalizePhone(phone);
  const phoneOk = isValidNominalPhone(phoneNorm);
  const codeOk = /^\d{6}$/.test(code);

  return (
    <main>
      <Slogan variant="red" text="SATU NOMOR HP ◆ SATU KODE" />
      <Slogan variant="yellow" text="NO PASSWORD ◆ ONE CODE" />

      <div className="alat">
        <p className="alat-merek">KAYOOH — MASUK</p>
        {/* The escape stays above every form step: sign-in is never a gate. */}
        <Link className="alat-link" href="/">
          Lanjut tanpa akun →
        </Link>
      </div>

      {me.isPending ? (
        <p className="notice notice--spaced" role="status">
          Memeriksa sesi…
        </p>
      ) : me.data ? (
        <AccountPlate phone={me.data.phone} />
      ) : (
        <>
          {/* ---- 1 NOMOR ---- */}
          {step === "phone" && (
            <section className="langkah-badan" aria-labelledby="judul-nomor">
            <h2 className="langkah-judul" id="judul-nomor">
              1 · Nomor HP
            </h2>
            <p className="catatan">
              Masuk itu pilihan, bukan syarat. Tanpa akun kamu tetap bisa
              memesan. Akun membuka <b>promo dan voucher</b> serta daftar
              reservasi yang dulu kamu buat — pesanan tamu dengan nomor yang
              sama otomatis terhubung.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!phoneOk || send.isPending) return;
                setCode("");
                send.mutate(phoneNorm, {
                  onSuccess: () => {
                    setCooldown(RESEND_SECONDS);
                    setStep("otp");
                  },
                });
              }}
            >
              <label className="medan">
                <span className="label">Nomor HP (WhatsApp)</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0812 3456 7890"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              {phone.length > 0 && !phoneOk && (
                <p className="medan-ket medan-ket--salah" role="alert">
                  Nomor belum sesuai. Contoh: 0812 3456 7890 atau +62 812 3456
                  7890.
                </p>
              )}
              {phoneOk && <p className="medan-ket">Dikenali sebagai {phoneNorm}</p>}

              <button type="submit" className="aksi" disabled={!phoneOk || send.isPending}>
                <span className="aksi-teks">
                  <small>kirim kode OTP</small>
                  <b>
                    {send.isPending
                      ? "Mengirim kode…"
                      : cooldown > 0
                        ? `Tunggu ${cooldown} s`
                        : phoneOk
                          ? "Kirim kode OTP"
                          : "Isi nomor HP untuk lanjut"}
                  </b>
                </span>
                <span className="aksi-panah" aria-hidden="true">
                  →
                </span>
              </button>
            </form>

            {send.isError && (
              <ErrorNotice
                error={send.error}
                pending={send.isPending}
                retryLabel="Kirim ulang"
                onRetry={() => phoneOk && send.mutate(phoneNorm, {
                  onSuccess: () => {
                    setCooldown(RESEND_SECONDS);
                    setStep("otp");
                  },
                })}
              />
              )}
            </section>
          )}

          {/* ---- 2 OTP ---- */}
          {step === "otp" && (
            <section className="langkah-badan" aria-labelledby="judul-otp">
              <h2 className="langkah-judul" id="judul-otp">
                2 · Kode OTP
              </h2>
              <p className="catatan">
                Kode 6 angka dikirim ke <b>{phoneNorm}</b>. Ketik tanpa spasi.
                Kode berlaku 5 menit; setelah 5 kali salah, kodenya batal dan
                kamu harus minta yang baru.
              </p>
              <label className="medan medan--otp">
                <span className="label">6 angka</span>
                <input
                  ref={otpRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="······"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
              </label>

              <button
                type="button"
                className="aksi"
                disabled={!codeOk || verify.isPending}
                onClick={() => verify.mutate({ phoneNumber: phoneNorm, code })}
              >
                <span className="aksi-teks">
                  <small>masuk dengan kode</small>
                  <b>
                    {verify.isPending
                      ? "Memeriksa kode…"
                      : codeOk
                        ? "Verifikasi & masuk"
                        : "Ketik 6 angka untuk lanjut"}
                  </b>
                </span>
                <span className="aksi-panah" aria-hidden="true">
                  →
                </span>
              </button>

              <p className="catatan">
                {cooldown > 0 ? (
                  <>Kirim ulang kode dalam <b>{cooldown} s</b>.</>
                ) : (
                  <button
                    type="button"
                    className="notice-recovery"
                    onClick={() =>
                      send.mutate(phoneNorm, {
                        onSuccess: () => {
                          setCooldown(RESEND_SECONDS);
                          setCode("");
                        },
                      })
                    }
                    disabled={send.isPending}
                  >
                    {send.isPending ? "Mengirim…" : "Kirim ulang kode"}
                  </button>
                )}
                {" · "}
                <button type="button" className="notice-recovery" onClick={() => setStep("phone")}>
                  Ganti nomor
                </button>
              </p>

              {verify.isError && (
                <ErrorNotice
                  error={verify.error}
                  pending={verify.isPending}
                  retryLabel="Cek ulang"
                  onRetry={() =>
                    codeOk && verify.mutate({ phoneNumber: phoneNorm, code })
                  }
                  onResend={() =>
                    send.mutate(phoneNorm, {
                      onSuccess: () => {
                        setCooldown(RESEND_SECONDS);
                        setCode("");
                      },
                    })
                  }
                />
              )}
            </section>
          )}
        </>
      )}

      <footer className="kaki">
        <p className="kaki-merek">KAYOOH — dari “kayuh”, mengayuh.</p>
        <p className="kaki-baris">
          Masuk dengan nomor HP dan kode sekali pakai — tanpa kata sandi.
          Sesi tinggal di cookie HttpOnly dan diperpanjang tiap pemakaian.
        </p>
      </footer>
    </main>
  );
}

/** The printed account plate: benefits in one place + the boxed escape to the list. */
function AccountPlate({ phone }: { phone: string }) {
  return (
    <>
      <section className="status-papan" aria-labelledby="judul-akun">
        <h1 className="langkah-judul" id="judul-akun">
          Akun aktif
        </h1>
        <p className="masuk-nomor">{phone}</p>
        <p className="catatan">
          Nomor ini adalah identitasmu di Jaringan Kayooh. Pesanan tamu yang
          pernah dibuat dengan nomor yang sama sudah terhubung ke akun ini.
        </p>
      </section>

      <section className="langkah-badan" aria-labelledby="judul-manfaat">
        <h2 className="langkah-judul" id="judul-manfaat">
          Yang terbuka lewat akun
        </h2>
        <ul className="tiket-daftar">
          <li>
            <b>Promo &amp; voucher</b> — kode promo dipakai saat checkout, hanya
            dengan akun.
          </li>
          <li>
            <b>Daftar reservasi</b> — semua tiket akunmu terkumpul di satu
            papan.
          </li>
          <li>
            <b>Tiket tamu terhubung</b> — pesanan lawas dengan nomor ini ikut
            masuk daftar.
          </li>
        </ul>
        <Link className="aksi" href="/reservasi">
          <span className="aksi-teks">
            <small>akun aktif</small>
            <b>Lihat reservasi kamu</b>
          </span>
          <span className="aksi-panah" aria-hidden="true">
            →
          </span>
        </Link>
      </section>
    </>
  );
}

/**
 * Honest copies for the three real failure shapes: 429 rate-limited,
 * 401 wrong/expired code, and everything else (network, server). The
 * envelope's own message is never printed — the code decides the verdict.
 */
function ErrorNotice({
  error,
  pending,
  retryLabel,
  onRetry,
  onResend,
}: {
  error: { status: number; code?: string };
  pending: boolean;
  retryLabel: string;
  onRetry: () => void;
  onResend?: () => void;
}) {
  const rate = error.status === 429;
  return (
    <div className="notice notice--merah" role="alert">
      {rate ? (
        <p>
          <b>Terlalu sering.</b> Tunggu sebentar, lalu minta kode baru. Batas
          pengiriman per nomor dan per perangkat berlaku.
        </p>
      ) : error.status === 401 ? (
        <p>
          <b>Kode tidak cocok.</b> Periksa lagi angkanya. Setelah 5 kali salah
          kodenya batal — minta yang baru untuk melanjutkan.
        </p>
      ) : (
        <p>
          <b>Gangguan jaringan.</b> Coba lagi — kalau masih gagal, cek
          koneksi dan buka ulang halaman.
        </p>
      )}
      <button type="button" className="notice-recovery" onClick={onRetry} disabled={pending}>
        {pending ? "Memproses…" : retryLabel}
      </button>
      {error.status === 401 && onResend && (
        <button type="button" className="notice-recovery" onClick={onResend} disabled={pending}>
          Kirim kode baru
        </button>
      )}
    </div>
  );
}
