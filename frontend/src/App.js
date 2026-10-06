import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { CitizenProvider } from "./lib/citizen-context";
import CitizenAuth from "./pages/CitizenAuth";
import { Toaster } from "sonner";
import LoginPage from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import RuleConfig from "./pages/RuleConfig";
import AuditLog from "./pages/AuditLog";
import ChangeRequests from "./pages/ChangeRequests";
import Offices from "./pages/Offices";
import MonitoringUnits from "./pages/MonitoringUnits";
import Complaints from "./pages/Complaints";
import EntityTraceability from "./pages/EntityTraceability";
import EntityDetail from "./pages/EntityDetail";
import ProjectMapPage from "./pages/ProjectMapPage";
import SecurityAlerts from "./pages/SecurityAlerts";
import Citizens from "./pages/Citizens";
import PublicPortal from "./pages/PublicPortal";
import PublicProjectDetail from "./pages/PublicProjectDetail";

function Protected({ children, role }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="min-h-screen bg-[#0B0F17] text-slate-400 grid place-items-center">Checking session…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/console" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <CitizenProvider>
      <BrowserRouter>
        <Toaster theme="dark" position="top-right" richColors />
        <Routes>
          <Route path="/" element={<Navigate to="/public" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/public" element={<PublicPortal />} />
          <Route path="/public/project/:id" element={<PublicProjectDetail />} />
          <Route path="/public/account" element={<CitizenAuth />} />
          <Route path="/console" element={<Protected><Dashboard /></Protected>} />
          <Route path="/console/offices" element={<Protected><Offices /></Protected>} />
          <Route path="/console/offices/:code/units" element={<Protected><MonitoringUnits /></Protected>} />
          <Route path="/console/projects" element={<Protected><Projects /></Protected>} />
          <Route path="/console/projects/:id" element={<Protected><ProjectDetail /></Protected>} />
          <Route path="/console/requests" element={<Protected><ChangeRequests /></Protected>} />
          <Route path="/console/ai-review" element={<Protected><ChangeRequests /></Protected>} />
          <Route path="/console/verification" element={<Protected><ChangeRequests /></Protected>} />
          <Route path="/console/ai-exceptions" element={<Protected><ChangeRequests /></Protected>} />
          <Route path="/console/monitoring/financial" element={<Protected><Projects /></Protected>} />
          <Route path="/console/monitoring/payment" element={<Protected><Projects /></Protected>} />
          <Route path="/console/monitoring/schedule" element={<Protected><Projects /></Protected>} />
          <Route path="/console/monitoring/delayed" element={<Protected><Projects /></Protected>} />
          <Route path="/console/analysis/anomaly" element={<Protected><Projects /></Protected>} />
          <Route path="/console/analysis/map" element={<Protected><ProjectMapPage /></Protected>} />
          <Route path="/console/analysis/entities" element={<Protected><EntityTraceability /></Protected>} />
          <Route path="/console/entities/:name" element={<Protected><EntityDetail /></Protected>} />
          <Route path="/console/complaints" element={<Protected><Complaints /></Protected>} />
          <Route path="/console/audit" element={<Protected><AuditLog /></Protected>} />
          <Route path="/console/rules" element={<Protected role="admin"><RuleConfig /></Protected>} />
          <Route path="/console/security" element={<Protected role="admin"><SecurityAlerts /></Protected>} />
          <Route path="/console/citizens" element={<Protected role="admin"><Citizens /></Protected>} />
          <Route path="*" element={<Navigate to="/public" replace />} />
        </Routes>
      </BrowserRouter>
      </CitizenProvider>
    </AuthProvider>
  );
}

export default App;
