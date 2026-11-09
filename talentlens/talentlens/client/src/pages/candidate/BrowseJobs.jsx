import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Alert, Empty, Loading, fmtDate, useLoad } from '../../components/ui.jsx';

export default function BrowseJobs() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const { data, error, loading } = useLoad(() => api.get(`/jobs${term ? `?q=${encodeURIComponent(term)}` : ''}`), [term]);

  return (
    <>
      <div className="page-head"><div><h1>Find jobs</h1><p className="muted">Open roles you can apply to.</p></div></div>
      <form className="row" style={{ marginBottom: '1rem', flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }}>
        <label htmlFor="jq" className="sr-only">Search jobs</label>
        <input id="jq" placeholder="Search by title or description" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn">Search</button>
      </form>
      {loading && <Loading />}
      <Alert>{error?.message}</Alert>
      {data && !data.jobs.length && <Empty title={term ? `No jobs match “${term}”` : 'No open jobs right now'}>{term ? 'Try a broader search.' : 'Check back soon.'}</Empty>}
      <div className="grid two">
        {data?.jobs.map((j) => (
          <article className="panel" key={j.id}>
            <div className="row between"><h3 style={{ margin: 0 }}><Link to={`/candidate/jobs/${j.id}`}>{j.title}</Link></h3>{j.applied && <span className="pill st-shortlisted">Applied</span>}</div>
            <p className="small muted" style={{ margin: '0.25rem 0 0.6rem' }}>{[j.department, j.location, j.type].filter(Boolean).join(', ')} · posted {fmtDate(j.createdAt)}</p>
            <div className="chips">{j.requiredSkills.slice(0, 6).map((s) => <span key={s.name} className="chip neutral">{s.name}</span>)}</div>
          </article>
        ))}
      </div>
    </>
  );
}
