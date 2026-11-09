/** The score "evidence bar" and skill chips: how each score is built and how each skill was evidenced. */
const COMPONENTS = [
  ['skills', 'Skills'],
  ['experience', 'Experience'],
  ['projects', 'Projects'],
  ['qualifications', 'Qualifications'],
];

export function ScoreBar({ score, breakdown, compact = false, overridden = false, aiScore }) {
  if (score == null) return <span className="muted small">Not scored yet</span>;
  return (
    <div className={`score ${compact ? 'compact' : ''}`}>
      <div className="score-num" aria-label={`Score ${score} out of 100`}>{score}<small>/100</small></div>
      <div className="score-body">
        <div className="evbar" role="img" aria-label={breakdown ? COMPONENTS.map(([k, l]) => `${l} ${breakdown[k]?.contribution ?? 0} points`).join(', ') : 'score'}>
          {breakdown && COMPONENTS.map(([k]) => <span key={k} className={`c-${k}`} style={{ width: `${breakdown[k]?.contribution ?? 0}%` }} />)}
        </div>
        {!compact && breakdown && (
          <div className="evkey">
            {COMPONENTS.map(([k, l]) => (
              <span key={k}><i className={`c-${k}`} />{l} {breakdown[k]?.score}% × {breakdown[k]?.weight}</span>
            ))}
          </div>
        )}
        {overridden && <div className="small muted" style={{ marginTop: 4 }}>Recruiter override (AI score {aiScore})</div>}
      </div>
    </div>
  );
}

const MATCH_TEXT = {
  exact: 'Found in resume',
  implied: 'Implied by a related skill',
  related: 'Partial credit from a related skill',
  semantic: 'Semantically similar passage',
  'semantic-weak': 'Weak semantic match',
  'self-reported': 'Self-reported, no resume excerpt',
};

export function SkillChip({ skill, kind = 'exact', title, onRemove }) {
  return (
    <span className={`chip ${kind}`} title={title || MATCH_TEXT[kind] || ''}>
      {skill}
      {onRemove && <button type="button" onClick={onRemove} aria-label={`Remove ${skill}`}>×</button>}
    </span>
  );
}

export function ChipLegend() {
  return (
    <div className="legend" aria-label="Chip legend">
      <span><span className="chip exact" /> in resume</span>
      <span><span className="chip implied" /> implied / semantic</span>
      <span><span className="chip related" /> related skill</span>
      <span><span className="chip gap" /> no evidence</span>
      <span><span className="chip absent" /> confirmed absent</span>
    </div>
  );
}

export const gapKind = (type) => (type === 'confirmed_absent' ? 'absent' : 'gap');
export { MATCH_TEXT };
