/**
 * /[outletCode] — the white-labeled direct booking page (FR-CAT-01, rev 1.3).
 *
 * The link-in-bio landing: an owner drops `https://<host>/JMB-001` in their
 * social bio and a renter lands HERE — on that owner's own poster — not on an
 * outlet directory. This server component resolves the outlet by code
 * (`GET /outlets/by-code/{code}`, 404 honest-not-found for unknown/inactive),
 * loads its live availability (counts only, NEG-2) and a real per-category
 * price quote for the default window (2 jam · 1 sepeda — the same window the
 * checkout prefills, FR-PRC-01). The client isle keeps counts live via SSE
 * and hands the funnel to "Book Now!!" → `/reservasi/baru?outlet=&jenis=`
 * with only the phone left to fill.
 *
 * The aesthetic is the incumbent Poster Solidaritas sheet — motifs unchanged;
 * the multi-outlet "Ketersediaan Langsung" directory is gone (SUPersedes the
 * old global landing).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { vOutletCode, type OutletListItem } from "@repo/contracts";
import { Slogan } from "../_components/Slogan";
import { Bicycle } from "../_components/Bicycle";
import { DemoTag } from "../_components/DemoTag";
import { CATEGORY_ORDER, totalUnits, wibDateParts, formatTodayHours } from "../_components/shared";
import { defaultWindow } from "../booking/_lib/window";
import { formatIdr } from "../reservasi/_lib/format";

interface LandingQuote {
  priceIdr: number;
  dpIdr: number;
}

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

/** Direct entry is inherently live data; always render fresh. */
export const dynamic = "force-dynamic";

type Fetch =
  | { kind: "ok"; outlet: OutletListItem }
  | { kind: "missing" }
  | { kind: "failed" };

