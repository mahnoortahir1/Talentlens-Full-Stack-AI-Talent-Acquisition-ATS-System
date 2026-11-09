import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Alert, Field, Logo } from '../components/ui.jsx';

function AuthSide() {
  return (
    <aside className="auth-side">
      <Link to="/" className="brand"><Logo />TalentLens</Link>
      <blockquote>Every score comes with the resume lines behind it.</blockquote>
      <p className="small">Demo accounts after seeding: recruiter@demo.com / Demo@1234</p>
    </aside>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const u = await login(form.email, form.password);
      navigate(u.role === 'recruiter' ? '/recruiter' : '/candidate');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <AuthSide />
      <div className="auth-form">
        <form onSubmit={submit} noValidate>
          <h1>Sign in</h1>
          <Alert>{error}</Alert>
          <Field label="Email" id="email"><input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Password" id="password"><input id="password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <button className="btn block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="small" style={{ marginTop: '1rem' }}>No account yet? <Link to="/register">Create one</Link></p>
        </form>
      </div>
    </div>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: params.get('role') === 'recruiter' ? 'recruiter' : 'candidate', company: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const check = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email';
    if (form.password.length < 8 || !/\d/.test(form.password) || !/[A-Za-z]/.test(form.password)) e.password = 'Use at least 8 characters with a letter and a number';
    if (form.role === 'recruiter' && !form.company.trim()) e.company = 'Enter your company name';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!check()) return;
    setBusy(true); setError('');
    try {
      const u = await register(form);
      navigate(u.role === 'recruiter' ? '/recruiter' : '/candidate/profile');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <AuthSide />
      <div className="auth-form">
        <form onSubmit={submit} noValidate>
          <h1>Create your account</h1>
          <Alert>{error}</Alert>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>I am</legend>
            <div className="role-pick">
              <label><input type="radio" name="role" value="candidate" checked={form.role === 'candidate'} onChange={set('role')} className="sr-only" /><b>Looking for a job</b><span className="small muted">Upload a resume and apply</span></label>
              <label><input type="radio" name="role" value="recruiter" checked={form.role === 'recruiter'} onChange={set('role')} className="sr-only" /><b>Hiring</b><span className="small muted">Post jobs and review applicants</span></label>
            </div>
          </fieldset>
          <Field label="Full name" id="name" error={errors.name}><input id="name" autoComplete="name" value={form.name} onChange={set('name')} /></Field>
          <Field label="Email" id="email" error={errors.email}><input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} /></Field>
          {form.role === 'recruiter' && <Field label="Company" id="company" error={errors.company}><input id="company" autoComplete="organization" value={form.company} onChange={set('company')} /></Field>}
          <Field label="Password" id="password" hint="At least 8 characters, with a letter and a number" error={errors.password}><input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>
          <button className="btn block" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
          <p className="small" style={{ marginTop: '1rem' }}>Already registered? <Link to="/login">Sign in</Link></p>
        </form>
      </div>
    </div>
  );
}
