import { useRef, useState } from 'react';
import { api } from '../../api.js';
import { Alert, Field, Loading, fmtDate, useLoad, useToast } from '../../components/ui.jsx';
import { SkillChip } from '../../components/Evidence.jsx';

function Upload({ onDone }) {
  const toast = useToast();
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (file) => {
    if (!file) return;
    if (!/\.(pdf|docx)$/i.test(file.name)) return setError('Please choose a PDF (or DOCX) file.');
    if (file.size > 5 * 1024 * 1024) return setError('That file is larger than 5 MB.');
    setBusy(true); setError('');
    const fd = new FormData();
    fd.append('resume', file);
    try {
      const d = await api.upload('/profile/me/resume', fd);
      d.profile.resume.status === 'parsed' ? toast(d.message) : setError(d.message);
      onDone(d.profile);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <Alert>{error}</Alert>
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        role="button" tabIndex={0}
        onClick={() => input.current.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files[0]); }}
      >
        {busy ? <><div className="spinner" style={{ margin: '0 auto 0.5rem' }} />Reading your resume…</> : <><b>Drop your resume here or choose a file</b><div className="small muted">PDF or DOCX, up to 5 MB. Text-based PDFs work best.</div></>}
        <input ref={input} type="file" accept=".pdf,.docx,application/pdf" hidden onChange={(e) => send(e.target.files[0])} />
      </div>
    </>
  );
}

