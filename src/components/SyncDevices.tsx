// "Sync your devices": the Settings row, the pairing sheet, and the small prompt Sent offers shows on a device that
// isn't paired. The key itself and the calls live in syncKey.ts; this file is only what you see.
//   - A device with the key can show a one-time code (XXXX-XXXX, 10 minutes, works once) and reset sync.
//   - A device without it can enter a code, or start fresh, which makes this device's lists the synced copy. Start
//     fresh and Reset sync each take a second tap on the same button, no modal.
// The code sheet is a DetailSheet: a bottom sheet on phones, a modal from 768px.
import { useEffect, useRef, useState } from "react";
import { useErrorHaptic } from "../haptics";
import { DetailSheet } from "./DetailSheet";
import { Icon } from "./ui";
import { mintCode, redeemCode, rotateKey, startFresh, useSyncStatus } from "../syncKey";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** What's typed, cleaned to the code alphabet and shown as XXXX-XXXX */
const tidy = (v: string) => {
  const c = [...v.toUpperCase()].filter((ch) => ALPHABET.includes(ch)).join("").slice(0, 8);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
};
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const tryAgainIn = (sec = 900) => { const m = Math.max(1, Math.ceil(sec / 60)); return `Too many tries. Try again in ${m} minute${m === 1 ? "" : "s"}.`; };

/** One button that asks for a second tap before it acts, then settles back after a few seconds */
function TwoTap({ label, again, onConfirm, busy, className = "btn btn-sm" }: { label: string; again: string; onConfirm: () => void; busy?: boolean; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = window.setTimeout(() => setArmed(false), 4000); return () => window.clearTimeout(t); }, [armed]);
  return (
    <button className={`${className}${armed ? " btn-danger" : ""}`} disabled={busy} aria-live="polite"
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? again : label}
    </button>
  );
}

export function PairSheet({ user, mode, onClose }: { user: string; mode: "show" | "enter"; onClose: () => void }) {
  return (
    <DetailSheet className="sync-sheet" onClose={onClose} title={<h2 className="ds-h">{mode === "show" ? "Pairing code" : "Enter pairing code"}</h2>}>
      {(close) => mode === "show" ? <ShowCode user={user} /> : <EnterCode user={user} onDone={() => close()} />}
    </DetailSheet>
  );
}

function ShowCode({ user }: { user: string }) {
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [error, setError] = useState("");
  useErrorHaptic(error);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  // Each new code replaces the last one on the server, so only one request at a time, and only the latest one shows
  const asked = useRef(0);
  const get = async () => {
    if (busy) return;
    const n = ++asked.current;
    setBusy(true); setError("");
    const r = await mintCode(user);
    if (n !== asked.current) return;
    setBusy(false);
    if (r.ok && r.code && r.expiresAt) { setCode({ code: r.code, expiresAt: r.expiresAt }); setNow(Date.now()); }
    else setError(!r.ok && r.status === 401 ? "This device isn't paired, so it can't make a code. Enter one from a paired device instead." : "Couldn't get a code. Check your connection and try again.");
  };
  // Once per sheet, even when React runs effects twice in development
  useEffect(() => { if (asked.current === 0) void get(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!code) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [code]);
  const left = code ? code.expiresAt - now : 0;
  const expired = !!code && left <= 0;
  return (
    <div className="sync-body">
      <p className="sync-lede">On your other device, open Settings, tap <b>Enter pairing code</b> and type this in.</p>
      <div className={`sync-code${expired ? " is-expired" : ""}`} aria-live="polite">
        <span className="sync-code-v" aria-label={code ? code.code.split("").join(" ") : "Loading code"}>{code?.code ?? "····-····"}</span>
        <span className="sync-code-t">{!code ? (busy ? "Getting a code" : "") : expired ? "Expired" : <>Expires in <span className="sync-num">{mmss(left)}</span></>}</span>
      </div>
      {error && <p className="sync-err" role="alert">{error}</p>}
      <p className="sync-fine">It works once. Anyone with this code can see your synced offers and watchlist, so only type it on your own device.</p>
      {(expired || error) && <button className="btn btn-sm" onClick={() => void get()} disabled={busy}>New code</button>}
    </div>
  );
}

function EnterCode({ user, onDone }: { user: string; onDone: () => void }) {
  const [v, setV] = useState("");
  const [error, setError] = useState("");
  useErrorHaptic(error);
  const [busy, setBusy] = useState(false);
  const [paired, setPaired] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { window.setTimeout(() => field.current?.focus({ preventScroll: true }), 240); }, []);
  const ready = v.replace("-", "").length === 8;
  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true); setError("");
    const r = await redeemCode(user, v);
    setBusy(false);
    if (r.ok) { setPaired(true); window.setTimeout(onDone, 1200); return; }
    setError(r.status === 429 ? tryAgainIn(r.retryAfter) : r.status === 401 ? "That code didn't work. It may have expired or been used. Get a new one and try again." : "Couldn't reach Source. Check your connection and try again.");
  };
  return (
    <form className="sync-body" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <p className="sync-lede">On a device that already syncs, open Settings and tap <b>Show pairing code</b>.</p>
      <label className="sync-label" htmlFor="sync-code-in">Pairing code</label>
      <input id="sync-code-in" ref={field} className="sync-in" value={v} onChange={(e) => { setV(tidy(e.target.value)); setError(""); }}
        placeholder="XXXX-XXXX" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} inputMode="text" enterKeyHint="done"
        aria-invalid={!!error} aria-describedby="sync-code-help" maxLength={9} disabled={paired} />
      <p id="sync-code-help" className={error ? "sync-err" : "sync-fine"} role={error ? "alert" : undefined}>
        {error || (paired ? "" : "Letters and numbers, no O, I, L, 0 or 1.")}
      </p>
      {paired
        ? <p className="sync-ok" role="status"><Icon name="check" size={16} />Paired. This device syncs now.</p>
        : <button type="submit" className="btn btn-primary" disabled={!ready || busy}>{busy ? "Pairing" : "Pair this device"}</button>}
    </form>
  );
}

