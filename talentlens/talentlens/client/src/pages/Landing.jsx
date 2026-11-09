import { Link } from 'react-router-dom';
import { Logo } from '../components/ui.jsx';
import { ScoreBar, SkillChip } from '../components/Evidence.jsx';

// Illustrative example of what a recruiter sees for one applicant.
const EXAMPLE = {
  score: 81,
  breakdown: { skills: { score: 88, weight: 50, contribution: 44 }, experience: { score: 84, weight: 25, contribution: 21 }, projects: { score: 70, weight: 15, contribution: 10.5 }, qualifications: { score: 60, weight: 10, contribution: 6 } },
};

export default function Landing() {
  return (
    <div className="landing">
      <header>
        <Link to="/" className="brand"><Logo />TalentLens</Link>
        <div className="row">
          <Link className="btn ghost" to="/login">Sign in</Link>
          <Link className="btn" to="/register">Create account</Link>
        </div>
      </header>

      <section className="hero">
        <div>
          <h1>Shortlist on evidence, not keywords.</h1>
          <p className="lede">TalentLens reads each resume, links every skill to the line that proves it, and explains each score. Your team makes every hiring decision.</p>
          <div className="row" style={{ marginTop: '1.5rem' }}>
            <Link className="btn" to="/register?role=recruiter">Start as a recruiter</Link>
            <Link className="btn secondary" to="/register?role=candidate">I'm looking for a job</Link>
          </div>
        </div>

        <div className="hero-demo" aria-label="Example applicant assessment">
          <div className="panel">
            <div className="row between" style={{ marginBottom: '0.75rem' }}>
              <div><b>Backend Developer</b><div className="small muted">Applicant 2 of 3</div></div>
              <span className="pill st-ai_assessed">AI assessment ready</span>
            </div>
            <ScoreBar score={EXAMPLE.score} breakdown={EXAMPLE.breakdown} />
            <hr className="divider" />
            <div className="chips" style={{ marginBottom: '0.6rem' }}>
              <SkillChip skill="Python" />
              <SkillChip skill="Django" />
              <SkillChip skill="PostgreSQL" kind="related" title="Partial credit via MySQL" />
              <SkillChip skill="Docker" kind="gap" />
            </div>
            <p className="evidence small">“Built REST APIs with Django REST Framework serving 50k monthly users.”</p>
            <p className="evidence warn small">Docker: no evidence found in the resume. That is missing evidence, not proof the candidate lacks it.</p>
          </div>
        </div>
      </section>

      <section className="landing-points">
        <div><h3>Explained scores</h3><p className="muted">Skills, experience, projects and qualifications are weighted 50/25/15/10 by default, and you can change the weights per job.</p></div>
        <div><h3>Semantic matching</h3><p className="muted">“Postgres”, “psql” and “PostgreSQL” count as the same skill, and related experience earns partial credit.</p></div>
        <div><h3>Fair by design</h3><p className="muted">Names, contact details, age, gender and similar attributes are removed before scoring, and you can test that on any applicant.</p></div>
      </section>
    </div>
  );
}
