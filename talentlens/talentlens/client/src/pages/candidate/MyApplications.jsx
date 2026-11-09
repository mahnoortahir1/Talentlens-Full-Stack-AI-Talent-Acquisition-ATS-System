import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Alert, Empty, Loading, StatusPill, STATUS_LABEL, fmtDate, fmtDateTime, useLoad } from '../../components/ui.jsx';

export default function MyApplications() {
  const { data, error, loading } = useLoad(() => api.get('/applications/mine'));
  return (
    <>
      <div className="page-head"><div><h1>My applications</h1><p className="muted">Where each application stands.</p></div></div>
      {loading && <Loading />}
      <Alert>{error?.message}</Alert>
      {data && !data.applications.length && <Empty title="No applications yet" action={<Link className="btn" to="/candidate/jobs">Find jobs</Link>}>When you apply, you can follow each step here.</Empty>}
      <div className="stack">
        {data?.applications.map((a) => (
          <article className="panel" key={a.id}>
            <div className="row between">
              <div><h3 style={{ margin: 0 }}><Link to={`/candidate/jobs/${a.job._id}`}>{a.job.title}</Link></h3><div className="small muted">{[a.job.department, a.job.location].filter(Boolean).join(', ')} · applied {fmtDate(a.createdAt)}</div></div>
              <StatusPill status={a.status} />
            </div>
            {a.interviews.map((i, k) => <p key={k} className="evidence" style={{ marginTop: '0.75rem' }}><b>Interview:</b> {fmtDateTime(i.start)}, {i.type}, {i.durationMinutes} min{i.locationOrLink ? ` · ${i.locationOrLink}` : ''}</p>)}
            <ol className="timeline" style={{ marginTop: '0.9rem' }}>
              {a.timeline.map((t, k) => <li key={k}><b>{STATUS_LABEL[t.status] || t.status}</b> <span className="small muted">{fmtDateTime(t.at)}</span></li>)}
            </ol>
          </article>
        ))}
      </div>
    </>
  );
}
