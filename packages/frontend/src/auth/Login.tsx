import { useState, type FormEvent } from "react";

interface AuthSuccess {
  token: string;
  expiresAt: string;
}

interface AuthError {
  error: string;
}

interface LoginProps {
  onLogin: (token: string, expiresAt: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const body = (await res.json()) as AuthSuccess;
        onLogin(body.token, body.expiresAt);
        return;
      }

      let message = `auth failed (${res.status})`;
      try {
        const body = (await res.json()) as AuthError;
        if (body.error) message = body.error;
      } catch {
        // non-JSON response
      }
      setError(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl"
      >
        <div>
          <h1 className="text-xl font-semibold">AIO Editor</h1>
          <p className="text-sm text-slate-400">
            Log in with a REOSERV admin account.
          </p>
        </div>

        <label className="block">
          <span className="text-sm text-slate-300">Username</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            required
          />
        </label>

        {error && (
          <p className="rounded-md border border-red-900/50 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
