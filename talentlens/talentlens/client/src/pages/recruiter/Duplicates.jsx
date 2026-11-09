import { useState } from 'react';
import { api } from '../../api.js';
import { Alert, Empty, Loading, Modal, fmtDate, useLoad, useToast } from '../../components/ui.jsx';

function Record({ r }) {
  return (
    <div>
      <b>{r.name}</b>
      <div className="small">{r.email}</div>
      <div className="small muted">{r.phone || 'No phone'} · {r.applications} application(s) · updated {fmtDate(r.updatedAt)}</div>
    </div>
  );
}

export default function Duplicates() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api.get('/search/duplicates'));
  const [merge, setMerge] = useState(null);

  const doMerge = async () => {
    try {
      const d = await api.post('/search/duplicates/merge', { keepId: merge.keep.id, mergeId: merge.drop.id, confirm: true });
      toast(`Merged: ${d.moved} application(s) moved, ${d.closedDuplicates} duplicate(s) closed`);
      setMerge(null);
      reload();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <div className="page-head"><div><h1>Possible duplicates</h1><p className="muted">Records matched on normalised email and phone plus resume similarity. Nothing is merged until you confirm.</p></div></div>
      {loading && <Loading label="Checking records" />}
      <Alert>{error?.message}</Alert>
      {data && !data.pairs.length && <Empty title="No likely duplicates">Records that share contact details or near-identical resumes will appear here.</Empty>}
      <div className="stack">
        {data?.pairs.map((p) => (
          <section className="panel" key={`${p.a.id}-${p.b.id}`}>
            <div className="row between" style={{ marginBottom: '0.75rem' }}>
              <span className="pill st-recruiter_review">{Math.round(p.score * 100)}% likely the same person</span>
              <span className="small muted">{p.reasons.join(' · ')}</span>
            </div>
            <div className="grid two">
              <div className="panel flat"><Record r={p.a} /><button className="btn secondary small" style={{ marginTop: 8 }} onClick={() => setMerge({ keep: p.a, drop: p.b })}>Keep this record</button></div>
              <div className="panel flat"><Record r={p.b} /><button className="btn secondary small" style={{ marginTop: 8 }} onClick={() => setMerge({ keep: p.b, drop: p.a })}>Keep this record</button></div>
            </div>
          </section>
        ))}
      </div>
      {merge && (
        <Modal title="Merge these records?" onClose={() => setMerge(null)}>
          <p>Applications from <b>{merge.drop.name}</b> ({merge.drop.email}) will move to <b>{merge.keep.name}</b> ({merge.keep.email}). If both applied to the same job, the duplicate application is closed. This is recorded in each application's audit trail.</p>
          <div className="row"><button className="btn" onClick={doMerge}>Merge records</button><button className="btn ghost" onClick={() => setMerge(null)}>Cancel</button></div>
        </Modal>
      )}
    </>
  );
}
