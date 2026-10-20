import { useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "./ui";
import { DetailSheet } from "./DetailSheet";

/**
 * The deal's position breakdown and schedules: charts and detailed data, so they open in the shared sheet or
 * modal instead of folding open inside the deal card. The row in the card shows what's inside and a one-line read.
 */
export function DealDetails({ bars, barsSummary, schedule, scheduleSummary }: {
  bars: ReactNode; barsSummary: ReactNode; schedule: ReactNode; scheduleSummary: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="dd-link" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="dd-text"><b>Position breakdown and schedules</b><small>{barsSummary}</small></span>
        <Icon name="chev" size={16} />
      </button>
      {open && (
        <DetailSheet className="dd-sheet" onClose={() => setOpen(false)} title={<h2 className="ds-h">Deal details</h2>}>
          <div className="dd-body">
            <section className="dd-sec fold-bars" aria-labelledby="dd-bars">
              <h3 className="dd-h" id="dd-bars">Position breakdown</h3>
              <p className="dd-sum">{barsSummary}</p>
              {bars}
            </section>
            <section className="dd-sec" aria-labelledby="dd-sched">
              <h3 className="dd-h" id="dd-sched">Schedules ahead</h3>
              <p className="dd-sum">{scheduleSummary}</p>
              {schedule}
            </section>
          </div>
        </DetailSheet>
      )}
    </>
  );
}
