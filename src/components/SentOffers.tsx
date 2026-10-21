import { useEffect, useMemo, useRef, useState } from "react";
import { Pos, TEAMS, playerById } from "../data";
import { DeclineWhy, SentDeal, SentOffer, WhyKind, ago, sentDeals } from "../sentOffers";
import { WHY_PICKS, thinOptions, whyEffect, whyLabel } from "../declineWhy";
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

const last = (id: string) => nameOf(id).split(" ").slice(-1)[0];

/**
 * Why he passed: quick picks plus a note, inside the row. "Thin at" is one chip per position: the ones you asked
 * him for, then his short spots. A pick that names a player asks which one when the deal has more than one.
 */
function WhyPanel({ o, onSave, onCancel }: { o: SentOffer; onSave: (w: DeclineWhy | null) => void; onCancel: () => void }) {
  const thin = useMemo(() => thinOptions(o), [o.partnerId, o.get.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [kind, setKind] = useState<WhyKind | null>(o.why?.kind ?? null);
  const [pos, setPos] = useState<Pos | undefined>(o.why?.pos);
  const [pid, setPid] = useState<string | undefined>(o.why?.playerId);
  const [note, setNote] = useState(o.why?.note ?? "");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector<HTMLElement>("[aria-pressed='true'], .so-why-chip")?.focus({ preventScroll: true }); }, []);
  const needs = WHY_PICKS.find((p) => p.kind === kind)?.needs;
  const side = needs === "give" ? o.give : needs === "get" ? o.get : [];
  const playerId = side.length === 1 ? side[0] : pid && side.includes(pid) ? pid : undefined;
  const ready = kind === "thin" ? !!pos : needs ? !!playerId : kind === "other" ? note.trim().length > 0 : !!kind;
  const save = () => {
    if (!ready || !kind) return;
    const w: DeclineWhy = { kind, at: Date.now() };
    if (kind === "thin" && pos) w.pos = pos;
    if (needs && playerId) w.playerId = playerId;
    if (note.trim()) w.note = note.trim().slice(0, 280);
    onSave(w);
  };
  const chip = (on: boolean, label: string, pick: () => void, key = label) => (
    <button key={key} type="button" className="so-why-chip" aria-pressed={on} onClick={pick}>{label}</button>
  );
  return (
    <div ref={box} className="so-why-panel" role="group" aria-label={`Why ${managerOf(o.partnerId)} declined`}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }}>
      <p className="so-why-q">Why did {managerOf(o.partnerId)} pass?</p>
      <div className="so-why-chips">
        {thin.map((p) => chip(kind === "thin" && pos === p, `Thin at ${p}`, () => { setKind("thin"); setPos(p); }, `thin-${p}`))}
        {WHY_PICKS.map((p) => chip(kind === p.kind, p.label, () => setKind(p.kind)))}
      </div>
      {side.length > 1 && (
        <div className="so-why-sub">
          <span className="so-why-k">Which player?</span>
          <div className="so-why-chips">{side.map((id) => chip(playerId === id, last(id), () => setPid(id), id))}</div>
        </div>
      )}
      <input className="so-why-note" type="text" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
        placeholder={kind === "other" ? "What did he say?" : "Add a note (optional)"} aria-label="Note" />
      <div className="so-why-foot">
        {o.why && <button type="button" className="so-act so-why-clear" onClick={() => onSave(null)}>Remove</button>}
        <button type="button" className="so-act" onClick={onCancel}>Cancel</button>
        <button type="button" className="so-act so-why-save" disabled={!ready} onClick={save}>Save</button>
      </div>
    </div>
  );
}

function Row({ d, now, onReopen, onDecline, onClear, onWhy }: { d: SentDeal; now: number; onReopen: (o: SentOffer) => void; onDecline: (o: SentOffer) => void; onClear: (o: SentOffer) => void; onWhy?: (o: SentOffer, w: DeclineWhy | null) => void }) {
  const [open, setOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
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
        {st === "pending" && <button type="button" className="so-act" onClick={() => { onDecline(head); if (onWhy) setWhyOpen(true); }}>Mark declined</button>}
        {st === "declined" && onWhy && !head.why && !whyOpen && <button type="button" className="so-act" onClick={() => setWhyOpen(true)}>Why?</button>}
        <button type="button" className="so-act" onClick={() => onClear(head)}>Clear</button>
        {earlier.length > 0 && (
          <button type="button" className="so-act so-more" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
            <span><span className="num">{earlier.length}</span> earlier {earlier.length > 1 ? "versions" : "version"}</span><Icon name="chev" size={14} />
          </button>
        )}
      </div>
      {st === "declined" && onWhy && (whyOpen
        ? <WhyPanel o={head} onCancel={() => setWhyOpen(false)} onSave={(w) => { onWhy(head, w); setWhyOpen(false); }} />
        : head.why && (
          <button type="button" className="so-why-line" onClick={() => setWhyOpen(true)} aria-label={`Why: ${whyLabel(head.why)}. Edit`}>
            <span className="so-why-text"><span className="so-why-k">Why:</span> {whyLabel(head.why)}{head.why.note && head.why.kind !== "other" ? <span className="so-why-said"> “{head.why.note}”</span> : null}</span>
            {whyEffect(head.why, head.partnerId) && <small className="so-why-fx">{whyEffect(head.why, head.partnerId)}</small>}
            <Icon name="pen" size={14} />
          </button>
        ))}
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
export function SentOffers({ offers, synced = false, syncUser = "", onReopen, onDecline, onClear, onWhy }: {
  offers: SentOffer[]; synced?: boolean; syncUser?: string; onReopen: (o: SentOffer) => void; onDecline: (o: SentOffer) => void; onClear: (o: SentOffer) => void;
  /** Save or remove why a declined offer didn't go */
  onWhy?: (o: SentOffer, w: DeclineWhy | null) => void;
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
        : <ul className="so-list">{deals.map((d) => <Row key={d.head.deal} d={d} now={now} onReopen={onReopen} onDecline={onDecline} onClear={onClear} onWhy={onWhy} />)}</ul>}
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
