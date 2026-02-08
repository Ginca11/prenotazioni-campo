"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "@/lib/supabaseClient";

/* =======================
   AUTH WAIT (come prima)
======================= */

async function waitForSession(maxMs = 8000): Promise<boolean> {
  const start = Date.now();
  const first = await supabase.auth.getSession();
  if (first.data.session) return true;

  return await new Promise<boolean>((resolve) => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        sub.subscription.unsubscribe();
        resolve(true);
      }
    });

    const t = setInterval(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        clearInterval(t);
        sub.subscription.unsubscribe();
        resolve(true);
      } else if (Date.now() - start > maxMs) {
        clearInterval(t);
        sub.subscription.unsubscribe();
        resolve(false);
      }
    }, 250);
  });
}

/* =======================
   UI TYPES
======================= */

type FieldResource = { id: number; label: string };

type TimelineBooking = {
  id: number;
  resourceId: number;
  start: string; // ISO
  end: string; // ISO
  colorKey: string; // nome squadra/categoria
};

/* =======================
   PURE HELPERS
======================= */

function colorForSquadLike(name: string) {
  // stesso stile del tuo planner giornaliero (hash su palette)
  const palette = ["#DBEAFE", "#D1FAE5", "#FFEDD5", "#FCE7F3", "#CFFAFE", "#EDE9FE", "#FEF3C7"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function isoDateKey(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getWeekMonday(anchor: dayjs.Dayjs) {
  // Monday-based week without plugins
  const dow = anchor.day(); // 0 dom ... 6 sab
  return dow === 0 ? anchor.subtract(6, "day").startOf("day") : anchor.subtract(dow - 1, "day").startOf("day");
}

function formatDayName(d: dayjs.Dayjs) {
  return d.toDate().toLocaleDateString("it-IT", { weekday: "short" }).toUpperCase();
}
function formatDayDate(d: dayjs.Dayjs) {
  return d.toDate().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

/* =======================
   PAGE
======================= */

export default function WeeklyPage() {
  // focus: CAMPI
  const [fields, setFields] = useState<FieldResource[]>([]);
  const [bookings, setBookings] = useState<TimelineBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ancoriamo a oggi (poi aggiungiamo controlli avanti/indietro se vuoi, solo UI)
  const anchor = useMemo(() => dayjs(), []);
  const monday = useMemo(() => getWeekMonday(anchor), [anchor]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => monday.add(i, "day")), [monday]);

  // fascia oraria “ampia” per coprire tutto (weekend incluso)
  const startHour = 9;
  const endHour = 21;
  const stepMin = 10;
  const rowHeight = 16;
  const timeColW = 72;
  const dayColMinW = 150;

  const slots = useMemo(() => {
    const out: { label: string }[] = [];
    const totalMin = (endHour - startHour) * 60;
    for (let m = 0; m < totalMin; m += stepMin) {
      const hh = Math.floor((startHour * 60 + m) / 60);
      const mm = (startHour * 60 + m) % 60;
      out.push({ label: mm === 0 ? `${String(hh).padStart(2, "0")}:00` : "" });
    }
    return out;
  }, [startHour, endHour, stepMin]);

  const timelineHeight = slots.length * rowHeight;

  useEffect(() => {
    async function loadWeek() {
      setLoading(true);
      setErr(null);

      try {
        const ok = await waitForSession(8000);
        if (!ok) {
          setErr("Sessione non trovata. Apri prima /planner (login) e poi torna qui.");
          setFields([]);
          setBookings([]);
          return;
        }

        // 1) Carico risorse e filtro SOLO CAMPI
        const r = await supabase.from("resources").select("id,name,type").order("id");
        if (r.error) throw r.error;

        const all = r.data ?? [];
        const onlyFields = all.filter((x: any) => {
          const name = String(x.name ?? "").toLowerCase();
          const type = String(x.type ?? "").toUpperCase();
          return type.includes("FIELD") || name.includes("campo") || name.includes("campetto");
        });

        const mappedFields: FieldResource[] = onlyFields.map((x: any) => ({ id: x.id, label: x.name }));
        setFields(mappedFields);

        const fieldIds = new Set(mappedFields.map((x) => x.id));

        // 2) Prenotazioni della settimana (booking_resources)
        const startIso = monday.toISOString();
        const endIso = monday.add(7, "day").toISOString();

        const br = await supabase
          .from("booking_resources")
          .select("booking_id,resource_id,start_at,end_at,booking:bookings(id,squad_id)")
          .gte("start_at", startIso)
          .lt("start_at", endIso);

        if (br.error) throw br.error;

        const brData = (br.data ?? []).filter((x: any) => fieldIds.has(x.resource_id));

        // 3) Squadre per colore
        const squadIds = Array.from(new Set(brData.map((x: any) => x.booking?.squad_id).filter(Boolean)));
        let squadsById = new Map<number, string>();
        if (squadIds.length) {
          const s = await supabase.from("squads").select("id,name").in("id", squadIds);
          if (s.error) throw s.error;
          squadsById = new Map((s.data ?? []).map((q: any) => [q.id, q.name]));
        }

        const mappedBookings: TimelineBooking[] = brData.map((x: any) => ({
          id: x.booking_id,
          resourceId: x.resource_id,
          start: x.start_at,
          end: x.end_at,
          colorKey: squadsById.get(x.booking?.squad_id) ?? `#${x.booking_id}`,
        }));

        setBookings(mappedBookings);
      } catch (e: any) {
        console.error(e);
        setErr(e?.message ?? "Errore caricamento settimana");
        setFields([]);
        setBookings([]);
      } finally {
        setLoading(false);
      }
    }

    loadWeek();
  }, [monday]);

  // indicizza bookings per resourceId + dayKey
  const bookingsByResDay = useMemo(() => {
    const m = new Map<string, TimelineBooking[]>();
    for (const b of bookings) {
      const dayKey = dayjs(b.start).format("YYYY-MM-DD");
      const k = `${b.resourceId}__${dayKey}`;
      const arr = m.get(k) ?? [];
      arr.push(b);
      m.set(k, arr);
    }
    for (const [k, arr] of m.entries()) {
      arr.sort((a, c) => +new Date(a.start) - +new Date(c.start));
      m.set(k, arr);
    }
    return m;
  }, [bookings]);

  function blockTopHeight(b: TimelineBooking) {
    const s = dayjs(b.start);
    const e = dayjs(b.end);
    const dayStart = s.startOf("day").add(startHour, "hour");

    const topMin = Math.max(0, s.diff(dayStart, "minute"));
    const durMin = Math.max(stepMin, e.diff(s, "minute"));

    const top = Math.floor(topMin / stepMin) * rowHeight;
    const height = Math.ceil(durMin / stepMin) * rowHeight;

    return { top, height };
  }

  const todayKey = dayjs().format("YYYY-MM-DD");

  return (
    <div style={{ padding: 16, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontWeight: 900 }}>Planner settimanale · Campi</h2>
        <div style={{ fontWeight: 900, opacity: 0.85 }}>
          {monday.format("DD/MM")} – {monday.add(6, "day").format("DD/MM")}
        </div>
      </div>

      <div style={{ marginTop: 8, fontWeight: 800, fontSize: 13, opacity: 0.9 }}>
        {loading ? "Caricamento…" : ""}
        {err ? ` · ${err}` : ""}
        {!loading && !err ? ` · Campi: ${fields.length} · Prenotazioni: ${bookings.length}` : ""}
      </div>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        {fields.map((field) => {
          return (
            <div key={field.id} style={S.card}>
              <div style={S.cardHeader}>
                <div style={{ fontWeight: 1000 }}>{field.label}</div>
              </div>

              <div style={{ overflowX: "auto" }}>
                {/* header giorni */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `${timeColW}px repeat(7, minmax(${dayColMinW}px, 1fr))`,
                    borderBottom: "2px solid #111827",
                    minWidth: timeColW + 7 * dayColMinW,
                    background: "#fff",
                  }}
                >
                  <div style={{ background: "#E5E7EB" }} />
                  {days.map((d) => {
                    const k = d.format("YYYY-MM-DD");
                    const isToday = k === todayKey;
                    return (
                      <a
                        key={k}
                        href={`/planner?date=${k}`}
                        style={{
                          ...S.dayHeader,
                          ...(isToday ? S.todayHeader : null),
                          textDecoration: "none",
                          color: "#111827",
                        }}
                      >
                        <div style={S.dayName}>{formatDayName(d)}</div>
                        <div style={S.dayDate}>{formatDayDate(d)}</div>
                      </a>
                    );
                  })}
                </div>

                {/* body */}
                <div style={{ display: "flex", minWidth: timeColW + 7 * dayColMinW }}>
                  {/* colonna orari */}
                  <div
                    style={{
                      width: timeColW,
                      background: "#E5E7EB",
                      borderRight: "2px solid #111827",
                      height: timelineHeight,
                    }}
                  >
                    {slots.map((s, i) => (
                      <div
                        key={i}
                        style={{
                          height: rowHeight,
                          paddingLeft: 10,
                          display: "flex",
                          alignItems: "center",
                          fontSize: 12,
                          fontWeight: 900,
                          borderBottom: "1px solid rgba(17,24,39,0.25)",
                        }}
                      >
                        {s.label}
                      </div>
                    ))}
                  </div>

                  {/* 7 colonne giorni */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(7, minmax(${dayColMinW}px, 1fr))`,
                      flex: 1,
                    }}
                  >
                    {days.map((d) => {
                      const dayKey = d.format("YYYY-MM-DD");
                      const isToday = dayKey === todayKey;
                      const k = `${field.id}__${dayKey}`;
                      const list = bookingsByResDay.get(k) ?? [];

                      return (
                        <div
                          key={dayKey}
                          style={{
                            position: "relative",
                            height: timelineHeight,
                            borderRight: "1px solid rgba(17,24,39,0.12)",
                            ...(isToday ? S.todayCol : null),
                          }}
                          onDoubleClick={() => (window.location.href = `/planner?date=${dayKey}`)}
                          title="Doppio click per aprire il giorno"
                        >
                          {/* righe grid */}
                          {slots.map((_, i) => (
                            <div
                              key={i}
                              style={{
                                height: rowHeight,
                                borderBottom: "1px solid rgba(17,24,39,0.12)",
                              }}
                            />
                          ))}

                          {/* blocchi */}
                          {list.map((b) => {
                            const { top, height } = blockTopHeight(b);
                            return (
                              <div
                                key={`${b.id}-${b.start}`}
                                style={{
                                  position: "absolute",
                                  left: 6,
                                  right: 6,
                                  top,
                                  height,
                                  background: colorForSquadLike(b.colorKey),
                                  border: "2px solid #111827",
                                  borderRadius: 12,
                                  boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
                                }}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  card: {
    border: "2px solid #111827",
    borderRadius: 14,
    background: "#fff",
    overflow: "hidden",
  },
  cardHeader: {
    padding: "10px 12px",
    borderBottom: "2px solid #111827",
    background: "#fff",
  },
  dayHeader: {
    padding: "10px 10px",
    cursor: "pointer",
    background: "#fff",
  },
  todayHeader: {
    background: "rgba(37, 99, 235, 0.06)",
  },
  dayName: { fontSize: 12, fontWeight: 900, opacity: 0.85 },
  dayDate: { fontSize: 13, fontWeight: 900, marginTop: 2 },
  todayCol: {
    boxShadow: "inset 0 0 0 1px rgba(37, 99, 235, 0.35)",
    background: "rgba(37, 99, 235, 0.03)",
  },
};
