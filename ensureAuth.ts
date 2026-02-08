// src/lib/ensureAuth.ts
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient"; // <-- cambia import se il tuo file si chiama diverso

type RoleLower = "admin" | "mister" | "bar_manager";

export type EnsureAuthResult = {
  user: User;
  session: Session;
  roleLower: RoleLower;
};

class EnsureAuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Attende una sessione "stabile" (INITIAL_SESSION / SIGNED_IN) con timeout
 * e poi legge il ruolo da `profiles`.
 * Mai stallo: se non arriva nulla entro timeout, lancia.
 */
export async function ensureAuth(opts?: {
  timeoutMs?: number;
}): Promise<EnsureAuthResult> {
  const timeoutMs = opts?.timeoutMs ?? 3500;

  // 1) prova veloce: spesso basta
  const first = await supabase.auth.getSession();
  if (first.data.session) {
    const session = first.data.session;
    const roleLower = await fetchRoleLower(session.user.id);
    return { user: session.user, session, roleLower };
  }

  // 2) fallback deterministico: aspetta evento auth iniziale con timeout
  const session = await waitForSession(timeoutMs);

  const roleLower = await fetchRoleLower(session.user.id);
  return { user: session.user, session, roleLower };
}

async function waitForSession(timeoutMs: number): Promise<Session> {
  return await new Promise<Session>((resolve, reject) => {
    const timer = setTimeout(() => {
      sub?.subscription.unsubscribe();
      reject(
        new EnsureAuthError(
          "AUTH_TIMEOUT",
          `Nessuna sessione ricevuta entro ${timeoutMs}ms`
        )
      );
    }, timeoutMs);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // session può arrivare su INITIAL_SESSION o SIGNED_IN
      if (session) {
        clearTimeout(timer);
        sub.subscription.unsubscribe();
        resolve(session);
      }
    });

    // In caso il listener si registri “dopo” l’evento, facciamo un ultimo check microtask
    // (copre edge-case rari con redirect/magic link)
    queueMicrotask(async () => {
      const again = await supabase.auth.getSession();
      if (again.data.session) {
        clearTimeout(timer);
        sub.subscription.unsubscribe();
        resolve(again.data.session);
      }
    });
  });
}

async function fetchRoleLower(userId: string): Promise<RoleLower> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (error) {
    throw new EnsureAuthError(
      "PROFILE_FETCH_FAILED",
      `Errore lettura profilo: ${error.message}`
    );
  }

  const role = String(data?.role ?? "").toLowerCase();

  if (role === "admin" || role === "mister" || role === "bar_manager") {
    return role;
  }

  throw new EnsureAuthError(
    "ROLE_INVALID",
    `Ruolo non valido o mancante in profiles.role: "${data?.role}"`
  );
}
