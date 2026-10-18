/** Thick progress ring with the value in the middle. Lime when it's good for you, chalk when even, coral when it isn't. */
export function Ring({ pct, size = 76, label, sub, tone }: { pct: number; size?: number; label: string; sub?: string; tone?: "good" | "even" | "bad" }) {
  const t = tone ?? (pct >= 55 ? "good" : pct <= 45 ? "bad" : "even");
  const stroke = Math.max(6, Math.round(size / 9));
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <span className={`ring ${t}`} style={{ width: size, height: size }} role="img" aria-label={`${label}${sub ? ` ${sub}` : ""}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="ring-track" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="ring-fill" strokeLinecap="round"
          strokeDasharray={`${(p / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="ring-c"><b>{label}</b>{sub && <small>{sub}</small>}</span>
    </span>
  );
}
