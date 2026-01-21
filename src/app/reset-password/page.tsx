"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function parseHashParams(hash: string) {
  const h = (hash || "").startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(h);
  return {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    type: params.get("type"),
    error: params.get("error"),
    error_description: params.get("error_description"),
  };
}

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    let unsub: { data: { subscription: { unsubscribe: () => void } } } | null = null;

    (async () => {
      setMsg(null);

      // 1) Se Supabase ha già una sessione, ok
      const s0 = await supabase.auth.getSession();
      if (s0.data.session) {
        setReady(true);
        return;
      }

      // 2) Prova a recuperare sessione dai parametri in hash (flow tipico recovery)
      //    Esempio: /reset-password#access_token=...&refresh_token=...&type=recovery
      const hp = parseHashParams(window.location.hash);
      if (hp.error) {
        setMsg(hp.error_description || "Errore nel link di reset.");
        setReady(false);
        return;
      }

      if (hp.type === "recovery" && hp.access_token && hp.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: hp.access_token,
          refresh_token: hp.refresh_token,
        });

        if (error) {
          setMsg("Link non valido o scaduto. Richiedi di nuovo il reset password.");
          setReady(false);
          return;
        }

        // pulizia hash per evitare riusi/bug
        window.history.replaceState({}, document.title, window.location.pathname);

        setReady(true);
        return;
      }

      // 3) Fallback: aspetta evento auth (se detectSessionInUrl è attivo ma lento)
      unsub = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session) setReady(true);
      });

      // 4) Ultimo fallback: se ancora nulla, mostra errore
      // (di solito significa che il redirect non ha portato i token in URL)
      setTimeout(async () => {
        const s1 = await supabase.auth.getSession();
        if (s1.data.session) {
          setReady(true);
        } else {
          setMsg("Link non valido o scaduto. Richiedi di nuovo il reset password.");
          setReady(false);
        }
      }, 600);
    })();

    return () => {
      try {
        unsub?.data.subscription.unsubscribe();
      } catch {}
    };
  }, []);

  async function setNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!ready) return;

    if (pw1.length < 8) return setMsg("La password deve essere lunga almeno 8 caratteri.");
    if (pw1 !== pw2) return setMsg("Le password non coincidono.");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    // opzionale: logout e vai al login, oppure vai al planner direttamente
    // io ti porto al login per chiarezza
    await supabase.auth.signOut();
    window.location.href = "/login";
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
          width: 460,
          maxWidth: "95vw",
          border: "2px solid #111827",
          borderRadius: 16,
          padding: 18,
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        }}
      >
        <h2 style={{ margin: 0, fontWeight: 900, color: "#111827" }}>Reset password</h2>
        <p style={{ marginTop: 8, marginBottom: 16, fontWeight: 800, color: "#374151" }}>
          Inserisci una nuova password (minimo 8 caratteri).
        </p>

        {msg && (
          <div style={{ marginBottom: 12, fontWeight: 900, color: "#991B1B" }}>
            {msg}
          </div>
        )}

        <form onSubmit={setNewPassword} style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 900, color: "#111827" }}>Nuova password</span>
            <input
              style={inputStyle}
              type="password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              autoComplete="new-password"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 900, color: "#111827" }}>Ripeti nuova password</span>
            <input
              style={inputStyle}
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              autoComplete="new-password"
            />
          </label>

          <button style={btnPrimary} type="submit" disabled={loading || !ready}>
            {loading ? "Aggiorno…" : "Aggiorna password"}
          </button>

          {!ready && (
            <button
              type="button"
              onClick={() => (window.location.href = "/login")}
              style={{ ...btnPrimary, background: "#F3F4F6", color: "#111827" }}
            >
              Torna al login
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
