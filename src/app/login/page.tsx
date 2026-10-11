"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(error ? "error" : "sent");
  }

  return (
    <div className="mx-auto mt-12 max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">Giriş yap</h1>
      {status === "sent" ? (
        <p className="rounded-xl bg-ok-bg p-4 text-ok">E-postana bir giriş bağlantısı gönderdik. 📬</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input type="email" required className="input" placeholder="e-posta adresin" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-primary w-full" disabled={status === "sending"}>
            {status === "sending" ? "Gönderiliyor…" : "Giriş bağlantısı gönder"}
          </button>
          {status === "error" && <p className="text-sm text-bad">Bir sorun oldu, tekrar dene.</p>}
        </form>
      )}
    </div>
  );
}
