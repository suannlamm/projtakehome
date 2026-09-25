"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function LoginPage() {
  const router = useRouter();
  const [supabase] = useState(() =>
    createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!),
  );
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      setBusy(false);
      if (error) return setMessage(error.message);
      // No session means Supabase is waiting for the user to confirm their email.
      if (!data.session) return setMessage("Check your email for a confirmation link.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setMessage(error.message);
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-bold">{mode === "signin" ? "Sign in" : "Create an account"}</h1>

      <button
        className="btn-ghost w-full py-2"
        onClick={() =>
          supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } })
        }
      >
        Continue with Google
      </button>

      <div className="text-center text-xs text-zinc-500">or</div>

      <form onSubmit={submit} className="space-y-3">
        <input className="input" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          className="input"
          type="password"
          required
          minLength={6}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {message && <p className="text-sm text-zinc-300">{message}</p>}
        <button className="btn w-full py-2" disabled={busy}>
          {mode === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-400">
        {mode === "signin" ? "No account?" : "Already have one?"}{" "}
        <button className="text-amber-400" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Sign up" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
