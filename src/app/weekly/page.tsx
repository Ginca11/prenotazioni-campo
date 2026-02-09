"use client";

export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

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

function isWeekend(d: dayjs.Dayjs) {
  const dow = d.day(); // 0 dom ... 6 sab
  return dow === 0 || dow === 6;
}

/**
 * Zebra + weekend + separatore elegante:
 * - zebra leggerissima alternata sui feriali
 * - weekend un po’ più marcato (solo visivo)
 * - separatore giorno: “shadow inset” ai bordi del gruppo (3 colonne)
 */
function dayFill(d: dayjs.Dayjs, dayIndex: number) {
  if (isWeekend(d)) return "rgba(17,24,39,0.045)";
  return dayIndex % 2 === 0 ? "rgba(17,24,39,0.022)" : "transparent";
}

function dayHeaderFill(d: dayjs.Dayjs, dayIndex: number) {
  // header un filo più evidente del body
  if (isWeekend(d)) return "rgba(17,24,39,0.060)";
  return dayIndex % 2 === 0 ? "rgba(17,24,39,0.035)" : "transparent";
}

/* =======================
   PAGE
======================= */

export default function WeeklyPage() {
  const router = useRouter();

  const [fields, setFields] = useState<FieldResource[]>([]);
  const [bookings, setBookings] = useState<TimelineBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ancoriamo a oggi (solo UI)
  const anchor = useMemo(() => dayjs(), []);
  const monday = useMemo(() => getWeekMonday(anchor), [anchor]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => monday.add(i, "day")), [monday]);

  // Timeline
  const startHour = 9;
  const endHour = 21;
  const stepMin = 10;

  // DENSITÀ (per stare in una schermata)
  const rowHeight = 10; // 10 min = 10px (12h => 720px)
  const timeColW = 54;

  // 21 colonne: min basso per far stare tutto
  const colMinW = 38;

  // Separatori (giorni più leggibili)
  const daySep = "rgba(17,24,39,0.30)"; // separatore giorno
  const colSep = "rgba(17,24,39,0.10)"; // separatore tra campi
  const hourLine = "rgba(17,24,39,0.22)";
  const halfLine = "rgba(17,24,39,0.14)";
  const slotLine = "rgba(17,24,39,0.08)";

  const slots = useMemo(() => {
    const out: { label: string; isHour: boolean; isHalf: boolean }[] = [];
    const totalMin = (endHour - startHour) * 60;
    for (let m = 0; m < totalMin; m += stepMin) {
      const hh = Math.floor((startHour * 60 + m) / 60);
      const mm = (startHour * 60 + m) % 60;

      const isHour = mm === 0;
      const isHalf = mm === 30;

      out.push({
        label: isHour ? `${String(hh).padStart(2, "0")}:00` : "",
        isHour,
        isHalf,
      });
    }
    return out;
  }, [startHour, endHour, stepMin]);

  const timelineHeight = slots.length * rowHeight;

  function goToDay(dayKey: string) {
    router.push(`/planner?date=${dayKey}`);
  }

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

        // Mostra SOLO 3 campi (come richiesto)
        const mappedFields: FieldResource[] = onlyFields
          .map((x: any) => ({ id: x.id, label: x.name }))
          .slice(0, 3);

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
  const totalFieldCols = 7 * 3;

  function colStyleFor(dayIndex: number, fieldIndex: number, isToday: boolean, d: dayjs.Dayjs) {
    const isDayStart = fieldIndex === 0;
    const isDayEnd = fieldIndex === 2;

    // separatore giorno “elegante”: shadow inset più border
    const dayShadowLeft = isDayStart ? `inset 2px 0 0 ${daySep}` : "";
    const dayShadowRight = isDayEnd ? `inset -2px 0 0 ${daySep}` : "";
    const shadow = [dayShadowLeft, dayShadowRight, isToday ? `inset 0 0 0 1px rgba(37,99,235,0.35)` : ""]
      .filter(Boolean)
      .join(", ");

    return {
      background: dayFill(d, dayIndex),
      borderLeft: `1px solid ${isDayStart ? "rgba(17,24,39,0.18)" : colSep}`,
      borderRight: `1px solid ${isDayEnd ? "rgba(17,24,39,0.18)" : colSep}`,
      boxShadow: shadow || undefined,
    } as React.CSSProperties;
  }

  function headerColStyleFor(dayIndex: number, fieldIndex: number, isToday: boolean, d: dayjs.Dayjs) {
    const isDayStart = fieldIndex === 0;
    const isDayEnd = fieldIndex === 2;

    const dayShadowLeft = isDayStart ? `inset 2px 0 0 ${daySep}` : "";
    const dayShadowRight = isDayEnd ? `inset -2px 0 0 ${daySep}` : "";
    const shadow = [dayShadowLeft, dayShadowRight, isToday ? `inset 0 -2px 0 rgba(37,99,235,0.45)` : ""]
      .filter(Boolean)
      .join(", ");

    return {
      background: dayHeaderFill(d, dayIndex),
      borderLeft: `1px solid ${isDayStart ? "rgba(17,24,39,0.18)" : colSep}`,
      borderRight: `1px solid ${isDayEnd ? "rgba(17,24,39,0.18)" : colSep}`,
      boxShadow: shadow || undefined,
    } as React.CSSProperties;
  }

  return (
    <div style={{ padding: 12, background: "#fff" }}>
      {/* TOP BAR */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontWeight: 1000 }}>Planner settimanale · Campi</h2>
        <div style={{ fontWeight: 1000, opacity: 0.85 }}>
          {monday.format("DD/MM")} – {monday.add(6, "day").format("DD/MM")}
        </div>
      </div>

      <div style={{ marginTop: 6, fontWeight: 900, fontSize: 12, opacity: 0.9 }}>
        {loading ? "Caricamento…" : ""}
        {err ? ` · ${err}` : ""}
        {!loading && !err ? ` · Campi: ${fields.length} · Prenotazioni: ${bookings.length}` : ""}
        {!loading && !err && fields.length !== 3 ? " · (Nota: attesi 3 campi)" : ""}
      </div>

      {/* MAIN GRID */}
      <div style={{ marginTop: 10, ...S.shell }}>
        <div style={{ overflowX: "auto", overflowY: "hidden" }}>
          <div style={{ minWidth: timeColW + totalFieldCols * colMinW }}>
            {/* HEADER (sticky) */}
            <div style={S.stickyHeader}>
              {/* RIGA 1: GIORNI (spanna 3 colonne) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `${timeColW}px repeat(${totalFieldCols}, minmax(${colMinW}px, 1fr))`,
                  borderBottom: "1px solid rgba(17,24,39,0.20)",
                  background: "#fff",
                }}
              >
                <div style={{ background: "rgba(17,24,39,0.06)" }} />

                {days.map((d, dayIndex) => {
                  const dayKey = d.format("YYYY-MM-DD");
                  const isToday = dayKey === todayKey;

                  // separatore giorno sul blocco header (3 colonne)
                  const shadow = [
                    `inset 2px 0 0 ${daySep}`,
                    `inset -2px 0 0 ${daySep}`,
                    isToday ? `inset 0 -2px 0 rgba(37,99,235,0.45)` : "",
                  ]
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <button
                      key={dayKey}
                      type="button"
                      onClick={() => goToDay(dayKey)}
                      style={{
                        gridColumn: `${2 + dayIndex * 3} / span 3`,
                        ...S.dayHeader,
                        background: dayHeaderFill(d, dayIndex),
                        boxShadow: shadow,
                        ...(isToday ? S.todayHeader : null),
                      }}
                      title="Apri il planner giornaliero"
                    >
                      <div style={S.dayName}>{formatDayName(d)}</div>
                      <div style={S.dayDate}>{formatDayDate(d)}</div>
                    </button>
                  );
                })}
              </div>

              {/* RIGA 2: CAMPI (ripetuti 3 volte per giorno) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `${timeColW}px repeat(${totalFieldCols}, minmax(${colMinW}px, 1fr))`,
                  borderBottom: "2px solid rgba(17,24,39,0.65)",
                  background: "#fff",
                }}
              >
                <div style={{ background: "rgba(17,24,39,0.06)" }} />

                {days.map((d, dayIndex) => {
                  const dayKey = d.format("YYYY-MM-DD");
                  const isToday = dayKey === todayKey;

                  return fields.map((f, fieldIndex) => (
                    <div
                      key={`${dayKey}-${f.id}`}
                      style={{
                        ...S.fieldHeader,
                        ...(headerColStyleFor(dayIndex, fieldIndex, isToday, d) as any),
                      }}
                      title={f.label}
                    >
                      {fieldIndex === 0 ? "C1" : fieldIndex === 1 ? "C2" : "C3"}
                    </div>
                  ));
                })}
              </div>
            </div>

            {/* BODY */}
            <div style={{ display: "flex" }}>
              {/* COLONNA ORARI */}
              <div
                style={{
                  width: timeColW,
                  background: "rgba(17,24,39,0.06)",
                  borderRight: "2px solid rgba(17,24,39,0.65)",
                  height: timelineHeight,
                }}
              >
                {slots.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      height: rowHeight,
                      paddingLeft: 8,
                      display: "flex",
                      alignItems: "center",
                      fontSize: 11,
                      fontWeight: 900,
                      opacity: s.label ? 0.9 : 0.35,
                      borderBottom: s.isHour ? `1px solid ${hourLine}` : s.isHalf ? `1px solid ${halfLine}` : `1px solid ${slotLine}`,
                    }}
                  >
                    {s.label}
                  </div>
                ))}
              </div>

              {/* 21 COLONNE (7 giorni x 3 campi) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${totalFieldCols}, minmax(${colMinW}px, 1fr))`,
                  flex: 1,
                }}
              >
                {days.map((d, dayIndex) => {
                  const dayKey = d.format("YYYY-MM-DD");
                  const isToday = dayKey === todayKey;

                  return fields.map((field, fieldIndex) => {
                    const k = `${field.id}__${dayKey}`;
                    const list = bookingsByResDay.get(k) ?? [];

                    const baseCol = colStyleFor(dayIndex, fieldIndex, isToday, d);

                    return (
                      <div
                        key={`${dayKey}-${field.id}`}
                        onClick={() => goToDay(dayKey)}
                        style={{
                          position: "relative",
                          height: timelineHeight,
                          cursor: "pointer",
                          ...(baseCol as any),
                        }}
                        title={`Apri ${dayKey}`}
                      >
                        {/* righe grid (gerarchia linee) */}
                        {slots.map((s, i) => (
                          <div
                            key={i}
                            style={{
                              height: rowHeight,
                              borderBottom: s.isHour ? `1px solid ${hourLine}` : s.isHalf ? `1px solid ${halfLine}` : `1px solid ${slotLine}`,
                            }}
                          />
                        ))}

                        {/* blocchi occupati (senza testo) */}
                        {list.map((b) => {
                          const { top, height } = blockTopHeight(b);
                          return (
                            <div
                              key={`${b.id}-${b.start}-${field.id}`}
                              style={{
                                position: "absolute",
                                left: 3,
                                right: 3,
                                top,
                                height,
                                background: colorForSquadLike(b.colorKey),
                                border: "1px solid rgba(17,24,39,0.85)",
                                borderRadius: 8,
                                boxShadow: "0 6px 14px rgba(0,0,0,0.14)",
                                pointerEvents: "none",
                              }}
                            />
                          );
                        })}
                      </div>
                    );
                  });
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, opacity: 0.75 }}>
        Suggerimento: desktop consigliato (su schermi stretti può comparire scroll orizzontale).
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  shell: {
    border: "2px solid rgba(17,24,39,0.85)",
    borderRadius: 14,
    overflow: "hidden",
    background: "#fff",
  },

  stickyHeader: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: "#fff",
  },

  dayHeader: {
    height: 34,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "0 8px",
    cursor: "pointer",
    userSelect: "none",
    border: "none",
    width: "100%",
    background: "transparent",
  },

  todayHeader: {
    background: "rgba(37,99,235,0.07)",
  },

  dayName: { fontSize: 11, fontWeight: 1000, opacity: 0.75, letterSpacing: 0.2 },
  dayDate: { fontSize: 12, fontWeight: 1000 },

  fieldHeader: {
    height: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 1000,
    userSelect: "none",
  },
};
