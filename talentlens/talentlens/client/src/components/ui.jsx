import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export const STATUS_LABEL = {
  submitted: 'Submitted',
  parsed: 'Parsed',
  ai_assessed: 'AI assessment ready',
  recruiter_review: 'In review',
  under_review: 'Under review',
  shortlisted: 'Shortlisted',
  rejected: 'Not progressed',
  interview: 'Interview',
  selected: 'Selected',
};

export function StatusPill({ status }) {
  return <span className={`pill st-${status}`}>{STATUS_LABEL[status] || status}</span>;
}

export const fmtDate = (d, opts = {}) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', ...opts }) : '');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export function Loading({ label = 'Loading' }) {
  return <div className="loading" role="status"><div className="spinner" aria-hidden="true" />{label}…</div>;
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p style={{ margin: '0 auto 1rem' }}>{children}</p>}
      {action}
    </div>
  );
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  return <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Field({ label, hint, error, id, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector('input,textarea,select,button')?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="panel-head"><h2>{title}</h2><button className="btn ghost small" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

/** Load data with loading/error state and a reload function. */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return fn().then((data) => setState({ data, error: null, loading: false })).catch((error) => setState({ data: null, error, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data: typeof data === 'function' ? data(s.data) : data })) };
}

const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { id, message, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-host" aria-live="polite">{items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>)}</div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

/** Minimal stroke icons. */
const PATHS = {
  dashboard: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z',
  jobs: 'M4 7h16v12H4zM9 7V4h6v3',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5',
  calendar: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  inbox: 'M4 13l2-8h12l2 8v6H4zM4 13h5l1 2h4l1-2h5',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5',
  logout: 'M15 4h4v16h-4M10 17l5-5-5-5M15 12H3',
  compare: 'M8 4v16M16 4v16M4 8h4M16 16h4',
};
export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Logo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="14" cy="14" r="9" fill="#F6E2E9" stroke="#4F6B4D" strokeWidth="3.5" />
      <path d="M10 14.5l3 3 5-6" fill="none" stroke="#4F6B4D" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 21l7 7" stroke="#4F6B4D" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
