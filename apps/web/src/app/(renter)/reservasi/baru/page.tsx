"use client";

/**
 * /reservasi/baru — the claim-ticket checkout ("Tiket Ambil", steps 1 PILIH →
 * 2 DATA → 3 BAYAR). Reached directly from the link-in-bio poster with
 * `?outlet=<id>&jenis=` (revision 1.3); the slot/duration/quantity pickers
 * arrive pre-filled and stay changeable — the only required input is the
 * phone.
 *
 * Server is the only authority: the quote, the availability count and the lock
 * all come from responses (INV-1). Nothing is optimistic. Counts only, never
 * bike ids (NEG-2); no coordinates leave this surface (NEG-4). Guest checkout
 * (revision 1.2): the renter books with a phone number; sign-in is optional and
 * only needed for a promoCode, which this build never sends.
 *
 * Mobile-first (NFR-07): 360 px minimum, 44 px+ targets, AA contrast.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { isValidNominalPhone, normalizePhone, type OutletListItem } from "@repo/contracts";
import { Slogan } from "../../_components/Slogan";
import {
  availabilityCount,
  CATEGORY_LABEL,
  isCategoryCode,
  type CategoryCode,
} from "../../_components/shared";
import { MAX_ADVANCE_DAYS, MAX_QUANTITY, durationLabel } from "../_lib/config";
import {
  dayOptions,
  wibDateKey,
  wibInstant,
  windowLabel,
  type DayOption,
} from "../_lib/schedule";
import {
  slotsForDay,
  dayIntervals,
  fitsWindow,
  defaultWindow,
  DEFAULT_DURATION_MINUTES,
} from "../../booking/_lib/window";
import { formatIdr } from "../_lib/format";
import { errorCopy } from "../_lib/error-copy";
import { listGuestReservationIds, saveGuestToken } from "../_lib/guest-token-store";
import { savePaymentUrl } from "../_lib/handoff-store";
import { useOutlets } from "../_hooks/useOutlets";
import { useQuote } from "../_hooks/useQuote";
import { useCreateReservation } from "../_hooks/useCreateReservation";
import { Invoice, StepStamps } from "../_components/Ticket";
import { DayStrip, DurationRow, QuantityRow, SlotGrid, CategoryRow } from "../_components/Picker";

function ReservasiInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const outlets = useOutlets();
  const create = useCreateReservation();

  const paramOutlet = searchParams.get("outlet") ?? "";
  const paramJenis = searchParams.get("jenis");
  const initialCategory: CategoryCode = isCategoryCode(paramJenis) ? paramJenis : "commuter";
  const [category, setCategory] = useState<CategoryCode>(initialCategory);

  const [now] = useState(() => new Date());
  const days = useMemo<DayOption[]>(() => dayOptions(now, MAX_ADVANCE_DAYS), [now]);
  const [dayKey, setDayKey] = useState(() => wibDateKey(now));
  const [slot, setSlot] = useState<string | null>(null);
  const [durationMin, setDurationMin] = useState<number>(DEFAULT_DURATION_MINUTES);
  const [quantity, setQuantity] = useState(1);
  const [phone, setPhone] = useState("");
  const [knownTickets, setKnownTickets] = useState<string[]>([]);

  const outlet: OutletListItem | null = useMemo(
    () => outlets.data?.outlets.find((o) => o.id === paramOutlet) ?? null,
    [outlets.data, paramOutlet],
  );

  const hours = outlet?.hours;
  const { slots, closed } = useMemo(
    () => (outlet ? slotsForDay(hours, dayKey, durationMin, now) : { slots: [], closed: new Set<string>() }),
    [outlet, hours, dayKey, durationMin, now],
  );

  // Funnel revision 1.3: the picker arrives PRE-FILLED — today's first
  // bookable slot at the default duration, else the first day within the
  // horizon that has one. Pickers stay visible and changeable; the phone is
  // the only required input. Never invents a window: with no bookable slot
  // anywhere, slot stays null and the page says "pilih jam ambil".
  const didPrefill = useRef(false);
  useEffect(() => {
    if (didPrefill.current || outlet === undefined) return;
    if (outlet === null) return; // wait for the real outlet
    didPrefill.current = true;
    const win = defaultWindow(outlet.hours, now, durationMin, days);
    if (win === null) return;
    setDayKey(win.dayKey);
    setSlot(win.slot);
  }, [outlet, now, days, durationMin]);

  function changeDay(next: string) {
    setDayKey(next);
    setSlot(null);
  }

  function changeDuration(next: number) {
    setDurationMin(next);
    if (slot !== null && !fitsWindow(slot, next, dayIntervals(hours, dayKey))) {
      setSlot(null);
    }
  }

  // "Check my reservation" — the tickets this device holds a token for.
  useEffect(() => {
    setKnownTickets(listGuestReservationIds());
  }, []);

  const startsAt = slot === null ? null : wibInstant(dayKey, slot);
  const endsAt =
    startsAt === null ? null : new Date(startsAt.getTime() + durationMin * 60_000);

  const quoteInput = useMemo(
    () =>
      outlet && startsAt && endsAt
        ? {
            outletId: outlet.id,
            category,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            quantity,
          }
        : null,
    [outlet, category, startsAt, endsAt, quantity],
  );
  const quote = useQuote(quoteInput);

  const phoneNorm = normalizePhone(phone);
  const phoneOk = isValidNominalPhone(phoneNorm);
  const nowCount = outlet ? availabilityCount(outlet, category) : 0;

  const canCommit = outlet !== null && slot !== null && phoneOk && !create.isPending;
  const step = slot === null ? 1 : !phoneOk ? 2 : 3;

  const dayOption = days.find((d) => d.key === dayKey) ?? null;
  const summary =
    slot !== null && endsAt !== null && dayOption !== null
      ? `${CATEGORY_LABEL[category]} · ${dayOption.dayMonth} ${windowLabel(
          wibInstant(dayKey, slot).toISOString(),
          endsAt.toISOString(),
        )} · ${durationLabel(durationMin)} · ${quantity} sepeda`
      : `${CATEGORY_LABEL[category]} · pilih jam ambil`;

  function submit() {
    if (outlet === null || slot === null || startsAt === null || endsAt === null) return;
    if (!phoneOk) return;
    create.mutate(
      {
        outletId: outlet.id,
        category,
        quantity,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        contactPhone: phoneNorm,
      },
      {
        onSuccess: (data) => {
          const id = data.reservation.id;
          if (data.guestToken !== undefined) saveGuestToken(id, data.guestToken);
          if (data.paymentUrl !== undefined) {
            savePaymentUrl(id, data.paymentUrl);
            window.location.assign(data.paymentUrl);
            return;
          }
          router.replace(`/reservasi/${id}`);
        },
      },
    );
  }

  const failure = create.error ? errorCopy(create.error.code) : null;
  const retryable =
    create.error !== null &&
    ["GATEWAY_UNAVAILABLE", "IDEMPOTENCY_IN_PROGRESS", "STATE_CONFLICT"].includes(
      create.error.code ?? "",
    );

  if (outlets.isLoading) {
    return (
      <main>
        <Slogan variant="red" text="TIKET AMBIL ◆ SEPEDA SIAP DI OUTLET NYATA" />
        <p className="notice notice--spaced" role="status">
          Memuat outlet…
        </p>
      </main>
    );
  }

  if (!outlet) {
    return (
      <main>
        <Slogan variant="red" text="TIKET AMBIL ◆ SEPEDA SIAP DI OUTLET NYATA" />
        <section className="status-papan">
          <h1 className="langkah-judul">Tiket ambil</h1>
          <p className="notice" role="status">
            <b>Outlet tidak dikenali.</b> Mulai dari poster outlet atau
            poster KAYOOH untuk memilih outlet dan jenis sepeda.
          </p>
          <Link className="kembali" href="/">
            Poster KAYOOH →
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main>
      <Slogan variant="red" text="TIKET AMBIL ◆ SEPEDA SIAP DI OUTLET NYATA" />
      <Slogan variant="yellow" text="A CLAIM TICKET ◆ FOR A REAL OUTLET" />

      <div className="alat">
        <p className="alat-merek">KAYOOH — TIKET AMBIL</p>
        <Link className="muat-ulang" href={`/${outlet.code}`}>
          ← Ganti
        </Link>
      </div>

      <p className="ringkas">{summary}</p>
      <StepStamps current={step} />

      {/* ---- 1 PILIH ---- */}
      <section className="langkah-badan" aria-labelledby="judul-pilih">
        <h2 className="langkah-judul" id="judul-pilih">
          1 · Pilih jenis, jam &amp; durasi
        </h2>

        <p className="label" style={{ marginTop: 8 }}>
          Jenis sepeda
        </p>
        <CategoryRow
          value={category}
          counts={outlet ? outlet.availability : null}
          onChange={setCategory}
        />

        <p className="label" style={{ marginTop: 8 }}>
          Hari ambil
        </p>
        <DayStrip days={days} value={dayKey} onChange={changeDay} />

        <p className="label" style={{ marginTop: 8 }}>
          Jam ambil · WIB
        </p>
        <SlotGrid
          slots={slots}
          value={slot}
          closed={closed}
          onChange={(s) => setSlot(s)}
        />

        <p className="label" style={{ marginTop: 14 }}>
          Durasi
        </p>
        <DurationRow value={durationMin} onChange={changeDuration} />

        <p className="label" style={{ marginTop: 14 }}>
          Jumlah sepeda
        </p>
        <QuantityRow value={quantity} max={MAX_QUANTITY} onChange={setQuantity} />
        <p className={`sedia${nowCount === 0 ? " sedia--nol" : ""}`}>
          Siap sekarang: <b>{nowCount}</b> {CATEGORY_LABEL[category]} di outlet ini
        </p>
        {nowCount === 0 && (
          <p className="notice">
            Outlet ini belum menghitung unit siap untuk jenis ini. Kamu tetap
            bisa mencoba — server yang memutuskan saat stok dikunci.
          </p>
        )}
      </section>

      {/* ---- 2 DATA ---- */}
      <section className="langkah-badan" aria-labelledby="judul-data">
        <h2 className="langkah-judul" id="judul-data">
          2 · Nomor HP
        </h2>
        <p className="catatan">
          Tamu boleh memesan tanpa akun. Nomor ini menjadi identitas
          reservasimu — tautan tiket dikirim ke nomor ini.
        </p>
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
            Nomor belum sesuai. Contoh: 0812 3456 7890 atau +62 812 3456 7890.
          </p>
        )}
        {phoneOk && <p className="medan-ket">Dikenali sebagai {phoneNorm}</p>}
      </section>

      {/* ---- 3 BAYAR ---- */}
      <section className="langkah-badan" aria-labelledby="judul-bayar">
        <h2 className="langkah-judul" id="judul-bayar">
          3 · Bayar DP
        </h2>
        <p className="catatan">
          Stok dikunci di server setelah kamu menekan tombol. DP 50% dibayar
          online; sisanya dibayar di outlet saat pengambilan (FR-RNT-01). Tidak
          ada pembatalan dari sisi penyewa — stok dilepas otomatis sebagai
          no-show 1 jam setelah jam mulai.
        </p>

        {quoteInput === null ? (
          <p className="notice">Pilih jam ambil dan durasi dulu untuk melihat harga.</p>
        ) : quote.isLoading ? (
          <p className="notice" role="status">
            Menghitung harga…
          </p>
        ) : quote.isError ? (
          <div className="notice notice--merah" role="alert">
            <p>{errorCopy(quote.error.code).body}</p>
            <button type="button" className="notice-recovery" onClick={() => void quote.refetch()}>
              Hitung ulang
            </button>
          </div>
        ) : quote.data ? (
          <Invoice
            priceIdr={quote.data.priceIdr}
            discountIdr={quote.data.discountIdr}
            finalIdr={quote.data.finalIdr}
            dpIdr={quote.data.dpIdr}
            quantity={quantity}
          />
        ) : null}

        {failure && (
          <div className="notice notice--merah" role="alert">
            <p>
              <b>{failure.title}.</b> {failure.body}
            </p>
            {retryable && (
              <button
                type="button"
                className="notice-recovery"
                onClick={submit}
                disabled={create.isPending}
              >
                Coba lagi
              </button>
            )}
          </div>
        )}
      </section>

      <button
        type="button"
        className="aksi"
        disabled={!canCommit}
        onClick={submit}
      >
        <span className="aksi-teks">
          <small>
            {quote.data ? `DP online ${formatIdr(quote.data.dpIdr)}` : "DP 50% online"}
          </small>
          <b>
            {create.isPending
              ? "Mengunci stok…"
              : slot === null
                ? "Pilih jam ambil"
                : !phoneOk
                  ? "Isi nomor HP untuk lanjut"
                  : "Kunci stok & bayar DP"}
          </b>
        </span>
        <span className="aksi-panah" aria-hidden="true">
          →
        </span>
      </button>

      {knownTickets.length > 0 && (
        <section className="langkah-badan" aria-labelledby="judul-tiket">
          <h2 className="langkah-judul" id="judul-tiket">
            Tiket di perangkat ini
          </h2>
          <ul className="tiket-daftar">
            {knownTickets.map((id) => (
              <li key={id}>
                <Link className="kembali" href={`/reservasi/${id}`}>
                  Cek tiket {id.slice(0, 8)} →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link className="kembali" href={`/reservasi`}>
        ← Semua reservasi
      </Link>
    </main>
  );
}

export default function ReservasiBaruPage() {
  return (
    <Suspense
      fallback={
        <p className="notice notice--spaced" role="status">
          Memuat tiket…
        </p>
      }
    >
      <ReservasiInner />
    </Suspense>
  );
}
