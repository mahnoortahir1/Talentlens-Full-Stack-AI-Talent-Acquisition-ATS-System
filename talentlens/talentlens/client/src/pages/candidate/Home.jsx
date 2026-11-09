import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Alert, Empty, Loading, StatusPill, fmtDateTime, useLoad } from '../../components/ui.jsx';
import { SkillChip } from '../../components/Evidence.jsx';
import { useAuth } from '../../auth.jsx';

export default function CandidateHome() {
  const { user } = useAuth();
  const profile = useLoad(() => api.get('/profile/me'));
  const apps = useLoad(() => api.get('/applications/mine'));
  const recs = useLoad(() => api.get('/profile/me/recommendations'));

  if (profile.loading) return <Loading />;
  const p = profile.data?.profile;
  const hasResume = p?.resume?.status === 'parsed';
  const upcoming = (apps.data?.applications || []).flatMap((a) => a.interviews.map((i) => ({ ...i, job: a.job.title }))).sort((a, b) => new Date(a.start) - new Date(b.start));

  return (
    <>
      <div className="page-head"><div><h1>Hello, {user.name.split(' ')[0]}</h1><p className="muted">Your applications and jobs that fit your experience.</p></div></div>
      <Alert>{profile.error?.message}</Alert>

      {!hasResume && (
        <div className="panel blush" style={{ marginBottom: '1rem' }}>
          <h2>Start with your resume</h2>
          <p>Upload a PDF resume. We extract your skills, experience and projects, and you can correct anything we get wrong.</p>
          <Link className="btn" to="/candidate/profile">Upload resume</Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="panel" style={{ marginBottom: '1rem' }}>
          <h2>Upcoming interviews</h2>
          <ul className="list">{upcoming.map((i, k) => <li key={k}><b>{fmtDateTime(i.start)}</b> · {i.job} · {i.type}, {i.durationMinutes} min{i.locationOrLink ? ` · ${i.locationOrLink}` : ''}</li>)}</ul>
        </section>
      )}

      <div className="grid two">
        <section className="panel">
          <div className="panel-head"><h2>Your applications</h2><Link to="/candidate/applications" className="small">See all</Link></div>
          {apps.loading && <Loading />}
          {apps.data && !apps.data.applications.length && <p className="muted">You haven't applied anywhere yet.</p>}
          <ul className="list">
            {apps.data?.applications.slice(0, 5).map((a) => <li key={a.id} className="row between"><span>{a.job.title}</span><StatusPill status={a.status} /></li>)}
          </ul>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Recommended for you</h2><Link to="/candidate/jobs" className="small">Browse all jobs</Link></div>
          {recs.loading && <Loading label="Matching jobs" />}
          {recs.data?.reason && <p className="muted">{recs.data.reason}</p>}
          {recs.data && !recs.data.reason && !recs.data.recommendations.length && <Empty title="No open jobs right now">Check back soon.</Empty>}
          <ul className="list">
            {recs.data?.recommendations.slice(0, 5).map((r) => (
              <li key={r.job.id}>
                <div className="row between"><Link to={`/candidate/jobs/${r.job.id}`}><b>{r.job.title}</b></Link><span className="small"><b>{r.score}%</b> fit</span></div>
                <div className="chips" style={{ marginTop: 6 }}>
                  {r.matchedSkills.slice(0, 5).map((s) => <SkillChip key={s} skill={s} />)}
                  {r.missingSkills.slice(0, 3).map((s) => <SkillChip key={s} skill={s} kind="gap" title="Not found in your resume" />)}
                </div>
                {r.learningAreas[0] && <p className="small muted" style={{ margin: '0.4rem 0 0' }}>To strengthen: {r.learningAreas[0]}</p>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
