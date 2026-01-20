"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function sendMagicLink() {
    setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/planner` },
    });
    if (error) setMsg(error.message);
    else setMsg("Link inviato! Controlla la tua email.");
  }

  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Login</h1>

      <label style={{ display: "block", marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Email</div>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@esempio.it"
          style={{ width: "100%", border: "1px solid #ccc", borderRadius: 10, padding: 10 }}
        />
      </label>

      <button
        onClick={sendMagicLink}
        style={{ marginTop: 12, width: "100%", borderRadius: 10, padding: 10, border: "1px solid #000", background: "#000", color: "#fff", fontWeight: 800 }}
      >
        Invia magic link
      </button>

      {msg && <div style={{ marginTop: 12, fontWeight: 700 }}>{msg}</div>}
    </div>
  );
}
