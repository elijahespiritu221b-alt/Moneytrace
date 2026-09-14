import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { Toaster } from "sonner";
import LoginPage from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import RuleConfig from "./pages/RuleConfig";
import AuditLog from "./pages/AuditLog";
import ChangeRequests from "./pages/ChangeRequests";
import Offices from "./pages/Offices";
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
      <BrowserRouter>
        <Toaster theme="dark" position="top-right" richColors />
        <Routes>
          <Route path="/" element={<Navigate to="/public" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/public" element={<PublicPortal />} />
          <Route path="/public/project/:id" element={<PublicProjectDetail />} />
          <Route path="/console" element={<Protected><Dashboard /></Protected>} />
          <Route path="/console/offices" element={<Protected><Offices /></Protected>} />
          <Route path="/console/projects" element={<Protected><Projects /></Protected>} />
          <Route path="/console/projects/:id" element={<Protected><ProjectDetail /></Protected>} />
          <Route path="/console/requests" element={<Protected><ChangeRequests /></Protected>} />
          <Route path="/console/audit" element={<Protected><AuditLog /></Protected>} />
          <Route path="/console/rules" element={<Protected role="admin"><RuleConfig /></Protected>} />
          <Route path="*" element={<Navigate to="/public" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
