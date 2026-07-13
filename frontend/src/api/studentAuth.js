const TOKEN_KEY = 'academia_student_token';
const USER_KEY = 'academia_student_user';

export function getStudentToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStudentUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function studentLoginSuccess(token, student) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(student));
}

export function studentLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
