import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Alert, Empty, Loading, STATUS_LABEL, fmtDateTime, useLoad } from '../../components/ui.jsx';
import { BarList, StageChart, TrendChart } from '../../components/Charts.jsx';

export default function RecruiterDashboard() {
  const { data, error, loading } = useLoad(() => api.get('/analytics/overview'));
  if (loading) return <Loading label="Loading dashboard" />;
  if (error) return <Alert>{error.message}</Alert>;
  const { cards, byStage, byJob, shortlistRate, avgProcessingHours, skillGaps, trend, activity } = data;

  if (!cards.totalJobs) {
    return (
      <>
        <div className="page-head"><h1>Dashboard</h1></div>
        <Empty title="Post your first job" action={<Link className="btn" to="/recruiter/jobs/new">Create a job</Link>}>
          Once candidates apply, their scores, pipeline stages and common skill gaps show up here.
        </Empty>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Dashboard</h1><p className="muted">Recruitment activity across your jobs.</p></div>
        <Link className="btn" to="/recruiter/jobs/new">Create a job</Link>
      </div>

      <section className="stats" aria-label="Key numbers">
        <div className="stat"><b>{cards.activeJobs}</b><span>Active jobs</span></div>
        <div className="stat"><b>{cards.applications}</b><span>Applications</span></div>
        <div className={`stat ${cards.pendingReviews ? 'attention' : ''}`}><b>{cards.pendingReviews}</b><span>Waiting for review</span></div>
        <div className="stat"><b>{cards.shortlisted}</b><span>Shortlisted or later</span></div>
        <div className="stat"><b>{cards.upcomingInterviews}</b><span>Upcoming interviews</span></div>
        <div className="stat"><b>{shortlistRate}%</b><span>Application-to-shortlist rate</span></div>
        <div className="stat"><b>{avgProcessingHours == null ? '—' : avgProcessingHours < 48 ? `${avgProcessingHours}h` : `${Math.round(avgProcessingHours / 24)}d`}</b><span>Avg. time to first decision</span></div>
      </section>

      <div className="grid two" style={{ marginTop: '1rem' }}>
        <section className="panel">
          <div className="panel-head"><h2>Pipeline by stage</h2></div>
          <StageChart byStage={byStage} />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Applications by job</h2></div>
          <BarList
            rows={byJob.map((j) => ({ label: j.title, value: j.total, shortlisted: j.shortlisted, pending: j.pending, rest: j.total - j.shortlisted - j.pending }))}
            segments={[{ key: 'shortlisted', color: 'var(--moss)' }, { key: 'pending', color: 'var(--sage-light)' }, { key: 'rest', color: 'var(--blush)' }]}
          />
          <div className="legend" style={{ marginTop: '0.75rem' }}>
            <span><i style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--moss)', borderRadius: 2 }} /> shortlisted</span>
            <span><i style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--sage-light)', borderRadius: 2 }} /> pending</span>
            <span><i style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--blush)', borderRadius: 2 }} /> not progressed</span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Most common skill gaps</h2><span className="small muted">Required skills without resume evidence</span></div>
          <BarList rows={skillGaps.map((g) => ({ label: g.skill, value: g.count, display: `${g.share}%`, color: 'var(--rose)' }))} />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>New applications</h2><span className="small muted">Last 14 days</span></div>
          <TrendChart points={trend} />
        </section>
      </div>

      <section className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel-head"><h2>Recent activity</h2></div>
        {activity.length ? (
          <ul className="list">
            {activity.map((a, i) => (
              <li key={i} className="row between">
                <span><Link to={`/recruiter/applications/${a.application}`}>{a.job}</Link>: {a.from === a.to ? a.note : <>moved to <b>{STATUS_LABEL[a.to] || a.to}</b>{a.note ? ` — ${a.note}` : ''}</>} <span className="muted">by {a.byName}</span></span>
                <span className="small muted">{fmtDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">No activity yet.</p>}
      </section>
    </>
  );
}
