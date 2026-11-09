import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Alert, Empty, Loading, fmtDateTime, useLoad, useToast } from '../../components/ui.jsx';
import { FeedbackModal } from './ApplicationReview.jsx';

export default function Interviews() {
  const toast = useToast();
  const [filter, setFilter] = useState('scheduled');
  const { data, error, loading, reload } = useLoad(() => api.get(`/interviews${filter ? `?status=${filter}` : ''}`), [filter]);
  const [feedbackFor, setFeedbackFor] = useState(null);

  const cancel = async (i) => {
    if (!window.confirm(`Cancel the interview with ${i.candidate.name}?`)) return;
    try { await api.patch(`/interviews/${i._id}`, { status: 'cancelled' }); toast('Interview cancelled and candidate notified'); reload(); } catch (e) { toast(e.message, 'error'); }
  };

  // Group by day for a schedule view.
  const groups = {};
  (data?.interviews || []).forEach((i) => {
    const k = new Date(i.start).toDateString();
    (groups[k] = groups[k] || []).push(i);
  });

  return (
    <>
      <div className="page-head">
        <div><h1>Interviews</h1><p className="muted">Your interview schedule across all jobs.</p></div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="iv-f" className="sr-only">Show</label>
          <select id="iv-f" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="">All</option></select>
        </div>
      </div>
      {loading && <Loading />}
      <Alert>{error?.message}</Alert>
      {data && !data.interviews.length && <Empty title="No interviews here">Shortlist an applicant, then schedule from their application page.</Empty>}
      <div className="stack">
        {Object.entries(groups).map(([day, items]) => (
          <section key={day}>
            <h2 style={{ fontSize: 'var(--step-1)' }}>{new Date(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            <div className="panel">
              <ul className="list">
                {items.map((i) => (
                  <li key={i._id} className="row between">
                    <div>
                      <b>{new Date(i.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</b> · {i.durationMinutes} min · {i.type}
                      <div><Link to={`/recruiter/applications/${i.application}`}>{i.candidate.name}</Link> for {i.job.title}</div>
                      <div className="small muted">Interviewer: {i.interviewer.name}{i.locationOrLink ? ` · ${i.locationOrLink}` : ''}</div>
                    </div>
                    <div className="row">
                      {i.status === 'scheduled' && <><button className="btn secondary small" onClick={() => setFeedbackFor(i)}>Record feedback</button><button className="btn ghost small" onClick={() => cancel(i)}>Cancel</button></>}
                      {i.status === 'completed' && <span className="small">Recommendation: <b>{i.feedback?.recommendation?.replace('_', ' ')}</b></span>}
                      {i.status === 'cancelled' && <span className="small muted">Cancelled</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
      {data && <p className="small muted" style={{ marginTop: '1rem' }}>Times shown in your local time. Last updated {fmtDateTime(new Date())}.</p>}
      {feedbackFor && <FeedbackModal interview={feedbackFor} onClose={() => setFeedbackFor(null)} onSaved={() => { setFeedbackFor(null); reload(); }} />}
    </>
  );
}
