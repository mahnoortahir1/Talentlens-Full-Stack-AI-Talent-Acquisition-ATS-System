import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Landing from './pages/Landing.jsx';
import { Login, Register } from './pages/Auth.jsx';
import Notifications from './pages/Notifications.jsx';
import RecruiterDashboard from './pages/recruiter/Dashboard.jsx';
import Jobs from './pages/recruiter/Jobs.jsx';
import JobForm from './pages/recruiter/JobForm.jsx';
import JobApplicants from './pages/recruiter/JobApplicants.jsx';
import ApplicationReview from './pages/recruiter/ApplicationReview.jsx';
import Compare from './pages/recruiter/Compare.jsx';
import TalentSearch from './pages/recruiter/TalentSearch.jsx';
import Interviews from './pages/recruiter/Interviews.jsx';
import Duplicates from './pages/recruiter/Duplicates.jsx';
import CandidateHome from './pages/candidate/Home.jsx';
import Profile from './pages/candidate/Profile.jsx';
import BrowseJobs from './pages/candidate/BrowseJobs.jsx';
import JobDetail from './pages/candidate/JobDetail.jsx';
import MyApplications from './pages/candidate/MyApplications.jsx';

function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === 'recruiter' ? '/recruiter' : '/candidate'} replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  const home = user ? (user.role === 'recruiter' ? '/recruiter' : '/candidate') : null;

  return (
    <Routes>
      <Route path="/" element={home ? <Navigate to={home} replace /> : <Landing />} />
      <Route path="/login" element={home ? <Navigate to={home} replace /> : <Login />} />
      <Route path="/register" element={home ? <Navigate to={home} replace /> : <Register />} />

      <Route element={<RequireRole><Layout /></RequireRole>}>
        <Route path="/notifications" element={<Notifications />} />
      </Route>

      <Route path="/recruiter" element={<RequireRole role="recruiter"><Layout /></RequireRole>}>
        <Route index element={<RecruiterDashboard />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/new" element={<JobForm />} />
        <Route path="jobs/:id/edit" element={<JobForm />} />
        <Route path="jobs/:id" element={<JobApplicants />} />
        <Route path="applications/:id" element={<ApplicationReview />} />
        <Route path="compare" element={<Compare />} />
        <Route path="search" element={<TalentSearch />} />
        <Route path="interviews" element={<Interviews />} />
        <Route path="duplicates" element={<Duplicates />} />
      </Route>

      <Route path="/candidate" element={<RequireRole role="candidate"><Layout /></RequireRole>}>
        <Route index element={<CandidateHome />} />
        <Route path="profile" element={<Profile />} />
        <Route path="jobs" element={<BrowseJobs />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="applications" element={<MyApplications />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
