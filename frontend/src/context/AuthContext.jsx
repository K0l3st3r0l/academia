import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('academia_token');
    const stored = localStorage.getItem('academia_user');
    if (token && stored) {
      setUser(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  const loginSuccess = (token, userData) => {
    localStorage.setItem('academia_token', token);
    localStorage.setItem('academia_user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('academia_token');
    localStorage.removeItem('academia_user');
    setUser(null);
  };

  const isTeacher = user?.roles?.some(r =>
    ['teacher', 'admin', 'docente', 'director', 'utp'].includes(r)
  );

  return (
    <AuthContext.Provider value={{ user, loading, loginSuccess, logout, isTeacher }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
