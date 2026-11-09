import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Alert, Empty, Loading, fmtDate, useLoad, useToast } from '../../components/ui.jsx';

export default function Jobs() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api.get('/jobs'));

  const toggle = async (job) => {
    const status = job.status === 'open' ? 'closed' : 'open';
    try { await api.patch(`/jobs/${job.id}/status`, { status }); toast(status === 'open' ? 'Job reopened' : 'Job closed'); reload(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Jobs</h1><p className="muted">Vacancies you manage, with applicant counts.</p></div>
        <Link className="btn" to="/recruiter/jobs/new">Create a job</Link>
      </div>
      {loading && <Loading />}
      <Alert>{error?.message}</Alert>
      {data && !data.jobs.length && <Empty title="No jobs yet" action={<Link className="btn" to="/recruiter/jobs/new">Create a job</Link>}>Paste a job description and TalentLens extracts the required skills for you.</Empty>}
      {data?.jobs.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Job</th><th>Status</th><th>Applicants</th><th>Shortlisted</th><th>Waiting</th><th>Posted</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.jobs.map((j) => (
                <tr key={j.id}>
                  <td><Link to={`/recruiter/jobs/${j.id}`}><b>{j.title}</b></Link><div className="small muted">{[j.department, j.location, j.type].filter(Boolean).join(', ')}</div></td>
                  <td><span className={`pill ${j.status}`}>{j.status === 'open' ? 'Open' : 'Closed'}</span></td>
                  <td>{j.applicants.total}</td>
                  <td>{j.applicants.shortlisted}</td>
                  <td>{j.applicants.pending ? <b>{j.applicants.pending}</b> : 0}</td>
                  <td className="small">{fmtDate(j.createdAt)}</td>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <Link className="btn ghost small" to={`/recruiter/jobs/${j.id}/edit`}>Edit</Link>
                      <button className="btn ghost small" onClick={() => toggle(j)}>{j.status === 'open' ? 'Close' : 'Reopen'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
