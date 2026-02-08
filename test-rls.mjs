import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const email = process.env.TEST_MISTER_EMAIL;
const password = process.env.TEST_MISTER_PASSWORD;

// metti qui due squad_id: una assegnata e una NON assegnata al mister
const SQUAD_ASSIGNED = Number(process.env.TEST_SQUAD_ASSIGNED);
const SQUAD_NOT_ASSIGNED = Number(process.env.TEST_SQUAD_NOT_ASSIGNED);

if (!url || !anon || !email || !password || !SQUAD_ASSIGNED || !SQUAD_NOT_ASSIGNED) {
  console.error("Missing env vars. Check NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and TEST_*");
  process.exit(1);
}

const supabase = createClient(url, anon);

async function main() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authErr) throw authErr;

  console.log("Logged in as:", authData.user.id);

  // 1) squads visible
  const { data: squads, error: squadsErr } = await supabase
    .from("squads")
    .select("id,name")
    .order("id");
  if (squadsErr) throw squadsErr;
  console.log("Visible squads:", squads);

  // 2) insert booking on NOT assigned squad (must FAIL)
  const start = new Date();
  const end = new Date(Date.now() + 60 * 60 * 1000);

  const { error: insBadErr } = await supabase.from("bookings").insert({
    squad_id: SQUAD_NOT_ASSIGNED,
    created_by: authData.user.id,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  });

  console.log("Insert NOT assigned squad error (expected):", insBadErr?.message ?? null);

  // 3) insert booking on assigned squad (must OK unless overlap constraint blocks)
  const { data: insOkData, error: insOkErr } = await supabase.from("bookings").insert({
    squad_id: SQUAD_ASSIGNED,
    created_by: authData.user.id,
    start_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    end_time: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  }).select("id,squad_id");

  console.log("Insert assigned squad OK data:", insOkData ?? null);
  console.log("Insert assigned squad error:", insOkErr?.message ?? null);

  await supabase.auth.signOut();
}

main().catch((e) => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
