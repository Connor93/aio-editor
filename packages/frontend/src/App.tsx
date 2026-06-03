import { AppShell } from "./AppShell";
import { Login } from "./auth/Login";
import { useAuth } from "./auth/useAuth";

export function App() {
  const { token, isAuthenticated, expiresAt, login, logout } = useAuth();

  if (!isAuthenticated || !token) {
    return <Login onLogin={login} />;
  }

  return <AppShell token={token} expiresAt={expiresAt} onLogout={logout} />;
}
