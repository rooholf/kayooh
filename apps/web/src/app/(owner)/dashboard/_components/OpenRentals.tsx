/**
 * Open rentals list: shows active rentals with bike tag, masked phone,
 * and return time. Overdue rentals are flagged.
 */
import type { OpenRentalRow } from "../_lib/types";

function formatWibTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    }) + " WIB";
  } catch {
    return iso;
  }
}

export function OpenRentals({ rentals }: { rentals: OpenRentalRow[] }) {
  if (rentals.length === 0) {
    return (
      <section aria-label="Sewa berjalan">
        <div className="owner-section-title">Sewa Berjalan</div>
        <div className="owner-empty">Tidak ada sewa yang sedang aktif.</div>
      </section>
    );
  }

  return (
    <section aria-label="Sewa berjalan">
      <div className="owner-section-title">
        <span>Sewa Berjalan ({rentals.length})</span>
      </div>
      <div>
        {rentals.map((r, i) => (
          <div key={i} className="owner-rental-row">
            <div>
              <div className="owner-rental-bike">{r.bikeAssetTag}</div>
              <div className="owner-rental-phone">{r.renterPhoneMasked}</div>
            </div>
            <div>
              <div className="owner-rental-time">
                sampai {formatWibTime(r.expectedEndAt)}
              </div>
              {r.overdue && (
                <div className="owner-rental-overdue">
                  Terlambat (Tahap {r.escalationStage})
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
