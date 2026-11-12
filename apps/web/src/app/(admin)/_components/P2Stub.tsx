"use client";

/**
 * Honest P2 placeholder page: the section keeps its rail place, but the
 * board shows what is missing and why — never a fabricated number
 * (DESIGN.md: mock figures are labelled, never shipped as real).
 */
import { TopBar } from "../_components/TopBar";
import { Note, Panel, Actions, BtnLink } from "./ui";

export function P2StubPage({
  title,
  section,
  arrivesIn,
  backHref = "/admin",
}: {
  title: string;
  section: string;
  arrivesIn: string;
  backHref?: string;
}) {
  return (
    <>
      <TopBar title={title} meta="P2" />
      <main className="k-admin-content">
        <div className="k-board k-board--single">
          <Panel label={section} chip="P2">
            <p className="k-page-head">
              Modul {section.toLowerCase()} belum dibangun pada fase peluncuran (P1). Papan
              tidak menampilkan angka rekaan — nilai nyata muncul di sini begitu modul{" "}
              {arrivesIn} selesai.
            </p>
            <Note>
              Item antrian, angka uang, dan tombol aksi untuk bagian ini mengikuti jadwal
              fase {arrivesIn}. Semua perubahan yang masuk nanti tercatat di audit log.
            </Note>
            <Actions>
              <BtnLink href={backHref} variant="ghost">
                Kembali ke dashboard
              </BtnLink>
            </Actions>
          </Panel>
        </div>
      </main>
    </>
  );
}
