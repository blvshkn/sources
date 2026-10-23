// The landing's Set optimal lineup card: the Lineup tab's Source AI block (OptimalLineup.tsx) with the same parts, the
// button, the real thinking trace and the swaps with their reasons, played from a script with no network. It runs once
// when the card scrolls into view and again whenever the button is pressed. The answer is the engine's lineup (passed
// in, by "off"), so the moves and reasons are the app's own. Reduced motion shows the finished result at once.
// A hidden finished copy shares the cell, so the card is its final size from the start and never grows.
import { useEffect, useRef, useState } from "react";
import { useTrace, type TraceState, type Tracer } from "../think";
import { ThinkingTrace } from "./ThinkingTrace";
import { WorkingLoader, AiMark } from "./WorkingLoader";
import { SwapRows } from "./SwapRows";
import { AiLabel } from "./ui";
import { moveLock } from "../kickoff";
import { WEEK, YOU, playerById } from "../data";
import { mo } from "../motion";
import type { Chip } from "../steps";
import type { OptimalResult } from "../optimalLineup";
import { setInert } from "../inert";

const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const PLAN = "I'll start from your best projected lineup, then check news, injury reports, Vegas lines and weather, and ask Source AI whether any of it should change a call.";

/** The run's steps, in optimalJob's words, with counts from the sample league. */
function script(res: OptimalResult) {
  const roster = YOU.roster.map(playerById).filter(Boolean);
  const named = (ids: string[]): Chip[] => ids.slice(0, 3).map((id) => ({ label: playerById(id).name, kind: "player" }));
  const moved = res.swaps.flatMap((w) => [w.start, w.bench]);
  const hurt = roster.filter((p) => p.injury || p.status).map((p) => p.id);
  const teams = new Set(roster.map((p) => p.nfl));
  const domes = Math.min(2, Math.max(0, teams.size - 4));
  const outdoor = Math.max(1, teams.size - domes);
  return {
    roster: roster.length, hurt, newsChips: named(moved), hurtChips: named(hurt.length ? hurt : moved),
    steps: [
      { doing: "Reading your roster", done: `Read your roster (${roster.length} players)`, chips: [{ label: YOU.name, kind: "team" } as Chip], ms: 260 },
      { doing: `Projecting ${roster.length} players for week ${WEEK}`, done: `Best projected lineup: ${res.total.toFixed(1)}`, ms: 300 },
      { doing: "Checking the news", done: `Checked 148 news items, ${Math.max(2, moved.length)} about your players`, n: 148, chips: named(moved), ms: 520 },
      { doing: "Reading injury reports", done: hurt.length ? `Read ${hurt.length} injury ${hurt.length === 1 ? "report" : "reports"}` : "No injury reports for your players", chips: named(hurt), ms: 380 },
      { doing: "Getting Vegas lines", done: `Got odds for ${teams.size} games`, ms: 340 },
      { doing: "Checking stadium weather", done: `Checked weather for ${outdoor} outdoor ${outdoor === 1 ? "game" : "games"}${domes ? `, skipped ${domes} in ${domes === 1 ? "a dome" : "domes"}` : ""}`, ms: 340 },
      { doing: "Asking Source AI", done: "Asked Source AI", ms: 900 },
      { doing: "Validating the lineup", done: `Checked ${res.slots.length} slots for byes, injuries and locks`, ms: 260 },
    ] as { doing: string; done: string; n?: number; chips?: Chip[]; ms: number }[],
  };
}

/** The same run, already finished: what reduced motion and the size-holding copy show. */
function doneTrace(res: OptimalResult): TraceState {
  const s = script(res);
  return { status: "done", think: PLAN, started: 0, ended: 6400,
    steps: s.steps.map((x) => ({ doing: x.doing, done: x.done, n: x.n, chips: x.chips ?? [], state: "done", at: 0 })) };
}

