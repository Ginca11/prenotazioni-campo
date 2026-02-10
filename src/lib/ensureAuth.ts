import { supabase } from "@/lib/supabaseClient";

export class EnsureAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnsureAuthError";
  }
}

function redirectToLogin() {
  if (typeof window !== "undefined") {
    // evita loop se sei già su /login
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }
}

export async function ensureAuth(timeoutMs = 3500) {
  // 1) prova subito: se la sessione è già disponibile, non aspettare eventi
  const { data: s1, error: e1 } = await supabase.auth.getSession();

  if (e1) {
    redirectToLogin();
    throw e1;
  }

  if (s1.session?.user) return s1.session;

  // 2) altrimenti aspetta un auth change (login/refresh)
  return await new Promise((resolve, reject) => {
    let settled = false;

    const finishReject = (err: Error) => {
      if (settled) return;
      settled = true;
      sub?.unsubscribe?.();
      redirectToLogin();
      reject(err);
    };

    const finishResolve = (session: any) => {
      if (settled) return;
      settled = true;
      sub?.unsubscribe?.();
      resolve(session);
    };

    const t = setTimeout(() => {
      finishReject(new EnsureAuthError(`Nessuna sessione ricevuta entro ${timeoutMs}ms`));
    }, timeoutMs);

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // se esci o fallisce il refresh → login
      if (event === "SIGNED_OUT" || event === "TOKEN_REFRESH_FAILED") {
        clearTimeout(t);
        finishReject(new EnsureAuthError(`Evento auth: ${event}`));
        return;
      }

      if (session?.user) {
        clearTimeout(t);
        finishResolve(session);
      }
    });

    const sub = data.subscription;
  });
}
