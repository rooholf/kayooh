import type { OutletListItem } from "@repo/contracts";
import { OutletTicket } from "./OutletTicket";
import type { CategoryCode } from "./shared";

/** The ruled list of outlet tickets. Pure presentation — data comes from the server. */
export function OutletList({
  outlets,
  selectedCategory,
  headingLevel = "h3",
}: {
  outlets: OutletListItem[];
  selectedCategory?: CategoryCode;
  headingLevel?: "h2" | "h3";
}) {
  return (
    <ul className="kartupos">
      {outlets.map((outlet) => (
        <OutletTicket
          key={outlet.id}
          outlet={outlet}
          selectedCategory={selectedCategory}
          headingLevel={headingLevel}
        />
      ))}
    </ul>
  );
}
