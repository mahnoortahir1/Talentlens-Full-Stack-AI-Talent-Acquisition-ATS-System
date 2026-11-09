import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Alert, Field, Loading, Modal, StatusPill, STATUS_LABEL, fmtDate, fmtDateTime, useLoad, useToast } from '../../components/ui.jsx';
import { ChipLegend, MATCH_TEXT, ScoreBar, SkillChip, gapKind } from '../../components/Evidence.jsx';

const ACTION_LABEL = { recruiter_review: 'Start review', shortlisted: 'Shortlist', rejected: 'Reject', interview: 'Move to interview', selected: 'Select candidate' };

/* ---------------- Assessment ---------------- */
function Assessment({ app, onSkills, busy }) {
  const a = app.assessment;
  if (!a) return <Alert kind="info">No AI assessment yet. The candidate's resume could not be parsed, so review it manually.</Alert>;
  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head"><h2>Job relevance</h2><span className="small muted">Scored {fmtDateTime(a.computedAt)}</span></div>
        <ScoreBar score={app.override?.score ?? a.score} breakdown={a.breakdown} overridden={app.override?.score != null} aiScore={a.score} />
        <ul style={{ margin: '1rem 0 0', paddingLeft: '1.1rem' }}>{a.explanation.map((e, i) => <li key={i} style={{ marginBottom: 4 }}>{e}</li>)}</ul>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Matched skills</h2><ChipLegend /></div>
        {!a.matchedSkills.length && <p className="muted">No job skills were matched.</p>}
        <ul className="list">
          {a.matchedSkills.map((m) => (
            <li key={m.skill}>
              <div className="row between">
                <span className="row"><SkillChip skill={m.skill} kind={m.matchedBy} /><span className="small muted">{m.required ? 'Required' : 'Preferred'} · {MATCH_TEXT[m.matchedBy]}{m.via ? ` (${m.via})` : ''}{m.similarity ? ` · similarity ${m.similarity}` : ''}</span></span>
                <span className="small"><b>{Math.round(m.credit * 100)}%</b> credit</span>
              </div>
              {m.evidence.map((e, i) => <p key={i} className="evidence">{e}</p>)}
              {!m.evidence.length && <p className="evidence warn">No supporting excerpt. Verify in interview.</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Gaps</h2><span className="small muted">Missing evidence is not the same as a confirmed absence.</span></div>
        {!a.gaps.length && <p className="muted">No gaps against this job's skills.</p>}
        <ul className="list">
          {a.gaps.map((g) => (
            <li key={g.skill}>
              <div className="row between">
                <span className="row"><SkillChip skill={g.skill} kind={gapKind(g.type)} /><span className="small muted">{g.required ? 'Required' : 'Preferred'} · {g.type === 'confirmed_absent' ? 'Confirmed absent' : g.type === 'weak_evidence' ? 'Indirect evidence only' : 'No evidence in resume'}</span></span>
                {g.type === 'confirmed_absent'
                  ? <button className="btn ghost small" disabled={busy} onClick={() => onSkills({ clearAbsent: [g.skill] })}>Undo</button>
                  : <span className="row"><button className="btn ghost small" disabled={busy} onClick={() => onSkills({ add: [{ name: g.skill }] })}>Candidate has it</button><button className="btn ghost small" disabled={busy} onClick={() => onSkills({ confirmAbsent: [g.skill] })}>Confirm absent</button></span>}
              </div>
              <p className="small muted" style={{ margin: '0.3rem 0 0' }}>{g.note}</p>
              {g.evidence?.map((e, i) => <p key={i} className="evidence small">{e}</p>)}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid two">
        <section className="panel">
          <h3>Experience</h3>
          <p>{a.experience.years} years (job asks for {a.experience.required || 'no minimum'}).</p>
          {a.experience.mostRelevant && <p className="evidence"><b>{[a.experience.mostRelevant.title, a.experience.mostRelevant.company].filter(Boolean).join(' at ')}</b><br />{a.experience.mostRelevant.excerpt}</p>}
        </section>
        <section className="panel">
          <h3>Projects</h3>
          {!a.projects.length && <p className="muted">No relevant projects found.</p>}
          {a.projects.map((p) => <div key={p.name} style={{ marginBottom: 8 }}><b>{p.name}</b> <span className="small muted">{Math.round(p.score * 100)}% relevant</span><p className="evidence small">{p.description}</p></div>)}
        </section>
        <section className="panel">
          <h3>Qualifications</h3>
          <p>{a.qualifications.note}</p>
        </section>
        <section className="panel">
          <h3>Suggested learning areas</h3>
          {a.learningAreas.length ? <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>{a.learningAreas.map((l) => <li key={l}>{l}</li>)}</ul> : <p className="muted">None.</p>}
        </section>
      </div>
    </div>
  );
}

/* ---------------- Resume details ---------------- */
function ResumeDetails({ appId, profile, verification, onSkills, busy }) {
  const [draft, setDraft] = useState('');
  const p = profile.parsed || {};
  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head"><h2>Extracted details</h2><a className="btn secondary small" href={`/api/applications/${appId}/resume`} target="_blank" rel="noreferrer">Open original resume</a></div>
        <dl className="kv">
          <dt>Name</dt><dd>{p.name || '—'}</dd>
          <dt>Email</dt><dd>{p.email || '—'}</dd>
          <dt>Phone</dt><dd>{p.phone || profile.phone || '—'}</dd>
          <dt>Links</dt><dd>{p.links?.length ? p.links.join(', ') : '—'}</dd>
          <dt>Experience</dt><dd>{profile.experienceYearsOverride ?? p.totalExperienceYears ?? 0} years{profile.experienceYearsOverride != null ? ' (set by candidate)' : ''}</dd>
          <dt>File</dt><dd>{profile.resume?.fileName} · uploaded {fmtDate(profile.resume?.uploadedAt)}</dd>
        </dl>
        {p.protectedLinesRemoved > 0 && <p className="small muted" style={{ marginTop: 8 }}>{p.protectedLinesRemoved} personal-attribute line(s) were removed before scoring.</p>}
        {p.warnings?.map((w) => <p key={w} className="evidence warn small">{w}</p>)}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Skills and their evidence</h2><span className="small muted">Every skill is checked against the resume text.</span></div>
        <ul className="list">
          {verification.map((v) => (
            <li key={v.name}>
              <div className="row between">
                <span className="row"><SkillChip skill={v.name} kind={v.supported ? 'exact' : 'self-reported'} /><span className="small muted">{v.source === 'parser' ? 'Extracted' : `Added by ${v.source}`}</span></span>
                <button className="btn ghost small" disabled={busy} onClick={() => onSkills({ remove: [v.name] })}>Remove</button>
              </div>
              {v.supported ? <p className="evidence small">{v.excerpt}</p> : <p className="evidence warn small">Unsupported: no matching text in the resume. Flagged for manual review.</p>}
            </li>
          ))}
        </ul>
        <div className="row" style={{ marginTop: '0.75rem', flexWrap: 'nowrap' }}>
          <label htmlFor="add-skill" className="sr-only">Add a skill the parser missed</label>
          <input id="add-skill" placeholder="Add a skill the parser missed" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="btn secondary" disabled={!draft.trim() || busy} onClick={() => { onSkills({ add: [{ name: draft.trim() }] }); setDraft(''); }}>Add</button>
        </div>
      </section>

      <div className="grid two">
        <section className="panel">
          <h3>Work history</h3>
          {!p.experience?.length && <p className="muted">None detected.</p>}
          <ul className="list">{p.experience?.map((e, i) => <li key={i}><b>{e.title || 'Role'}</b>{e.company ? ` at ${e.company}` : ''}<div className="small muted">{fmtDate(e.start, { day: undefined })} – {fmtDate(e.end, { day: undefined })} · {Math.round(e.months)} months</div></li>)}</ul>
        </section>
        <section className="panel">
          <h3>Education</h3>
          {!p.education?.length && <p className="muted">None detected.</p>}
          <ul className="list">{p.education?.map((e, i) => <li key={i}>{e.text}</li>)}</ul>
          <h3 style={{ marginTop: '1rem' }}>Projects</h3>
          {!p.projects?.length && <p className="muted">None detected.</p>}
          <ul className="list">{p.projects?.map((pr) => <li key={pr.name}><b>{pr.name}</b><div className="small">{pr.description}</div></li>)}</ul>
        </section>
      </div>
    </div>
  );
}

/* ---------------- Interview questions ---------------- */
const QTYPE_LABEL = { technical: 'Technical', project: 'Project', scenario: 'Problem-solving', behavioral: 'Behavioral', role: 'Technical', gap: 'Gap' };
function Questions({ app, setApp }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState('');
  const [editing, setEditing] = useState(null);
  const qs = app.questions || [];
  // Every question shown so far; sent with each request so the next set never repeats them.
  const [previousQuestions, setPreviousQuestions] = useState(() => [...(app.previousQuestions || []), ...qs.map((q) => q.text)]);

  const generate = async (replaceId) => {
    setBusy(true);
    try {
      const sent = [...new Set([...previousQuestions, ...qs.map((q) => q.text)])];
      const d = await api.post(`/applications/${app._id}/questions/generate`, { focus: focus || undefined, replaceId, previousQuestions: sent.slice(-100) });
      setPreviousQuestions(d.previousQuestions || [...sent, ...d.questions.map((q) => q.text)]);
      setApp({ ...app, questions: d.questions, previousQuestions: d.previousQuestions });
      toast(replaceId ? 'Question regenerated' : `${d.questions.length} questions generated`);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const save = async (questions) => {
    try { const d = await api.put(`/applications/${app._id}/questions`, { questions }); setApp({ ...app, questions: d.questions }); setEditing(null); toast('Questions saved'); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <section className="panel">
      <div className="panel-head"><h2>Interview questions</h2>{qs[0] && <span className="small muted">Source: {qs[0].source === 'template' ? 'evidence-driven generator (add an LLM key for free-form questions)' : qs[0].source}</span>}</div>
      <div className="row" style={{ marginBottom: '1rem', flexWrap: 'nowrap' }}>
        <label htmlFor="focus" className="sr-only">Optional focus</label>
        <input id="focus" placeholder="Optional focus, e.g. database performance" value={focus} onChange={(e) => setFocus(e.target.value)} />
        <button className="btn" disabled={busy} onClick={() => generate()}>{busy ? 'Generating…' : qs.length ? 'Regenerate all' : 'Generate questions'}</button>
      </div>
      {!qs.length && <p className="muted">Each set has 2 technical, 2 project-based, 1 problem-solving and 1 behavioral question, built from this candidate's CV. Regenerating never repeats earlier questions.</p>}
      {qs.map((q) => (
        <div key={q.id} className={`q-item ${q.flagged ? 'flagged' : ''}`}>
          {editing?.id === q.id ? (
            <>
              <Field label="Question" id={`qt-${q.id}`}><textarea id={`qt-${q.id}`} rows={3} style={{ minHeight: 70 }} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} /></Field>
              <div className="form-grid">
                <Field label="Difficulty" id={`qd-${q.id}`}><select id={`qd-${q.id}`} value={editing.difficulty} onChange={(e) => setEditing({ ...editing, difficulty: e.target.value })}><option>beginner</option><option>intermediate</option><option>advanced</option></select></Field>
              </div>
              <Field label="Answer guideline" id={`qg-${q.id}`}><textarea id={`qg-${q.id}`} rows={2} style={{ minHeight: 60 }} value={editing.guideline} onChange={(e) => setEditing({ ...editing, guideline: e.target.value })} /></Field>
              <div className="row"><button className="btn small" onClick={() => save(qs.map((x) => (x.id === q.id ? editing : x)))}>Save question</button><button className="btn ghost small" onClick={() => setEditing(null)}>Cancel</button></div>
            </>
          ) : (
            <>
              <div className="row between">
                <span className="row"><span className={`diff ${q.difficulty}`}>{q.difficulty}</span><span className="small muted">{QTYPE_LABEL[q.type] || 'Technical'}{q.type === 'project' && q.projectRef ? ` · About "${q.projectRef}"` : q.type === 'gap' ? ` · ${q.skill}` : q.skill ? ` · ${q.skill}` : ''}</span>{q.edited && <span className="small muted">edited</span>}</span>
                <span className="row">
                  <button className="btn ghost small" onClick={() => setEditing(q)}>Edit</button>
                  <button className="btn ghost small" disabled={busy} onClick={() => generate(q.id)}>Regenerate</button>
                  <button className="btn ghost small" onClick={() => save(qs.filter((x) => x.id !== q.id))}>Remove</button>
                </span>
              </div>
              <p style={{ margin: '0.4rem 0' }}>{q.text}</p>
              {q.flagged && <p className="evidence warn small">{q.flagReason}</p>}
              {q.guideline && <details><summary className="small">Answer guideline</summary><p className="small" style={{ marginTop: 6 }}>{q.guideline}</p></details>}
            </>
          )}
        </div>
      ))}
    </section>
  );
}

/* ---------------- Interviews ---------------- */
function Interviews({ app, interviews, reload }) {
  const toast = useToast();
  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setHours(10, 0, 0, 0);
  const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [form, setForm] = useState({ start: local, durationMinutes: 45, type: 'technical', interviewerName: '', interviewerEmail: '', locationOrLink: '' });
  const [conflicts, setConflicts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState(null);
  const canSchedule = ['shortlisted', 'interview'].includes(app.status);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const schedule = async (force = false) => {
    setBusy(true);
    try {
      await api.post('/interviews', { applicationId: app._id, start: new Date(form.start).toISOString(), durationMinutes: Number(form.durationMinutes), type: form.type, interviewer: { name: form.interviewerName, email: form.interviewerEmail }, locationOrLink: form.locationOrLink, force });
      setConflicts(null);
      toast('Interview scheduled and candidate notified');
      reload();
    } catch (e) {
      if (e.status === 409 && e.data?.conflicts) setConflicts(e.data.conflicts);
      else toast(e.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      {interviews.map((i) => (
        <section className="panel" key={i._id}>
          <div className="row between">
            <div><b>{fmtDateTime(i.start)}</b> · {i.durationMinutes} min · {i.type}<div className="small muted">with {i.interviewer.name}{i.locationOrLink ? ` · ${i.locationOrLink}` : ''}</div></div>
            <span className="pill">{i.status}</span>
          </div>
          {i.feedback?.recommendation ? (
            <dl className="kv" style={{ marginTop: '0.75rem' }}>
              <dt>Ratings</dt><dd>Technical {i.feedback.ratings.technical}/5 · Communication {i.feedback.ratings.communication}/5 · Problem solving {i.feedback.ratings.problemSolving}/5 · Role fit {i.feedback.ratings.roleFit}/5</dd>
              <dt>Recommendation</dt><dd><b>{i.feedback.recommendation.replace('_', ' ')}</b></dd>
              <dt>Strengths</dt><dd>{i.feedback.strengths || '—'}</dd>
              <dt>Concerns</dt><dd>{i.feedback.concerns || '—'}</dd>
            </dl>
          ) : i.status !== 'cancelled' && <button className="btn secondary small" style={{ marginTop: '0.75rem' }} onClick={() => setFeedbackFor(i)}>Record feedback</button>}
        </section>
      ))}

      {canSchedule ? (
        <section className="panel">
          <h2>Schedule an interview</h2>
          <div className="form-grid">
            <Field label="Date and time" id="iv-start"><input id="iv-start" type="datetime-local" value={form.start} onChange={set('start')} /></Field>
            <Field label="Duration (minutes)" id="iv-dur"><input id="iv-dur" type="number" min="15" max="480" step="15" value={form.durationMinutes} onChange={set('durationMinutes')} /></Field>
            <Field label="Type" id="iv-type"><select id="iv-type" value={form.type} onChange={set('type')}><option value="technical">Technical</option><option value="video">Video</option><option value="phone">Phone</option><option value="onsite">On-site</option><option value="hr">HR</option></select></Field>
            <Field label="Interviewer name" id="iv-name"><input id="iv-name" value={form.interviewerName} onChange={set('interviewerName')} /></Field>
            <Field label="Interviewer email" id="iv-email"><input id="iv-email" type="email" value={form.interviewerEmail} onChange={set('interviewerEmail')} /></Field>
            <Field label="Location or meeting link" id="iv-loc"><input id="iv-loc" value={form.locationOrLink} onChange={set('locationOrLink')} /></Field>
          </div>
          {conflicts && (
            <div className="alert error">
              <b>Scheduling conflict</b>
              <ul style={{ margin: '0.4rem 0', paddingLeft: '1.1rem' }}>{conflicts.map((c) => <li key={c.id}>{c.reason}: {c.candidate} with {c.interviewer}, {fmtDateTime(c.start)}</li>)}</ul>
              <button className="btn danger small" disabled={busy} onClick={() => schedule(true)}>Schedule anyway</button>
            </div>
          )}
          <button className="btn" disabled={busy || form.interviewerName.trim().length < 2} onClick={() => schedule(false)}>{busy ? 'Scheduling…' : 'Schedule interview'}</button>
        </section>
      ) : !interviews.length && <p className="muted">Shortlist this candidate to schedule an interview.</p>}

      {feedbackFor && <FeedbackModal interview={feedbackFor} onClose={() => setFeedbackFor(null)} onSaved={() => { setFeedbackFor(null); reload(); }} />}
    </div>
  );
}

export function FeedbackModal({ interview, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ technical: 3, communication: 3, problemSolving: 3, roleFit: 3, strengths: '', concerns: '', recommendation: 'yes' });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/interviews/${interview._id}/feedback`, { ratings: { technical: f.technical, communication: f.communication, problemSolving: f.problemSolving, roleFit: f.roleFit }, strengths: f.strengths, concerns: f.concerns, recommendation: f.recommendation });
      toast('Feedback saved');
      onSaved();
    } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <Modal title="Interview feedback" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          {[['technical', 'Technical'], ['communication', 'Communication'], ['problemSolving', 'Problem solving'], ['roleFit', 'Role fit']].map(([k, l]) => (
            <Field key={k} label={`${l}: ${f[k]}/5`} id={`fb-${k}`}><input id={`fb-${k}`} type="range" min="1" max="5" value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} /></Field>
          ))}
        </div>
        <Field label="Strengths" id="fb-s"><textarea id="fb-s" rows={3} style={{ minHeight: 70 }} value={f.strengths} onChange={(e) => setF({ ...f, strengths: e.target.value })} /></Field>
        <Field label="Concerns" id="fb-c"><textarea id="fb-c" rows={3} style={{ minHeight: 70 }} value={f.concerns} onChange={(e) => setF({ ...f, concerns: e.target.value })} /></Field>
        <Field label="Recommendation" id="fb-r"><select id="fb-r" value={f.recommendation} onChange={(e) => setF({ ...f, recommendation: e.target.value })}><option value="strong_yes">Strong yes</option><option value="yes">Yes</option><option value="no">No</option><option value="strong_no">Strong no</option></select></Field>
        <button className="btn block">Save feedback</button>
      </form>
    </Modal>
  );
}

/* ---------------- Side panel: override, notes, checks, audit ---------------- */
function SidePanel({ app, setApp }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [ov, setOv] = useState({ score: app.override?.score ?? '', reason: app.override?.reason || '' });
  const [fair, setFair] = useState(app.fairness);
  const [verify, setVerify] = useState(null);
  const [busy, setBusy] = useState('');

  const run = async (key, fn) => { setBusy(key); try { await fn(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); } };

  return (
    <aside className="stack">
      <section className="panel">
        <h3>Override score</h3>
        <p className="small muted">Your judgement wins. A reason is required and recorded in the audit trail.</p>
        <div className="form-grid">
          <Field label="Score" id="ov-s"><input id="ov-s" type="number" min="0" max="100" value={ov.score} onChange={(e) => setOv({ ...ov, score: e.target.value })} /></Field>
        </div>
        <Field label="Reason" id="ov-r"><input id="ov-r" value={ov.reason} onChange={(e) => setOv({ ...ov, reason: e.target.value })} /></Field>
        <div className="row">
          <button className="btn small" disabled={busy || ov.score === ''} onClick={() => run('ov', async () => { const d = await api.post(`/applications/${app._id}/override`, { score: Number(ov.score), reason: ov.reason }); setApp(d.application); toast('Score overridden'); })}>Save override</button>
          {app.override?.score != null && <button className="btn ghost small" onClick={() => run('ov', async () => { const d = await api.post(`/applications/${app._id}/override`, { score: null }); setApp(d.application); setOv({ score: '', reason: '' }); toast('Override removed'); })}>Remove</button>}
        </div>
      </section>

      <section className="panel">
        <h3>Private notes</h3>
        <p className="small muted">Visible to recruiters only.</p>
        <ul className="list">{app.notes.map((n) => <li key={n._id}><div className="small muted">{n.authorName} · {fmtDateTime(n.at)}</div>{n.text}</li>)}</ul>
        <Field label="Add a note" id="note"><textarea id="note" rows={2} style={{ minHeight: 64 }} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <button className="btn secondary small" disabled={!note.trim() || busy} onClick={() => run('note', async () => { const d = await api.post(`/applications/${app._id}/notes`, { text: note }); setApp({ ...app, notes: d.notes }); setNote(''); })}>Save note</button>
      </section>

      <section className="panel">
        <h3>Fairness check</h3>
        <p className="small muted">Re-scores this resume with only name, gender, age, nationality, religion or marital status changed.</p>
        {fair && (
          <>
            <p className={fair.passed ? 'evidence small' : 'evidence warn small'}><b>{fair.passed ? 'Passed' : 'Needs attention'}:</b> largest score change {fair.maxDelta} point(s) from a baseline of {fair.baseline}.</p>
            <details><summary className="small">Variants tested</summary><ul className="small" style={{ paddingLeft: '1.1rem' }}>{fair.variants.map((v) => <li key={v.label}>{v.label}: {v.score} ({v.delta >= 0 ? '+' : ''}{v.delta})</li>)}</ul></details>
          </>
        )}
        <button className="btn secondary small" disabled={busy === 'fair'} onClick={() => run('fair', async () => { const d = await api.post(`/applications/${app._id}/fairness`); setFair(d.fairness); })}>{busy === 'fair' ? 'Testing…' : fair ? 'Run again' : 'Run fairness check'}</button>
      </section>

      <section className="panel">
        <h3>Claim verification</h3>
        <p className="small muted">Links each AI claim to a resume excerpt and flags anything unsupported.</p>
        {verify && (
          <>
            <p className="small"><b>{verify.results.length - verify.unsupported}</b> supported, <b style={{ color: verify.unsupported ? 'var(--rose)' : undefined }}>{verify.unsupported}</b> unsupported.</p>
            <ul className="list small">{verify.results.filter((r) => !r.supported).map((r, i) => <li key={i} style={{ color: 'var(--rose)' }}>{r.claim}</li>)}</ul>
          </>
        )}
        <button className="btn secondary small" disabled={busy === 'verify'} onClick={() => run('verify', async () => setVerify(await api.post(`/applications/${app._id}/verify`)))}>{busy === 'verify' ? 'Checking…' : 'Verify claims'}</button>
      </section>

      <section className="panel">
        <h3>Audit trail</h3>
        <ol className="timeline">
          {[...app.history].reverse().map((h, i) => (
            <li key={i}>
              <div><b>{h.from === h.to ? 'Update' : STATUS_LABEL[h.to] || h.to}</b> <span className="small muted">by {h.byName}</span></div>
              {h.note && <div className="small">{h.note}</div>}
              <div className="small muted">{fmtDateTime(h.at)}</div>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

/* ---------------- Page ---------------- */
export default function ApplicationReview() {
  const { id } = useParams();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useLoad(() => api.get(`/applications/${id}`), [id]);
  const [tab, setTab] = useState('assessment');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [note, setNote] = useState('');

  if (loading && !data) return <Loading label="Loading application" />;
  if (error) return <Alert>{error.message}</Alert>;
  const { application: app, job, profile, verification, interviews, allowedTransitions } = data;
  const setApp = (a) => setData((d) => ({ ...d, application: { ...d.application, ...a } }));

  const move = async (status) => {
    setBusy(true);
    try {
      const d = await api.patch(`/applications/${app._id}/status`, { status, note: note || undefined });
      setData((x) => ({ ...x, application: d.application, allowedTransitions: d.allowedTransitions }));
      toast(`${ACTION_LABEL[status] === 'Reject' ? 'Rejected' : STATUS_LABEL[status]}. Candidate notified where relevant.`);
      setConfirm(null); setNote('');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const correctSkills = async (body) => {
    setBusy(true);
    try {
      await api.post(`/applications/${app._id}/skills`, body);
      await reload();
      toast('Skills updated and score recalculated');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <>
      <p className="small"><Link to={`/recruiter/jobs/${job._id}`}>{job.title}</Link> / applicant</p>
      <div className="page-head">
        <div>
          <h1>{app.candidate.name}</h1>
          <div className="row"><StatusPill status={app.status} /><span className="small muted">Applied {fmtDate(app.createdAt)} · {app.candidate.email}</span></div>
        </div>
        <div className="row">
          {allowedTransitions.map((s) => (
            <button key={s} className={`btn ${s === 'rejected' ? 'danger' : s === 'recruiter_review' ? 'secondary' : ''}`} disabled={busy} onClick={() => (['rejected', 'selected'].includes(s) ? setConfirm(s) : move(s))}>{ACTION_LABEL[s]}</button>
          ))}
        </div>
      </div>

      {app.coverNote && <div className="panel flat" style={{ marginBottom: '1rem' }}><b>Cover note</b><p style={{ margin: '0.3rem 0 0' }}>{app.coverNote}</p></div>}

      <div className="split">
        <div>
          <div className="tabs" role="tablist">
            {[['assessment', 'AI assessment'], ['resume', 'Resume details'], ['questions', 'Interview questions'], ['interviews', `Interviews${interviews.length ? ` (${interviews.length})` : ''}`]].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {tab === 'assessment' && <Assessment app={app} onSkills={correctSkills} busy={busy} />}
          {tab === 'resume' && <ResumeDetails appId={app._id} profile={profile} verification={verification} onSkills={correctSkills} busy={busy} />}
          {tab === 'questions' && <Questions app={app} setApp={setApp} />}
          {tab === 'interviews' && <Interviews app={app} interviews={interviews} reload={reload} />}
        </div>
        <SidePanel key={app._id} app={app} setApp={setApp} />
      </div>

      {confirm && (
        <Modal title={confirm === 'selected' ? 'Select this candidate?' : 'Reject this application?'} onClose={() => setConfirm(null)}>
          <p>{confirm === 'selected' ? 'This records your final hiring decision and notifies the candidate.' : 'The candidate will be told the team is not moving forward. You can reconsider later; every change is logged.'}</p>
          <Field label="Reason (recorded in the audit trail)" id="mv-note"><textarea id="mv-note" rows={3} style={{ minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="row"><button className={`btn ${confirm === 'rejected' ? 'danger' : ''}`} disabled={busy} onClick={() => move(confirm)}>{confirm === 'selected' ? 'Select candidate' : 'Reject application'}</button><button className="btn ghost" onClick={() => setConfirm(null)}>Cancel</button></div>
        </Modal>
      )}
    </>
  );
}
