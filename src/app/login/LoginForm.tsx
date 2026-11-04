"use client";

import { Loader2, Lock } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { safeNextPath } from "@/lib/auth";
import { Button } from "@/components/ui";

export function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: { password } });
      // Full navigation so server components re-render with the new session cookie.
      window.location.assign(safeNextPath(params.get("next")));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-[70vh] place-items-center">
      <form onSubmit={submit} className="card w-full max-w-sm p-6" aria-labelledby="login-title">
        <span className="brand-gradient mx-auto grid size-12 place-items-center rounded-2xl">
          <Lock className="size-5 text-white" aria-hidden />
        </span>
        <h1 id="login-title" className="mt-4 text-center text-xl font-bold">
          Sign in to CloudPlay
        </h1>
        <p className="mt-1 text-center text-sm text-muted">Enter the password set on this server.</p>
        <label htmlFor="password" className="sr-only">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="mt-5 h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px] focus:border-accent focus:outline-none"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" className="mt-4 h-12 w-full" disabled={!password || busy}>
          {busy && <Loader2 className="size-4 animate-spin" />} Sign in
        </Button>
      </form>
    </div>
  );
}