/** Settings row. In the demo it just says nothing syncs. */
export function SyncDevicesRow({ user, demo }: { user: string; demo: boolean }) {
  const { needsPair, hasKey } = useSyncStatus(user);
  const [sheet, setSheet] = useState<"show" | "enter" | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (demo || !user) {
    return (
      <div className="set-row sync-row">
        <span className="grow"><b>Sync your devices</b><span className="small muted" style={{ display: "block" }}>The demo league stays on this device. Connect Sleeper to sync sent offers and starred players.</span></span>
      </div>
    );
  }
  const paired = hasKey && !needsPair;
  const run = async (f: () => Promise<{ ok: boolean; status?: number; retryAfter?: number }>, done: string) => {
    setBusy(true); setMsg("");
    const r = await f();
    setBusy(false);
    setMsg(r.ok ? done : r.status === 429 ? tryAgainIn(r.retryAfter) : r.status === 401 ? "This device isn't paired anymore. Enter a code to pair it again." : "Couldn't reach Source. Try again in a moment.");
  };
  return (
    <>
      <div className={`set-row sync-row${needsPair ? " needs-pair" : ""}`}>
        <span className="grow">
          <b>{needsPair ? "Pair this device to sync" : "Sync your devices"}</b>
          <span className="small muted" style={{ display: "block" }}>
            {needsPair
              ? "Another device already syncs for your Sleeper account. Enter a code from it to share sent offers and starred players. Everything here keeps working on this device in the meantime."
              : paired
                ? "Sent offers and starred players follow you to every device you pair. Show a code here, then type it on the other one."
                : "Sent offers and starred players sync to the devices you pair. Have a code from another device? Enter it here."}
          </span>
        </span>
        <span className="row wrap sync-acts">
          {paired && <button className="btn btn-sm" onClick={() => setSheet("show")} aria-haspopup="dialog">Show pairing code</button>}
          {!paired && <button className={`btn btn-sm${needsPair ? " btn-primary" : ""}`} onClick={() => setSheet("enter")} aria-haspopup="dialog">Enter pairing code</button>}
          {paired && <TwoTap label="Reset sync" again="Tap again to reset" busy={busy} onConfirm={() => void run(() => rotateKey(user), "Sync reset. Your other devices need a new code.")} />}
          {needsPair && <TwoTap label="Start fresh" again="Tap again to replace" busy={busy} className="btn btn-sm btn-ghost" onConfirm={() => void run(() => startFresh(user), "Started fresh. This device's lists are the synced copy now.")} />}
        </span>
      </div>
      {needsPair && <p className="tiny muted sync-note">Start fresh replaces the synced copy with what's on this device, and your other devices need a new code.</p>}
      {msg && <p className="tiny sync-msg" role="status">{msg}</p>}
      {sheet && <PairSheet user={user} mode={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}

/** Sent offers: a gentle line on a device that isn't paired */
export function PairPrompt({ user }: { user: string }) {
  const { needsPair } = useSyncStatus(user);
  const [open, setOpen] = useState(false);
  if (!user || !needsPair) return null;
  return (
    <>
      <button className="so-pair" onClick={() => setOpen(true)} aria-haspopup="dialog">Pair this device to sync</button>
      {open && <PairSheet user={user} mode="enter" onClose={() => setOpen(false)} />}
    </>
  );
}
