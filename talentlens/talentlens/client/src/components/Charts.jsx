/** Dependency-free charts drawn with CSS/SVG in the palette. */
import { STATUS_LABEL } from './ui.jsx';

export function BarList({ rows, max, segments }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="muted small">No data yet.</p>;
  return (
    <div className="chart-bars">
      {rows.map((r) => (
        <div className="chart-bar" key={r.label}>
          <span className="label" title={r.label}>{r.label}</span>
          <span className="track" role="img" aria-label={`${r.label}: ${r.value}`}>
            {segments
              ? segments.map((s) => <span key={s.key} style={{ width: `${((r[s.key] || 0) / top) * 100}%`, background: s.color }} />)
              : <span style={{ width: `${(r.value / top) * 100}%`, background: r.color || 'var(--sage)' }} />}
          </span>
          <span className="value">{r.display ?? r.value}</span>
        </div>
      ))}
    </div>
  );
}

const ORDER = ['submitted', 'parsed', 'ai_assessed', 'recruiter_review', 'shortlisted', 'interview', 'selected', 'rejected'];
export function StageChart({ byStage }) {
  const max = Math.max(1, ...Object.values(byStage || {}));
  return (
    <div className="funnel">
      {ORDER.map((s) => (
        <div className="funnel-row" key={s}>
          <span>{STATUS_LABEL[s]}</span>
          <span className="track"><span style={{ width: `${((byStage?.[s] || 0) / max) * 100}%`, background: s === 'rejected' ? 'var(--blush)' : s === 'selected' ? 'var(--moss)' : 'var(--sage)' }} /></span>
          <b style={{ textAlign: 'right' }}>{byStage?.[s] || 0}</b>
        </div>
      ))}
    </div>
  );
}

export function TrendChart({ points }) {
  const w = 560, h = 120, pad = 8;
  const max = Math.max(1, ...points.map((p) => p.count));
  const x = (i) => pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1);
  const y = (v) => h - pad - (v / max) * (h - pad * 2 - 14);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.count)}`).join(' ');
  const total = points.reduce((a, p) => a + p.count, 0);
  return (
    <div className="trend">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${total} applications in the last 14 days`}>
        <path d={`${line} L${x(points.length - 1)},${h - pad} L${x(0)},${h - pad} Z`} fill="#F6E2E9" />
        <path d={line} fill="none" stroke="#4F6B4D" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => p.count > 0 && <circle key={p.date} cx={x(i)} cy={y(p.count)} r="3.5" fill="#4F6B4D"><title>{`${p.date}: ${p.count}`}</title></circle>)}
      </svg>
      <div className="row between small muted"><span>{points[0]?.date}</span><span>{points.at(-1)?.date}</span></div>
    </div>
  );
}
