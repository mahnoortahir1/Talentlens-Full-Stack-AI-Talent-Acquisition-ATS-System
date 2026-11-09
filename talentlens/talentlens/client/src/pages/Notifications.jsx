import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, Loading, Alert, fmtDateTime, useLoad } from '../components/ui.jsx';

export default function Notifications() {
  const { refreshUnread } = useOutletContext() || {};
  const { data, error, loading, reload } = useLoad(() => api.get('/notifications'));
  const markAll = async () => { await api.post('/notifications/read-all'); await reload(); refreshUnread?.(); };

  return (
    <>
      <div className="page-head">
        <div><h1>Inbox</h1><p className="muted">Status updates and interview invitations. Email delivery is simulated here.</p></div>
        {data?.unread > 0 && <button className="btn secondary" onClick={markAll}>Mark all as read</button>}
      </div>
      {loading && <Loading />}
      <Alert>{error?.message}</Alert>
      {data && !data.notifications.length && <Empty title="Nothing here yet">Updates about jobs and applications will appear here.</Empty>}
      {data?.notifications.length > 0 && (
        <div className="panel">
          <ul className="list">
            {data.notifications.map((n) => (
              <li key={n._id} style={{ fontWeight: n.read ? 400 : 700 }}>
                <div className="row between">
                  <span>{n.link ? <Link to={n.link}>{n.title}</Link> : n.title}</span>
                  <span className="small muted">{fmtDateTime(n.createdAt)}</span>
                </div>
                {n.body && <div className="small muted" style={{ fontWeight: 400 }}>{n.body}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
