import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { getStudentToken } from './api/studentAuth';
import WelcomePage from './pages/WelcomePage';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherGame from './pages/TeacherGame';
import ProjectorView from './pages/ProjectorView';
import StudentJoin from './pages/StudentJoin';
import StudentGame from './pages/StudentGame';
import QuestionBank from './pages/QuestionBank';
import AlumnoHome from './pages/AlumnoHome';
import CharacterEditor from './pages/CharacterEditor';
import PetPage from './pages/PetPage';
import WorldMap from './pages/WorldMap';
import LevelPlay from './pages/LevelPlay';
import TeacherCopihues from './pages/TeacherCopihues';
import CreateStudentPassword from './pages/CreateStudentPassword';

function ProtectedTeacher({ children }) {
  const { user, loading, isTeacher } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-white">Cargando...</div>;
  if (!user) return <Navigate to="/?modo=profesor" replace />;
  if (!isTeacher) return <Navigate to="/" replace />;
  return children;
}

function ProtectedStudent({ children }) {
  if (!getStudentToken()) return <Navigate to="/?modo=alumno" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          {/* Old entry points, kept so printed PINs and bookmarks still land somewhere useful */}
          <Route path="/login" element={<Navigate to="/?modo=profesor" replace />} />
          <Route path="/alumno/login" element={<Navigate to="/?modo=alumno" replace />} />
          <Route path="/join" element={<Navigate to="/?modo=clase" replace />} />
          <Route path="/join/:code" element={<StudentJoin />} />
          <Route path="/play/:code" element={<StudentGame />} />
          <Route path="/alumno/crear-clave" element={<CreateStudentPassword />} />
          <Route
            path="/alumno"
            element={<ProtectedStudent><AlumnoHome /></ProtectedStudent>}
          />
          <Route
            path="/alumno/personaje"
            element={<ProtectedStudent><CharacterEditor /></ProtectedStudent>}
          />
          <Route
            path="/alumno/companero"
            element={<ProtectedStudent><PetPage /></ProtectedStudent>}
          />
          <Route
            path="/alumno/mundo/:subject"
            element={<ProtectedStudent><WorldMap /></ProtectedStudent>}
          />
          <Route
            path="/alumno/mundo/:subject/:key"
            element={<ProtectedStudent><LevelPlay /></ProtectedStudent>}
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
            path="/teacher/copihues"
            element={<ProtectedTeacher><TeacherCopihues /></ProtectedTeacher>}
          />
          <Route
            path="/teacher/game/:code"
            element={<ProtectedTeacher><TeacherGame /></ProtectedTeacher>}
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
