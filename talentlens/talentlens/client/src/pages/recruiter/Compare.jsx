import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Alert, Loading, StatusPill, useLoad } from '../../components/ui.jsx';
import { ScoreBar, SkillChip, gapKind } from '../../components/Evidence.jsx';

export default function Compare() {
  const [params] = useSearchParams();
  const ids = params.get('ids') || '';
  const { data, error, loading } = useLoad(() => api.get(`/applications/compare?ids=${ids}`), [ids]);
  if (loading) return <Loading label="Building comparison" />;
  if (error) return <Alert>{error.message}</Alert>;
  const skills = [...data.job.requiredSkills.map((s) => ({ ...s, required: true })), ...data.job.preferredSkills.map((s) => ({ ...s, required: false }))];

  const cell = (c, skill) => {
    const m = c.assessment?.matchedSkills?.find((x) => x.skill === skill);
    if (m) return <><SkillChip skill={`${Math.round(m.credit * 100)}%`} kind={m.matchedBy} title={m.evidence[0]} />{m.evidence[0] && <div className="small muted" style={{ marginTop: 4 }}>{m.evidence[0].slice(0, 110)}</div>}</>;
    const g = c.assessment?.gaps?.find((x) => x.skill === skill);
    return <SkillChip skill={g?.type === 'confirmed_absent' ? 'Absent' : g?.type === 'weak_evidence' ? 'Weak' : 'No evidence'} kind={gapKind(g?.type)} />;
  };

  return (
    <>
      <div className="page-head"><div><h1>Compare applicants</h1><p className="muted">{data.job.title}: job-related evidence side by side.</p></div></div>
      {!data.sameJob && <Alert kind="info">These applications are for different jobs; skills are compared against {data.job.title}.</Alert>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Evidence</th>{data.candidates.map((c) => <th key={c.id} style={{ minWidth: 220 }}><Link to={`/recruiter/applications/${c.id}`}>{c.name}</Link></th>)}</tr>
          </thead>
          <tbody>
            <tr><td><b>Score</b></td>{data.candidates.map((c) => <td key={c.id}><ScoreBar compact score={c.score} breakdown={c.assessment?.breakdown} overridden={c.score !== c.aiScore} aiScore={c.aiScore} /></td>)}</tr>
            <tr><td><b>Stage</b></td>{data.candidates.map((c) => <td key={c.id}><StatusPill status={c.status} /></td>)}</tr>
            {['skills', 'experience', 'projects', 'qualifications'].map((k) => (
              <tr key={k}><td className="small">{k[0].toUpperCase() + k.slice(1)} component</td>{data.candidates.map((c) => <td key={c.id}>{c.assessment?.breakdown?.[k]?.score ?? '—'}%</td>)}</tr>
            ))}
            {skills.map((s) => (
              <tr key={s.name}><td>{s.name} <span className="small muted">{s.required ? `required · ${s.importance}` : 'preferred'}</span></td>{data.candidates.map((c) => <td key={c.id}>{cell(c, s.name)}</td>)}</tr>
            ))}
            <tr><td><b>Experience</b></td>{data.candidates.map((c) => <td key={c.id}>{c.years} years</td>)}</tr>
            <tr><td><b>Education</b></td>{data.candidates.map((c) => <td key={c.id} className="small">{c.education.join('; ') || <span className="muted">Not found</span>}</td>)}</tr>
            <tr><td><b>Projects</b></td>{data.candidates.map((c) => <td key={c.id} className="small">{c.projects.join(', ') || <span className="muted">Not found</span>}</td>)}</tr>
            <tr><td><b>Missing information</b></td>{data.candidates.map((c) => <td key={c.id} className="small">{(c.assessment?.explanation || []).filter((e) => /missing evidence|No /.test(e)).join(' ') || '—'}</td>)}</tr>
            <tr><td><b>To verify</b></td>{data.candidates.map((c) => <td key={c.id} className="small">{(c.assessment?.flags || []).map((f) => f.skill).join(', ') || '—'}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
