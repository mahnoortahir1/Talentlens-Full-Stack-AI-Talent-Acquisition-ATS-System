import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Alert, Empty, Loading, StatusPill, STATUS_LABEL, fmtDate, useLoad, useToast } from '../../components/ui.jsx';
import { ChipLegend, ScoreBar, SkillChip, gapKind } from '../../components/Evidence.jsx';

function Applicants({ jobId }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ minScore: 0, status: '', skill: '', sort: 'score' });
  const [selected, setSelected] = useState([]);
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== '' && v !== 0)).toString();
  const { data, error, loading } = useLoad(() => api.get(`/jobs/${jobId}/applicants?${qs}`), [jobId, qs]);
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s));
  const set = (k) => (e) => setFilters({ ...filters, [k]: k === 'minScore' ? Number(e.target.value) : e.target.value });

  return (
    <>
      <div className="panel flat" style={{ marginBottom: '1rem' }}>
        <div className="form-grid" style={{ alignItems: 'end' }}>
          <div className="field"><label htmlFor="f-min">Minimum score: {filters.minScore}</label><input id="f-min" type="range" min="0" max="100" step="5" value={filters.minScore} onChange={set('minScore')} /></div>
          <div className="field"><label htmlFor="f-st">Stage</label>
            <select id="f-st" value={filters.status} onChange={set('status')}><option value="">All stages</option>{Object.entries(STATUS_LABEL).filter(([k]) => k !== 'under_review').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="f-sk">Has skill</label><input id="f-sk" placeholder="e.g. Docker" value={filters.skill} onChange={set('skill')} /></div>
          <div className="field"><label htmlFor="f-so">Sort by</label>
            <select id="f-so" value={filters.sort} onChange={set('sort')}><option value="score">Score</option><option value="experience">Experience</option><option value="date">Newest</option></select>
          </div>
        </div>
        <div className="row between">
          <ChipLegend />
          <button className="btn secondary small" disabled={selected.length < 2} onClick={() => navigate(`/recruiter/compare?ids=${selected.join(',')}`)}>Compare selected ({selected.length})</button>
        </div>
      </div>

      {loading && <Loading label="Ranking applicants" />}
      <Alert>{error?.message}</Alert>
      {data && !data.applicants.length && <Empty title="No applicants match">Try lowering the minimum score or clearing filters.</Empty>}
      {data?.applicants.length > 0 && (
        <>
          <p className="small muted">Ranked for review only. Moving anyone forward or back is always your decision.</p>
          <div className="table-wrap collapse">
            <table>
              <thead><tr><th><span className="sr-only">Select</span></th><th>#</th><th>Candidate</th><th style={{ minWidth: 220 }}>Job relevance</th><th>Evidence</th><th>Stage</th><th>Applied</th></tr></thead>
              <tbody>
                {data.applicants.map((a) => (
                  <tr key={a.id}>
                    <td><input type="checkbox" aria-label={`Select ${a.candidate.name} to compare`} checked={selected.includes(a.id)} onChange={() => toggle(a.id)} /></td>
                    <td className="rank">{a.rank}</td>
                    <td><Link to={`/recruiter/applications/${a.id}`}><b>{a.candidate.name}</b></Link><div className="small muted">{a.years} yrs experience{a.flags ? ` · ${a.flags} to verify` : ''}</div></td>
                    <td><ScoreBar compact score={a.score} breakdown={a.breakdown} overridden={a.overridden} aiScore={a.aiScore} /></td>
                    <td>
                      <div className="chips">
                        {a.matchedSkills.filter((m) => m.required).map((m) => <SkillChip key={m.skill} skill={m.skill} kind={m.matchedBy} />)}
                        {a.gaps.map((g) => <SkillChip key={g.skill} skill={g.skill} kind={gapKind(g.type)} />)}
                      </div>
                    </td>
                    <td><StatusPill status={a.status} /></td>
                    <td className="small">{fmtDate(a.appliedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cards-mobile">
            {data.applicants.map((a) => (
              <div className="panel" key={a.id}>
                <div className="row between">
                  <label className="row"><input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} /><span className="rank">#{a.rank}</span></label>
                  <StatusPill status={a.status} />
                </div>
                <h3 style={{ margin: '0.5rem 0' }}><Link to={`/recruiter/applications/${a.id}`}>{a.candidate.name}</Link></h3>
                <ScoreBar compact score={a.score} breakdown={a.breakdown} overridden={a.overridden} aiScore={a.aiScore} />
                <div className="chips" style={{ marginTop: '0.6rem' }}>
                  {a.matchedSkills.filter((m) => m.required).map((m) => <SkillChip key={m.skill} skill={m.skill} kind={m.matchedBy} />)}
                  {a.gaps.map((g) => <SkillChip key={g.skill} skill={g.skill} kind={gapKind(g.type)} />)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function TalentPool({ jobId }) {
  const toast = useToast();
  const { data, error, loading } = useLoad(() => api.get(`/jobs/${jobId}/talent-pool`), [jobId]);
  const invite = async (c) => {
    try { await api.post(`/jobs/${jobId}/invite`, { candidateId: c.id }); toast(`Invitation sent to ${c.name}`); } catch (e) { toast(e.message, 'error'); }
  };
  if (loading) return <Loading label="Searching past applicants" />;
  if (error) return <Alert>{error.message}</Alert>;
  return (
    <>
      <p className="small muted">Previously reviewed applicants from your company's other jobs, scored against this role. Only candidates who allow talent-pool matching and updated their profile within the last {data.policy.retentionDays} days are shown.</p>
      {!data.pool.length && <Empty title="No past applicants to suggest">As your company reviews more applicants, strong matches for new jobs appear here.</Empty>}
      <div className="grid two">
        {data.pool.map((p) => (
          <div className="panel" key={p.profileId}>
            <div className="row between"><h3 style={{ margin: 0 }}>{p.candidate.name}</h3><button className="btn secondary small" onClick={() => invite(p.candidate)}>Invite to apply</button></div>
            <div style={{ margin: '0.6rem 0' }}><ScoreBar compact score={p.score} /></div>
            <div className="chips">{p.matchedSkills.map((s) => <SkillChip key={s} skill={s} />)}{p.gaps.map((s) => <SkillChip key={s} skill={s} kind="gap" />)}</div>
            {p.topEvidence.map((t, i) => <p key={i} className="evidence small">{t}</p>)}
            <p className="small muted" style={{ marginTop: 6 }}>Previously: {p.prior.map((x) => `${x.job} (${STATUS_LABEL[x.status]})`).join(', ')}</p>
          </div>
        ))}
      </div>
    </>
  );
}

export default function JobApplicants() {
  const { id } = useParams();
  const [tab, setTab] = useState('applicants');
  const { data, error } = useLoad(() => api.get(`/jobs/${id}`), [id]);
  const job = data?.job;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{job?.title || 'Job'}</h1>
          {job && <p className="muted">{[job.department, job.location, job.type].filter(Boolean).join(', ')} · {job.status === 'open' ? 'Open' : 'Closed'}</p>}
        </div>
        <Link className="btn secondary" to={`/recruiter/jobs/${id}/edit`}>Edit job</Link>
      </div>
      <Alert>{error?.message}</Alert>
      {job && (
        <div className="chips" style={{ marginBottom: '1rem' }}>
          {job.requiredSkills.map((s) => <span key={s.name} className="chip neutral">{s.name} · {s.importance}</span>)}
          {job.preferredSkills.map((s) => <span key={s.name} className="chip related">{s.name} (preferred)</span>)}
          {job.minExperienceYears > 0 && <span className="chip neutral">{job.minExperienceYears}+ years</span>}
        </div>
      )}
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'applicants'} onClick={() => setTab('applicants')}>Applicants</button>
        <button role="tab" aria-selected={tab === 'pool'} onClick={() => setTab('pool')}>Talent pool</button>
      </div>
      {tab === 'applicants' ? <Applicants jobId={id} /> : <TalentPool jobId={id} />}
    </>
  );
}