function Block({ res, trace, phase, onGo, onDismiss, onFind, ghost = false }: {
  res: OptimalResult; trace: TraceState; phase: "idle" | "run" | "done"; onGo?: () => void; onDismiss?: () => void; onFind?: () => void; ghost?: boolean;
}) {
  const running = phase === "run";
  const lockBy = moveLock(...res.swaps.flatMap((w) => [playerById(w.start), playerById(w.bench)]));
  const live = !ghost;
  return (
    <div className={`lu-ai${phase !== "idle" ? " is-open" : ""}`} aria-label={ghost ? undefined : "Set optimal lineup"}>
      <div className="lu-ai-bar">
        <p className="lu-ai-txt"><b>Source AI</b><span>Weighs news, injuries, Vegas lines and weather against your projections.</span></p>
        <button type="button" className="btn btn-sm lu-ai-go" onClick={onGo} tabIndex={live ? undefined : -1} aria-busy={running || undefined}>
          {running ? <WorkingLoader size={16} /> : <AiMark size={16} />}Set optimal lineup
        </button>
      </div>
      {phase !== "idle" && trace.status !== "idle" && <ThinkingTrace haptics={false} trace={trace} />}
      {phase === "done" && (
        <div className="lu-ai-res" aria-live={live ? "polite" : undefined}>
          <p className="lu-ai-head">{res.summary}</p>
          <SwapRows rows={res.swaps} live={false} />
          <div className="lu-ai-foot">
            <span className="lu-ai-hint">Make {res.swaps.length > 1 ? "these moves" : "this move"} in Sleeper{lockBy ? ` before ${lockBy}` : ""}.</span>
            <div className="lu-ai-btns">
              <button type="button" className="btn btn-sm lu-ai-x" onClick={onDismiss} tabIndex={live ? undefined : -1}>Dismiss</button>
              {/* On the landing the next step is your own league (Zach, Oct 23): the green main action opens Add your leagues */}
              <button type="button" className="btn btn-sm btn-primary lu-ai-open" onClick={onFind} tabIndex={live ? undefined : -1}>Add your leagues</button>
            </div>
          </div>
          <AiLabel />
        </div>
      )}
    </div>
  );
}

export function LandingOptimal({ res, onFind }: { res: OptimalResult; onFind?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { trace, result, start } = useTrace<OptimalResult>();
  const [phase, setPhase] = useState<"idle" | "run" | "done">("idle");
  const [still, setStill] = useState<TraceState | null>(null);
  // The result a run was started with, so its trace and its moves always agree
  const [shownRes, setShownRes] = useState<OptimalResult | null>(null);
  const resRef = useRef(res);
  resRef.current = res;

  const go = () => {
    if (phase === "run") return;
    const r = resRef.current;
    setShownRes(r);
    if (reduced()) { setStill(doneTrace(r)); setPhase("done"); return; }
    setStill(null); setPhase("run");
    start(async (tr: Tracer) => {
      const s = script(r);
      await tr.think(PLAN);
      await sleep(mo(240));
      for (const st of s.steps) {
        await tr.step(st.doing, st.done, { chips: st.n === undefined ? st.chips : undefined });
        if (st.n !== undefined) {
          // The count rolls up as the feed is read, with a chip for each of your players it mentions
          const chips = st.chips ?? [];
          for (let i = 1; i <= 4; i++) await tr.n(Math.round((st.n * i) / 4), chips[i - 1]);
        }
        // A fetch's time, shortened for the page: the whole run lands in about six seconds at --mo
        await sleep(mo(st.ms * 0.3));
      }
      await tr.finish();
      return r;
    }).catch(() => { setStill(doneTrace(r)); setPhase("done"); });
  };
  useEffect(() => { if (result && phase === "run") setPhase("done"); }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  // Plays once, the first time the card comes into view
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); goRef.current(); } }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const shown = still ?? trace;
  return (
    <div ref={ref} className="ld2-optl">
      <div className="ld2-optl-ghost" aria-hidden="true" ref={setInert}><Block res={shownRes ?? res} trace={doneTrace(shownRes ?? res)} phase="done" ghost /></div>
      <Block res={shownRes ?? res} trace={shown} phase={phase} onGo={go} onDismiss={() => { setStill(null); setPhase("idle"); }} onFind={onFind} />
    </div>
  );
}
