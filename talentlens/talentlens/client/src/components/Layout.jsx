import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Icon, Logo } from './ui.jsx';

const NAV = {
  recruiter: [
    { to: '/recruiter', label: 'Dashboard', icon: 'dashboard', end: true },
    { to: '/recruiter/jobs', label: 'Jobs', icon: 'jobs' },
    { to: '/recruiter/search', label: 'Talent search', icon: 'search' },
    { to: '/recruiter/interviews', label: 'Interviews', icon: 'calendar' },
    { to: '/recruiter/duplicates', label: 'Duplicates', icon: 'copy' },
    { to: '/notifications', label: 'Inbox', icon: 'inbox', inbox: true },
  ],
  candidate: [
    { to: '/candidate', label: 'Home', icon: 'dashboard', end: true },
    { to: '/candidate/profile', label: 'My resume', icon: 'file' },
    { to: '/candidate/jobs', label: 'Find jobs', icon: 'jobs' },
    { to: '/candidate/applications', label: 'Applications', icon: 'user' },
    { to: '/notifications', label: 'Inbox', icon: 'inbox', inbox: true },
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const items = NAV[user.role];

  useEffect(() => {
    const load = () => api.get('/notifications').then((d) => setUnread(d.unread)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const doLogout = async () => { await logout(); navigate('/'); };

  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to={items[0].to} className="brand"><Logo />TalentLens</NavLink>
        <nav className="nav" aria-label="Main">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}>
              <Icon name={i.icon} />{i.label}
              {i.inbox && unread > 0 && <span className="badge-count" aria-label={`${unread} unread`}>{unread}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="who">{user.name}</div>
          <div className="muted">{user.role === 'recruiter' ? `Recruiter · ${user.company || ''}` : 'Candidate'}</div>
          <button className="btn ghost small" style={{ marginTop: 8, paddingLeft: 0 }} onClick={doLogout}><Icon name="logout" size={16} />Sign out</button>
        </div>
      </aside>

      <header className="topbar">
        <NavLink to={items[0].to} className="brand"><Logo size={22} />TalentLens</NavLink>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <NavLink to="/notifications" className="btn ghost small" aria-label={`Inbox${unread ? `, ${unread} unread` : ''}`}><Icon name="inbox" size={18} />{unread > 0 && <span className="badge-count">{unread}</span>}</NavLink>
          <button className="btn ghost small" onClick={doLogout}>Sign out</button>
        </div>
      </header>

      <main className="main" id="main">
        <Outlet context={{ refreshUnread: () => api.get('/notifications').then((d) => setUnread(d.unread)).catch(() => {}) }} />
      </main>

      <nav className="tabbar" aria-label="Main">
        {items.filter((i) => !i.inbox).map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}><Icon name={i.icon} />{i.label}</NavLink>
        ))}
      </nav>
    </div>
  );
}
