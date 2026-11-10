/**
 * Top bar: brand plate on left, WIB date on right.
 */
export function OwnerTopBar() {
  const now = new Date();
  // WIB is UTC+7
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);

  const days = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
  const dayName = days[wib.getUTCDay()];
  const dd = String(wib.getUTCDate()).padStart(2, "0");
  const mm = String(wib.getUTCMonth() + 1).padStart(2, "0");

  return (
    <div className="owner-top">
      <div className="owner-merek">
        KAYOOH
        <span>PEMILIK</span>
      </div>
      <div className="owner-tgl">
        <b>{dayName}</b>
        {dd}/{mm}
      </div>
    </div>
  );
}
