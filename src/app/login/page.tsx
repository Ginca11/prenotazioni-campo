"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    padding: "12px 12px",
    border: "2px solid #111827",
    borderRadius: 12,
    background: "#fff",
    color: "#111827",
    fontWeight: 800,
    outline: "none",
    width: "100%",
  };

  const btnPrimary: React.CSSProperties = {
    background: "#111827",
    color: "#fff",
    border: "2px solid #111827",
    borderRadius: 12,
    padding: "12px 14px",
    fontWeight: 900,
    width: "100%",
  };

  const btnGhost: React.CSSProperties = {
    background: "#F3F4F6",
    color: "#111827",
    border: "2px solid #111827",
    borderRadius: 12,
    padding: "12px 14px",
    fontWeight: 900,
    width: "100%",
  };

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    window.location.href = "/planner";
  }

  async function forgotPassword() {
    setMsg(null);
    setLoading(true);

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Ti ho inviato una mail per reimpostare la password.");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "#fff",
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: "95vw",
          border: "2px solid #111827",
          borderRadius: 16,
          padding: 18,
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        }}
      >
        <h2 style={{ margin: 0, fontWeight: 900, color: "#111827" }}>Login</h2>
        <p style={{ marginTop: 8, marginBottom: 16, fontWeight: 800, color: "#374151" }}>
          Accesso riservato mister / admin
        </p>

        <form onSubmit={doLogin} style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 900, color: "#111827" }}>Email</span>
            <input
              style={inputStyle}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 900, color: "#111827" }}>Password</span>
            <input
              style={inputStyle}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </label>

          <button style={btnPrimary} type="submit" disabled={loading}>
            {loading ? "Accesso…" : "Entra"}
          </button>

          <button
            style={btnGhost}
            type="button"
            disabled={loading || !email.trim()}
            onClick={forgotPassword}
          >
            Password dimenticata
          </button>

          {msg && (
            <div style={{ marginTop: 6, fontWeight: 900, color: msg.includes("inviato") ? "#065F46" : "#991B1B" }}>
              {msg}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
