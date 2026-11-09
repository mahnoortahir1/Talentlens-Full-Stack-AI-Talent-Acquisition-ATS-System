import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Alert, Field, Loading, useToast } from '../../components/ui.jsx';

const EMPTY = {
  title: '', department: '', location: '', type: 'full-time', salaryMin: '', salaryMax: '', currency: 'PKR', description: '',
  requiredSkills: [], preferredSkills: [], minExperienceYears: 0, qualifications: [],
  weights: { skills: 50, experience: 25, projects: 15, qualifications: 10 },
};

function SkillEditor({ label, skills, onChange, hint }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const name = draft.trim();
    if (!name || skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) return setDraft('');
    onChange([...skills, { name, importance: 3 }]);
    setDraft('');
  };
  return (
    <div className="field">
      <label htmlFor={`add-${label}`}>{label}</label>
      {skills.length > 0 && (
        <ul className="list" style={{ border: '1px solid var(--line)', borderRadius: 9, padding: '0 0.75rem', background: '#fff' }}>
          {skills.map((s, i) => (
            <li key={s.name} className="row between" style={{ padding: '0.45rem 0' }}>
              <span><b>{s.name}</b>{s.unverified && <span className="small" style={{ color: 'var(--rose)' }}> · not found in text, check this</span>}</span>
              <span className="row">
                <label className="small muted" htmlFor={`imp-${label}-${i}`}>Importance</label>
                <select id={`imp-${label}-${i}`} style={{ width: 'auto', minHeight: 34, padding: '0.2rem 0.4rem' }} value={s.importance} onChange={(e) => onChange(skills.map((x, j) => (j === i ? { ...x, importance: Number(e.target.value) } : x)))}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <button type="button" className="btn ghost small" onClick={() => onChange(skills.filter((_, j) => j !== i))} aria-label={`Remove ${s.name}`}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input id={`add-${label}`} placeholder="Add a skill, e.g. Django" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="btn secondary" onClick={add}>Add</button>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export default function JobForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractSource, setExtractSource] = useState('');

  useEffect(() => {
    if (!id) return;
    api.get(`/jobs/${id}`).then(({ job }) => setForm({ ...EMPTY, ...job, salaryMin: job.salaryMin ?? '', salaryMax: job.salaryMax ?? '', weights: job.weights || EMPTY.weights })).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [id]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const weightSum = Object.values(form.weights).reduce((a, b) => a + Number(b || 0), 0);

  const extract = async () => {
    setExtracting(true); setError('');
    try {
      const { requirements: r } = await api.post('/jobs/extract', { description: form.description });
      setForm((f) => ({
        ...f,
        requiredSkills: r.requiredSkills.map(({ name, importance, unverified }) => ({ name, importance, unverified })),
        preferredSkills: r.preferredSkills.map(({ name, importance, unverified }) => ({ name, importance, unverified })),
        minExperienceYears: r.minExperienceYears || f.minExperienceYears,
        qualifications: r.qualifications?.length ? r.qualifications : f.qualifications,
      }));
      setExtractSource(r.source === 'rules' ? 'Extracted with the built-in rule engine.' : `Extracted with ${r.source} and checked against your text.`);
    } catch (e) { setError(e.message); } finally { setExtracting(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (weightSum !== 100) return setError('Scoring weights must add up to 100.');
    setBusy(true); setError('');
    const payload = {
      ...form,
      salaryMin: form.salaryMin === '' ? undefined : Number(form.salaryMin),
      salaryMax: form.salaryMax === '' ? undefined : Number(form.salaryMax),
      minExperienceYears: Number(form.minExperienceYears) || 0,
      requiredSkills: form.requiredSkills.map(({ name, importance }) => ({ name, importance })),
      preferredSkills: form.preferredSkills.map(({ name, importance }) => ({ name, importance })),
      qualifications: form.qualifications.filter(Boolean),
      weights: Object.fromEntries(Object.entries(form.weights).map(([k, v]) => [k, Number(v)])),
    };
    ['id', 'status', 'createdAt', 'applied'].forEach((k) => delete payload[k]);
    try {
      const res = id ? await api.put(`/jobs/${id}`, payload) : await api.post('/jobs', payload);
      toast(id ? `Job saved${res.reassessed ? `, ${res.reassessed} applicants re-scored` : ''}` : 'Job published');
      navigate(`/recruiter/jobs/${res.job.id}`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (loading) return <Loading />;

  return (
    <form onSubmit={submit} noValidate>
      <div className="page-head">
        <div><h1>{id ? 'Edit job' : 'Create a job'}</h1><p className="muted">Applicants are scored against the skills and weights below.</p></div>
        <div className="row">
          <button type="button" className="btn secondary" onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : id ? 'Save changes' : 'Publish job'}</button>
        </div>
      </div>
      <Alert>{error}</Alert>

      <div className="split">
        <div className="stack">
          <section className="panel">
            <h2>Role</h2>
            <div className="form-grid">
              <Field label="Job title" id="title"><input id="title" required value={form.title} onChange={set('title')} placeholder="Backend Developer" /></Field>
              <Field label="Department" id="dept"><input id="dept" value={form.department} onChange={set('department')} /></Field>
              <Field label="Location" id="loc"><input id="loc" value={form.location} onChange={set('location')} placeholder="Lahore or remote" /></Field>
              <Field label="Employment type" id="type">
                <select id="type" value={form.type} onChange={set('type')}>
                  <option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option><option value="remote">Remote</option>
                </select>
              </Field>
              <Field label="Salary from" id="smin"><input id="smin" type="number" min="0" value={form.salaryMin} onChange={set('salaryMin')} /></Field>
              <Field label="Salary to" id="smax"><input id="smax" type="number" min="0" value={form.salaryMax} onChange={set('salaryMax')} /></Field>
            </div>
            <Field label="Job description" id="desc" hint="Write requirements as you normally would, then extract them below.">
              <textarea id="desc" rows={10} value={form.description} onChange={set('description')} placeholder={'We are hiring a Backend Developer.\nRequirements:\n- 3+ years with Python and Django\n- Strong PostgreSQL\n- Docker\nNice to have: Kubernetes, AWS'} />
            </Field>
            <div className="row">
              <button type="button" className="btn secondary" onClick={extract} disabled={extracting || form.description.trim().length < 30}>{extracting ? 'Extracting…' : 'Extract requirements from description'}</button>
              {extractSource && <span className="small muted">{extractSource} Review before publishing.</span>}
            </div>
          </section>

          <section className="panel">
            <h2>Requirements</h2>
            <SkillEditor label="Required skills" skills={form.requiredSkills} onChange={(v) => setForm({ ...form, requiredSkills: v })} hint="Importance 5 = critical. Equivalent names (JS / JavaScript) are merged automatically." />
            <SkillEditor label="Preferred skills" skills={form.preferredSkills} onChange={(v) => setForm({ ...form, preferredSkills: v })} hint="Preferred skills count half as much as required ones." />
            <div className="form-grid">
              <Field label="Minimum years of experience" id="minexp"><input id="minexp" type="number" min="0" max="40" value={form.minExperienceYears} onChange={set('minExperienceYears')} /></Field>
              <Field label="Qualifications" id="quals" hint="One per line, e.g. Bachelor's in Computer Science">
                <textarea id="quals" rows={3} style={{ minHeight: 80 }} value={form.qualifications.join('\n')} onChange={(e) => setForm({ ...form, qualifications: e.target.value.split('\n') })} />
              </Field>
            </div>
          </section>
        </div>

        <aside className="panel">
          <h2>Scoring weights</h2>
          <p className="small muted">How much each part of the evidence counts toward the job-relevance score. Defaults follow the suggested 50/25/15/10 split.</p>
          {[['skills', 'Skills'], ['experience', 'Experience'], ['projects', 'Project relevance'], ['qualifications', 'Qualifications']].map(([k, l]) => (
            <Field key={k} label={`${l}: ${form.weights[k]}`} id={`w-${k}`}>
              <input id={`w-${k}`} type="range" min="0" max="100" step="5" value={form.weights[k]} onChange={(e) => setForm({ ...form, weights: { ...form.weights, [k]: Number(e.target.value) } })} />
            </Field>
          ))}
          <p className={weightSum === 100 ? 'small muted' : 'small'} style={weightSum === 100 ? {} : { color: 'var(--rose)', fontWeight: 700 }}>Total: {weightSum} / 100</p>
          <button type="button" className="btn ghost small" onClick={() => setForm({ ...form, weights: EMPTY.weights })}>Reset to defaults</button>
        </aside>
      </div>
    </form>
  );
}
