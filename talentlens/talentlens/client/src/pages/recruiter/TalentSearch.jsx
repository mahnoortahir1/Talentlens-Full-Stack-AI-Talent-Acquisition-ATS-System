import { useState } from 'react';
import { api } from '../../api.js';
import { Alert, Empty, Loading } from '../../components/ui.jsx';
import { SkillChip } from '../../components/Evidence.jsx';

const EXAMPLES = ['Python developers with REST API experience', 'Someone who has containerised web services', 'Frontend engineers who built dashboards in React'];

export default function TalentSearch() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ loading: false, error: null, data: null });

  const search = async (q = query) => {
    if (q.trim().length < 3) return;
    setQuery(q);
    setState({ loading: true, error: null, data: null });
    try { setState({ loading: false, error: null, data: await api.post('/search/talent', { query: q }) }); } catch (e) { setState({ loading: false, error: e, data: null }); }
  };

  const d = state.data;
  return (
    <>
      <div className="page-head"><div><h1>Talent search</h1><p className="muted">Describe who you need in plain words. Results match meaning, not just keywords, and show the resume lines that support them.</p></div></div>
      <form className="panel" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <label htmlFor="q" className="sr-only">Search query</label>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input id="q" placeholder="e.g. Python developers with REST API experience" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn" disabled={state.loading}>Search</button>
        </div>
        <div className="row small" style={{ marginTop: '0.75rem' }}>
          <span className="muted">Try:</span>
          {EXAMPLES.map((x) => <button type="button" key={x} className="btn ghost small" onClick={() => search(x)}>{x}</button>)}
        </div>
      </form>

      {state.loading && <Loading label="Searching resumes" />}
      <Alert>{state.error?.message}</Alert>
      {d && (
        <>
          <p className="small muted" style={{ margin: '1rem 0' }}>
            Understood as: {[
              d.interpreted.skills?.length ? `skills ${d.interpreted.skills.join(', ')}` : null,
              d.interpreted.roles?.length ? `role ${d.interpreted.roles.join(' / ')}` : null,
              d.interpreted.terms?.length ? `keywords ${d.interpreted.terms.join(', ')}` : null,
              d.interpreted.minYears ? `${d.interpreted.minYears}+ years` : null,
            ].filter(Boolean).join(' · ') || 'free-text meaning only'}. Searched {d.searched ?? '?'} CV(s). Embeddings: {d.model}.
          </p>
          {d.closestOnly && <Alert kind="info">No strong match for this search. Showing the closest candidates instead.</Alert>}
          {!d.results.length && <Empty title="No candidates to search">No CVs are visible to you yet. Candidates appear here once they apply to one of your company's jobs.</Empty>}
          <div className="stack">
            {d.results.map((r) => (
              <article className="panel" key={r.profileId}>
                <div className="row between">
                  <div><h3 style={{ margin: 0 }}>{r.candidate.name}</h3><div className="small muted">{r.headline}{r.headline ? ' · ' : ''}{r.years} years{r.breakdown && !r.breakdown.yearsOk ? ' (below requested)' : ''} · {r.applications} application(s)</div></div>
                  <div className="score compact" title={r.matchLevel ? `${r.matchLevel} match` : undefined}><div className="score-num">{r.relevance}<small>%</small></div>{r.matchLevel && <div className="small muted">{r.matchLevel} match</div>}</div>
                </div>
                {r.breakdown && (
                  <p className="small muted" style={{ margin: '0.4rem 0' }}>
                    Why: meaning {r.breakdown.semantic}% (best passage {r.breakdown.bestPassageSimilarity})
                    {r.breakdown.skills != null && ` · skills ${r.breakdown.skills}%`}
                    {r.breakdown.role != null && ` · role fit ${r.breakdown.role}%`}
                    {r.breakdown.keywords != null && ` · keywords ${r.breakdown.keywords}%${r.matchedTerms?.length ? ` (${r.matchedTerms.join(', ')})` : ''}`}
                  </p>
                )}
                <div className="chips" style={{ margin: '0.6rem 0' }}>
                  {r.matchedSkills.map((s) => {
                    const m = typeof s === 'string' ? { skill: s, match: 'exact' } : s;
                    const label = m.match === 'related' ? `${m.skill} (via ${m.via})` : m.skill;
                    const title = m.match === 'exact' ? 'Exact skill match' : m.match === 'related' ? `Related skill: ${m.via}` : `Matches the ${m.via} role`;
                    return <SkillChip key={`${m.skill}-${m.match}`} skill={label} kind={m.match === 'related' ? 'related' : 'exact'} title={title} />;
                  })}
                  {r.missingSkills.map((s) => <SkillChip key={s} skill={s} kind="gap" />)}
                </div>
                {r.evidence.map((e, i) => <p key={i} className="evidence small">{e.type === 'semantic' && <b>Similar passage ({e.similarity}): </b>}{e.text}</p>)}
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
