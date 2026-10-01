"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { callApi } from "@/components/actions";

// Settings-only widgets. Email and password are changed with Supabase Auth directly, as the signed-in user.

const supabase = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export function EmailForm({ current }: { current: string }) {
  const [email, setEmail] = useState(current);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const { error } = await supabase().auth.updateUser({ email }, { emailRedirectTo: `${location.origin}/auth/callback` });
        setBusy(false);
        setMessage(error?.message ?? "Check your email to confirm the change.");
      }}
    >
      <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      {message && <p className="text-sm text-zinc-300">{message}</p>}
      <button className="btn" disabled={busy || email === current}>
        Change email
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password !== confirm) return setMessage("Passwords don't match.");
        setBusy(true);
        const { error } = await supabase().auth.updateUser({ password });
        setBusy(false);
        setMessage(error?.message ?? "Password updated.");
        if (error) return;
        setPassword("");
        setConfirm("");
      }}
    >
      <input
        className="input"
        type="password"
        required
        minLength={6}
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <input
        className="input"
        type="password"
        required
        placeholder="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {message && <p className="text-sm text-zinc-300">{message}</p>}
      <button className="btn" disabled={busy}>
        Change password
      </button>
    </form>
  );
}

type Field = "isPrivate" | "tasteUsesWatched" | "tasteUsesWatchlist";

// A tick box that saves as soon as it changes.
export function SettingToggle({ field, checked, label, hint }: { field: Field; checked: boolean; label: string; hint: string }) {
  const router = useRouter();
  const [value, setValue] = useState(checked);
  const [error, setError] = useState<string | null>(null);

  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        className="mt-1"
        checked={value}
        onChange={async (e) => {
          const next = e.target.checked;
          setValue(next);
          const err = await callApi("PATCH", "/api/profile", { [field]: next });
          setError(err);
          if (err) setValue(!next);
          else router.refresh();
        }}
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-sm text-zinc-400">{hint}</span>
        {error && <span className="block text-sm text-red-400">{error}</span>}
      </span>
    </label>
  );
}

export function DeleteAccount({ username }: { username: string }) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (prompt(`This permanently deletes your account, lists, ratings and follows. Type ${username} to confirm.`) !== username) return;
    setBusy(true);
    const err = await callApi("DELETE", "/api/profile");
    if (err) {
      setBusy(false);
      return alert(err);
    }
    await supabase().auth.signOut({ scope: "local" });
    location.assign("/login");
  }

  return (
    <button className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-500 disabled:opacity-50" disabled={busy} onClick={remove}>
      Delete account
    </button>
  );
}
