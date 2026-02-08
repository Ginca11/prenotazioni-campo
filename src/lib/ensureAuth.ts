import { supabase } from "@/lib/supabaseClient";

export class EnsureAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnsureAuthError";
  }
}

export async function ensureAuth(timeoutMs = 3500) {
  // 1) prova subito: se la sessione è già disponibile, non aspettare eventi
  const { data: s1, error: e1 } = await supabase.auth.getSession();
  if (e1) throw e1;
  if (s1.session) return s1.session;

  // 2) altrimenti aspetta un auth change (login/refresh)
  return await new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      sub?.unsubscribe?.();
      reject(new EnsureAuthError(`Nessuna sessione ricevuta entro ${timeoutMs}ms`));
    }, timeoutMs);

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        clearTimeout(t);
        data.subscription.unsubscribe();
        resolve(session);
      }
    });

    const sub = data.subscription;
  });
}