function SkillsEditor({ profile, onSaved }) {
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const removed = profile.skillCorrections.filter((c) => c.by === 'candidate' && c.action === 'remove').map((c) => c.name);
  const added = profile.skillCorrections.filter((c) => c.by === 'candidate' && c.action === 'add').map((c) => ({ name: c.name, evidence: c.evidence }));

  const save = async (next) => {
    setBusy(true);
    try { const d = await api.put('/profile/me/skills', next); onSaved(d.profile); toast('Skills updated'); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <section className="panel">
      <div className="panel-head"><h2>Skills</h2><span className="small muted">Hover a skill to see the resume line it came from.</span></div>
      <div className="chips">
        {profile.effectiveSkills.map((s) => (
          <SkillChip key={s.name} skill={s.name} kind={s.evidence.length ? 'exact' : 'self-reported'} title={s.evidence[0] || 'Added by you, with no matching resume line'}
            onRemove={busy ? undefined : () => save({ add: added.filter((a) => a.name !== s.name), remove: [...removed, s.name] })} />
        ))}
      </div>
      <div className="row" style={{ marginTop: '0.75rem', flexWrap: 'nowrap' }}>
        <label htmlFor="sk" className="sr-only">Add a skill</label>
        <input id="sk" placeholder="Add a skill we missed" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn secondary" disabled={busy || !draft.trim()} onClick={() => { save({ add: [...added, { name: draft.trim() }], remove: removed.filter((r) => r.toLowerCase() !== draft.trim().toLowerCase()) }); setDraft(''); }}>Add</button>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>Skills you add without a matching line in your resume are marked for recruiters to verify.</p>
      {removed.length > 0 && <p className="small">Removed: {removed.join(', ')} <button className="btn ghost small" onClick={() => save({ add: added, remove: [] })}>Restore all</button></p>}
    </section>
  );
}

export default function Profile() {
  const toast = useToast();
  const { data, error, loading, setData } = useLoad(() => api.get('/profile/me'));
  const [form, setForm] = useState(null);
  if (loading) return <Loading />;
  if (error) return <Alert>{error.message}</Alert>;
  const p = data.profile;
  const f = form || { headline: p.headline || '', phone: p.phone || '', location: p.location || '', interests: (p.interests || []).join(', '), talentPoolConsent: p.talentPoolConsent, experienceYearsOverride: p.experienceYearsOverride ?? '' };
  const setProfile = (profile) => setData({ profile });
  const parsed = p.parsed || {};

  const saveDetails = async (e) => {
    e.preventDefault();
    try {
      const d = await api.put('/profile/me', { headline: f.headline, phone: f.phone, location: f.location, interests: f.interests.split(',').map((x) => x.trim()).filter(Boolean), talentPoolConsent: f.talentPoolConsent, experienceYearsOverride: f.experienceYearsOverride === '' ? null : Number(f.experienceYearsOverride) });
      setProfile(d.profile); setForm(null); toast('Profile saved');
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <>
      <div className="page-head"><div><h1>My resume</h1><p className="muted">What recruiters see is built from this. Check it and correct anything that's wrong.</p></div></div>
      <div className="split">
        <div className="stack">
          <section className="panel">
            <div className="panel-head"><h2>Resume file</h2>{p.resume?.fileName && <a className="small" href="/api/profile/me/resume" target="_blank" rel="noreferrer">{p.resume.fileName}</a>}</div>
            {p.resume?.uploadedAt && <p className="small muted">Uploaded {fmtDate(p.resume.uploadedAt)}. Uploading a new file replaces it and re-scores your open applications.</p>}
            {p.resume?.status === 'empty' && <Alert>{p.resume.error}</Alert>}
            <Upload onDone={setProfile} />
            {parsed.warnings?.map((w) => <p key={w} className="evidence warn small">{w}</p>)}
          </section>

          {p.resume?.status === 'parsed' && (
            <>
              <SkillsEditor profile={p} onSaved={setProfile} />
              <section className="panel">
                <h2>Experience</h2>
                <p className="small muted">We counted <b>{parsed.totalExperienceYears} years</b> (overlapping jobs counted once). If that's wrong, set it in your details.</p>
                <ul className="list">{parsed.experience?.map((e, i) => <li key={i}><b>{e.title || 'Role'}</b>{e.company ? ` at ${e.company}` : ''}<div className="small muted">{fmtDate(e.start, { day: undefined })} – {fmtDate(e.end, { day: undefined })}</div>{e.details?.length > 0 && <div className="small">{e.details.slice(0, 3).join(' ')}</div>}</li>)}</ul>
                {!parsed.experience?.length && <p className="muted">No dated roles found. Use a format like “Jan 2021 – Present”.</p>}
              </section>
              <div className="grid two">
                <section className="panel"><h2>Education</h2>{parsed.education?.length ? <ul className="list">{parsed.education.map((e, i) => <li key={i}>{e.text}</li>)}</ul> : <p className="muted">None found.</p>}</section>
                <section className="panel"><h2>Projects</h2>{parsed.projects?.length ? <ul className="list">{parsed.projects.map((x) => <li key={x.name}><b>{x.name}</b><div className="small">{x.description}</div></li>)}</ul> : <p className="muted">None found. A “Projects” section helps recruiters see your work.</p>}</section>
              </div>
            </>
          )}
        </div>

        <aside className="panel">
          <h2>Your details</h2>
          <form onSubmit={saveDetails}>
            <Field label="Headline" id="hl"><input id="hl" placeholder="Backend developer" value={f.headline} onChange={(e) => setForm({ ...f, headline: e.target.value })} /></Field>
            <Field label="Phone" id="ph"><input id="ph" value={f.phone} onChange={(e) => setForm({ ...f, phone: e.target.value })} /></Field>
            <Field label="Location" id="lc"><input id="lc" value={f.location} onChange={(e) => setForm({ ...f, location: e.target.value })} /></Field>
            <Field label="Interests" id="in" hint="Comma-separated. Used to recommend jobs."><input id="in" placeholder="APIs, cloud, data" value={f.interests} onChange={(e) => setForm({ ...f, interests: e.target.value })} /></Field>
            <Field label="Years of experience (optional correction)" id="yo"><input id="yo" type="number" min="0" max="60" step="0.5" value={f.experienceYearsOverride} onChange={(e) => setForm({ ...f, experienceYearsOverride: e.target.value })} /></Field>
            <label className="row" style={{ marginBottom: '1rem', alignItems: 'flex-start' }}>
              <input type="checkbox" checked={f.talentPoolConsent} onChange={(e) => setForm({ ...f, talentPoolConsent: e.target.checked })} style={{ marginTop: 4 }} />
              <span className="small">Let recruiters at companies I've applied to consider me for their other roles.</span>
            </label>
            <button className="btn block">Save details</button>
          </form>
          <hr className="divider" />
          <p className="small muted">Your name, contact details and any personal attributes (age, gender, nationality and similar) are not used when scoring applications.</p>
        </aside>
      </div>
    </>
  );
}