async function fetchOutletByCode(raw: string): Promise<Fetch> {
  // Malformed codes are a wrong link, not an outage: same honest 404 path.
  if (!vOutletCode.safeParse(raw).success) return { kind: "missing" };
  try {
    const res = await fetch(`${API_BASE}/api/v1/outlets/by-code/${raw}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 404) return { kind: "missing" };
    if (!res.ok) return { kind: "failed" };
    const outlet = (await res.json()) as OutletListItem;
    return outlet && typeof outlet.code === "string"
      ? { kind: "ok", outlet }
      : { kind: "missing" };
  } catch {
    return { kind: "failed" };
  }
}

/** Real server quote for the default window; null on any failure (never invented). */
async function fetchQuote(
  outlet: OutletListItem,
  window: ReturnType<typeof defaultWindow>,
  category: string,
): Promise<LandingQuote | null> {
  if (window === null) return null;
  try {
    const res = await fetch(`${API_BASE}/api/v1/pricing/quote`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        outletId: outlet.id,
        category,
        startsAt: window.startsAt.toISOString(),
        endsAt: window.endsAt.toISOString(),
        quantity: 1,
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { priceIdr?: number; dpIdr?: number };
    if (typeof body.priceIdr !== "number" || typeof body.dpIdr !== "number") return null;
    return { priceIdr: body.priceIdr, dpIdr: body.dpIdr };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ outletCode: string }>;
}): Promise<Metadata> {
  const { outletCode } = await params;
  const code = outletCode.toUpperCase();
  const fetched = await fetchOutletByCode(code);
  const name = fetched.kind === "ok" ? fetched.outlet.name : code;
  return {
    title: `KAYOOH — Sepeda siap di ${name}`,
    description: `Pesan sepeda langsung di ${name}: pilih jenis, jam dan jumlah, bayar DP 50% saat checkout, ambil di konter dengan QR.`,
  };
}

export default async function OutletLandingPage({
  params,
}: {
  params: Promise<{ outletCode: string }>;
}) {
  const { outletCode } = await params;
  const code = outletCode.toUpperCase();
  const fetched = await fetchOutletByCode(code);
  if (fetched.kind === "missing") notFound();

  const failure = fetched.kind === "failed";
  const outlet = fetched.kind === "ok" ? fetched.outlet : null;

  const jamHariIni = outlet ? formatTodayHours(outlet.hours) : null;
  const { weekday, dayMonth } = wibDateParts();

  // Offered categories in a stable order (zero-stock ones are omitted server-side).
  const offered = outlet
    ? (Object.keys(outlet.availability).sort(
        (a, b) =>
          (CATEGORY_ORDER as readonly string[]).indexOf(a) -
          (CATEGORY_ORDER as readonly string[]).indexOf(b),
      ) as string[])
    : [];

  // A real quote for the headline category — feeds the "Mulai Rp …" line on
  // the Book Now!! button. The checkout re-quotes with the renter's picks.
  const window = outlet ? defaultWindow(outlet.hours, new Date()) : null;
  const headlineCategory = offered[0] ?? "commuter";
  const headlineQuote = outlet
    ? await fetchQuote(outlet, window, headlineCategory)
    : null;

  const units = outlet ? totalUnits([outlet]) : 0;

  return (
    <main>
      <Slogan variant="red" text="SEPEDA SIAP ◆ DI OUTLET NYATA" />
      <Slogan variant="yellow" text="A BIKE IS WAITING ◆ AT A REAL OUTLET" />

      <div className="alat">
        <p className="alat-merek">KAYOOH — {code}</p>
        <Link className="alat-link" href="/masuk">
          Masuk →
        </Link>
      </div>

      {/* ---- the emblem plate ---- */}
      <section className="plate" aria-label="Kayooh Jambi">
        <div className="plate-top">
          <h1 className="masthead">
            KAYOOH<small>JAMBI</small>
          </h1>
          <p className="tanggal">
            <b>{weekday}</b>
            <i>{dayMonth}</i>
          </p>
        </div>

        <Bicycle />

        {failure ? (
          <div className="plate-note" role="alert">
            Papan tidak bisa dibuka — angka sepeda siap tidak bisa dihitung
            sekarang. <a className="notice-link-action" href={href(outletCode)}>Muat ulang</a>
          </div>
        ) : (
          <div className="siap">
            <b>{units}</b>
            <span>unit siap sekarang · dihitung oleh server</span>
          </div>
        )}

        <p className="plate-foot">
          Angka ini datang dari <b>satu transaksi di server</b>, bukan dari
          salinan di ponselmu, dan dikunci saat pesanan dibuat.
        </p>
      </section>

      {outlet !== null && (
        <>
          <section className="katalog katalog--flush" aria-labelledby="outlet-judul">
            <div className="outlet-identifikasi">
              <div className="pos-head">
                <div>
                  <h2 className="pos-nama" id="outlet-judul">
                    {outlet.name}
                  </h2>
                  <p className="pos-alamat">{outlet.address}</p>
                </div>
                <span
                  className={`chip ${outlet.isOpenNow ? "chip--buka" : "chip--tutup"}`}
                >
                  {outlet.isOpenNow ? "Buka" : "Tutup"}
                </span>
              </div>

              <p className="outlet-jam" aria-label="Jam buka hari ini">
                {jamHariIni !== null ? (
                  <>
                    Hari ini <b>{jamHariIni} WIB</b>
                  </>
                ) : (
                  "Jam buka hari ini belum diumumkan outlet ini."
                )}
              </p>
              {outlet.description !== null && outlet.description !== undefined && (
                <p className="outlet-ciri">{outlet.description}</p>
              )}
            </div>

            <DemoTag />
          </section>

          <Link
            className="aksi"
            href={`/reservasi/baru?outlet=${outlet.id}&jenis=${headlineCategory}`}
          >
            <span className="aksi-teks">
              <small>
                {headlineQuote !== null
                  ? `Mulai ${formatIdr(headlineQuote.priceIdr)} · DP 50% ${formatIdr(headlineQuote.dpIdr)}`
                  : "2 jam · 1 sepeda"}
              </small>
              <b>Book Now!!</b>
            </span>
            <svg
              className="aksi-panah"
              width="34"
              height="34"
              viewBox="0 0 34 34"
              aria-hidden="true"
            >
              <path
                d="M6 17 H25 M17 6 L28 17 L17 28"
                fill="none"
                stroke="currentColor"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>

          <p className="serah-terima">
            Ambil di konter outlet dengan pindaian QR. Hanya kehadiran staf
            yang memindahkan sepeda — tidak ada cara lain.
          </p>
        </>
      )}

      <footer className="kaki">
        <p className="kaki-merek">KAYOOH — dari “kayuh”, mengayuh.</p>
        <p className="kaki-baris">
          Sepeda siap di outlet nyata. Ambil di konter dengan pindaian QR,
          kembalikan di outlet milik owner yang sama. Ketersediaan selalu
          dihitung oleh server.
        </p>
      </footer>
    </main>
  );
}

function href(outletCode: string): string {
  return `/${outletCode.toUpperCase()}`;
}
