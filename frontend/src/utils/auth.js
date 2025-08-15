export function isTokenValid(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload?.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
export function getUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); }
  catch { return null; }
}
export function logoutClient() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}
