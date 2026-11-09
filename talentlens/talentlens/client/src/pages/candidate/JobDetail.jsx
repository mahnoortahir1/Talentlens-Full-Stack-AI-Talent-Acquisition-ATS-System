import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Alert, Field, Loading, useLoad, useToast } from '../../components/ui.jsx';

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading } = useLoad(() => api.get(`/jobs/${id}`), [id]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [applyError, setApplyError] = useState('');

  if (loading) return <Loading />;
  if (error) return <Alert>{error.message}</Alert>;
  const j = data.job;
  const salary = j.salaryMin || j.salaryMax ? `${j.currency} ${[j.salaryMin, j.salaryMax].filter(Boolean).map((n) => n.toLocaleString()).join(' – ')}` : null;

  const apply = async () => {
    setBusy(true); setApplyError('');
    try {
      await api.post(`/jobs/${id}/apply`, { coverNote: note || undefined });
      toast('Application submitted');
      navigate('/candidate/applications');
    } catch (e) { setApplyError(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <p className="small"><Link to="/candidate/jobs">All jobs</Link></p>
      <div className="page-head"><div><h1>{j.title}</h1><p className="muted">{[j.department, j.location, j.type, salary].filter(Boolean).join(' · ')}</p></div></div>
      <div className="split">
        <section className="panel">
          <h2>About the role</h2>
          <div style={{ whiteSpace: 'pre-wrap', maxWidth: '72ch' }}>{j.description}</div>
          <hr className="divider" />
          <h3>Skills they're looking for</h3>
          <div className="chips">{j.requiredSkills.map((s) => <span key={s.name} className="chip neutral">{s.name}</span>)}{j.preferredSkills.map((s) => <span key={s.name} className="chip related">{s.name} (nice to have)</span>)}</div>
          {j.minExperienceYears > 0 && <p style={{ marginTop: '0.75rem' }}>{j.minExperienceYears}+ years of experience.</p>}
          {j.qualifications?.length > 0 && <p>{j.qualifications.join('; ')}</p>}
        </section>
        <aside className="panel">
          {j.applied ? (
            <><h2>You've applied</h2><p>Follow progress on your applications page.</p><Link className="btn secondary" to="/candidate/applications">View my applications</Link></>
          ) : j.status !== 'open' ? <p>This job is no longer accepting applications.</p> : (
            <>
              <h2>Apply</h2>
              <p className="small muted">Your current resume is sent with the application. A person reviews every application; AI scores only help them prioritise.</p>
              {applyError && <Alert>{applyError}{/resume/i.test(applyError) && <> <Link to="/candidate/profile">Upload a resume</Link></>}</Alert>}
              <Field label="Note to the recruiter (optional)" id="cn"><textarea id="cn" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></Field>
              <button className="btn block" disabled={busy} onClick={apply}>{busy ? 'Submitting…' : 'Submit application'}</button>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
