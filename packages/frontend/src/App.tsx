import { AppShell } from "./AppShell";
import { Login } from "./auth/Login";
import { useAuth } from "./auth/useAuth";

export function App() {
  const { isAuthenticated, expiresAt, login, logout } = useAuth();

  if (!isAuthenticated) {
    return <Login onLogin={login} />;
  }

  return <AppShell expiresAt={expiresAt} onLogout={logout} />;
}
