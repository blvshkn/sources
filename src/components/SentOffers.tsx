import { useEffect, useState } from "react";
import { TEAMS, playerById } from "../data";
import { SentDeal, SentOffer, ago, sentDeals } from "../sentOffers";
import { TeamAvatar } from "./TeamPicker";
import { PairPrompt } from "./SyncDevices";
import { useSyncStatus } from "../syncKey";
import { Icon } from "./ui";

/** The clock for "sent 2h ago": ticks once a minute while something shows it. */
export function useNow(every = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), every); return () => window.clearInterval(id); }, [every]);
  return now;
}

const nameOf = (id: string) => playerById(id)?.name ?? id.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const names = (ids: string[]) => ids.map(nameOf).join(", ");
export const partnerOf = (id: string) => TEAMS.find((t) => t.id === id);
const managerOf = (id: string) => partnerOf(id)?.manager ?? "A league mate";

/** Where a deal stands. A version that went through makes the whole deal accepted. */
export function dealStatus(d: SentDeal): "pending" | "declined" | "accepted" {
  if ([d.head, ...d.earlier].some((o) => o.status === "accepted")) return "accepted";
  return d.head.status === "declined" ? "declined" : "pending";
}
const LABEL = { pending: "Waiting", declined: "Declined", accepted: "Accepted" } as const;

/** "Sent 2h ago", or "v2 · sent 10m ago" once there's more than one version */
function When({ o, now }: { o: SentOffer; now: number }) {
  return o.version > 1
    ? <span className="so-when"><span className="num">v{o.version}</span> · sent {ago(o.sentAt, now)}</span>
    : <span className="so-when">Sent {ago(o.sentAt, now)}</span>;
}

function Row({ d, now, onReopen, onDecline, onClear }: { d: SentDeal; now: number; onReopen: (o: SentOffer) => void; onDecline: (o: SentOffer) => void; onClear: (o: SentOffer) => void }) {
  const [open, setOpen] = useState(false);
  const { head, earlier } = d;
  const team = partnerOf(head.partnerId);
  const st = dealStatus(d);
  return (
    <li className={`so-row is-${st}`}>
      <button type="button" className="so-open" onClick={() => onReopen(head)} aria-label={`Open your offer to ${managerOf(head.partnerId)} in the builder`}>
        {team ? <TeamAvatar t={team} size={36} /> : <span className="so-av-empty" aria-hidden="true" />}
        <span className="so-main">
          <span className="so-top"><b className="so-name">{managerOf(head.partnerId)}</b><span className={`so-status is-${st}`}>{LABEL[st]}</span></span>
          <span className="so-line"><span className="so-k">Out</span><span className="so-p">{names(head.give)}</span></span>
          <span className="so-line"><span className="so-k">In</span><span className="so-p">{names(head.get)}</span></span>
          <When o={head} now={now} />
        </span>
        <Icon name="chev" size={16} />
      </button>
      <div className="so-acts">
        {st === "pending" && <button type="button" className="so-act" onClick={() => onDecline(head)}>Mark declined</button>}
        <button type="button" className="so-act" onClick={() => onClear(head)}>Clear</button>
        {earlier.length > 0 && (
          <button type="button" className="so-act so-more" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
            <span><span className="num">{earlier.length}</span> earlier {earlier.length > 1 ? "versions" : "version"}</span><Icon name="chev" size={14} />
          </button>
        )}
      </div>
      {open && earlier.length > 0 && (
        <ul className="so-earlier" aria-label="Earlier versions">
          {earlier.map((o) => (
            <li key={o.id}>
              <button type="button" className="so-ver" onClick={() => onReopen(o)} aria-label={`Open version ${o.version} in the builder`}>
                <span className="so-vn num">v{o.version}</span>
                <span className="so-vp">{names(o.give)} for {names(o.get)}</span>
                <span className="so-when">{o.status === "accepted" ? "Accepted" : ago(o.sentAt, now)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Trade's Sent tab: every deal you sent, newest first. Tapping one opens it in the builder, filled in. */
export function SentOffers({ offers, synced = false, syncUser = "", onReopen, onDecline, onClear }: {
  offers: SentOffer[]; synced?: boolean; syncUser?: string; onReopen: (o: SentOffer) => void; onDecline: (o: SentOffer) => void; onClear: (o: SentOffer) => void;
}) {
  const now = useNow();
  const deals = sentDeals(offers);
  const { needsPair } = useSyncStatus(syncUser);
  return (
    <section className="card so-card" aria-label="Sent offers">
      <div className="so-head">
        <h2 className="section-title">Sent offers</h2>
        {needsPair ? <PairPrompt user={syncUser} /> : <p className="so-note">{synced ? "Synced to your paired devices" : "Saved on this device"}</p>}
      </div>
      {deals.length === 0
        ? <p className="so-empty">Nothing sent yet. When you share or copy a pitch, the deal lands here so you can follow up or send a new version.</p>
        : <ul className="so-list">{deals.map((d) => <Row key={d.head.deal} d={d} now={now} onReopen={onReopen} onDecline={onDecline} onClear={onClear} />)}</ul>}
    </section>
  );
}

/** The Wire's line about your latest offer: still out, or just accepted. */
export function SentLine({ d, onOpen }: { d: SentDeal; onOpen: (o: SentOffer) => void }) {
  const now = useNow();
  const who = managerOf(d.head.partnerId);
  const st = dealStatus(d);
  const acc = [d.head, ...d.earlier].find((o) => o.status === "accepted");
  return (
    <button type="button" className="brief-row so-wire" onClick={() => onOpen(d.head)}>
      <span className="brief-k">{st === "accepted" ? "Accepted" : "Offer out"}</span>
      <span className="grow">{st === "accepted" ? `${who} accepted your offer ${ago(acc?.statusAt ?? d.head.sentAt, now)}` : `You sent ${who} an offer ${ago(d.head.sentAt, now)}`}</span>
      <Icon name="chev" size={16} />
    </button>
  );
}
