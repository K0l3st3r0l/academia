import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { getStudentToken } from './api/studentAuth';
import LoginPage from './pages/LoginPage';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherGame from './pages/TeacherGame';
import ProjectorView from './pages/ProjectorView';
import StudentJoin from './pages/StudentJoin';
import StudentGame from './pages/StudentGame';
import QuestionBank from './pages/QuestionBank';
import StudentLogin from './pages/StudentLogin';
import AlumnoHome from './pages/AlumnoHome';
import CharacterEditor from './pages/CharacterEditor';

function ProtectedTeacher({ children }) {
  const { user, loading, isTeacher } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-white">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isTeacher) return <Navigate to="/join" replace />;
  return children;
}

function ProtectedStudent({ children }) {
  if (!getStudentToken()) return <Navigate to="/alumno/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/join" element={<StudentJoin />} />
          <Route path="/join/:code" element={<StudentJoin />} />
          <Route path="/play/:code" element={<StudentGame />} />
          <Route path="/alumno/login" element={<StudentLogin />} />
          <Route
            path="/alumno"
            element={<ProtectedStudent><AlumnoHome /></ProtectedStudent>}
          />
          <Route
            path="/alumno/personaje"
            element={<ProtectedStudent><CharacterEditor /></ProtectedStudent>}
          />
          <Route path="/projector/:code" element={<ProjectorView />} />
          <Route
            path="/teacher"
            element={<ProtectedTeacher><TeacherDashboard /></ProtectedTeacher>}
          />
          <Route
            path="/teacher/questions"
            element={<ProtectedTeacher><QuestionBank /></ProtectedTeacher>}
          />
          <Route
            path="/teacher/game/:code"
            element={<ProtectedTeacher><TeacherGame /></ProtectedTeacher>}
          />
          <Route path="/" element={<Navigate to="/join" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
