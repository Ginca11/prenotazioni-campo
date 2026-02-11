"use client";

export const dynamic = "force-dynamic";

import { C, btnStyleGhost, btnStylePrimary } from "@/features/planner/uiTokens";
import {
  columnBg,
  columnGridLine,
  columnHeaderStyle,
  bookingStyleFromCategory,
  bookingInteractiveStyle,
} from "@/features/planner/plannerUi";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

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

type FieldResource = { id: number; name: string; type: string };

type TimelineBooking = {
  id: number;
  resourceId: number;
  start: string; // ISO
  end: string; // ISO
  colorKey: string; // nome squadra/categoria
};

type ExportRow = {
  booking_id: number;
  resource_id: number;
  start_at: string;
  end_at: string;
  booking?: {
    id: number;
    status: string | null;
    type: string | null;
    notes: string | null;
    squad_id: number | null;
    created_by: string | null;
  } | null;
  resource?:
    | { id: number; name: string; type: string }
    | { id: number; name: string; type: string }[]
    | null;
};

/* =======================
   PURE HELPERS
======================= */

function colorForSquadLike(name: string) {
  const palette = [
    "#DBEAFE",
    "#D1FAE5",
    "#FFEDD5",
    "#FCE7F3",
    "#CFFAFE",
    "#EDE9FE",
    "#FEF3C7",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function getWeekMonday(anchor: dayjs.Dayjs) {
  const dow = anchor.day(); // 0 dom ... 6 sab
  return dow === 0
    ? anchor.subtract(6, "day").startOf("day")
    : anchor.subtract(dow - 1, "day").startOf("day");
}

function formatDayName(d: dayjs.Dayjs) {
  return d.toDate().toLocaleDateString("it-IT", { weekday: "short" }).toUpperCase();
}
function formatDayDate(d: dayjs.Dayjs) {
  return d.toDate().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

function isWeekend(d: dayjs.Dayjs) {
  const dow = d.day();
  return dow === 0 || dow === 6;
}

function dayHeaderFill(d: dayjs.Dayjs, dayIndex: number) {
  // zebra leggera SOLO per header giorni
  if (isWeekend(d)) return "rgba(17,24,39,0.060)";
  return dayIndex % 2 === 0 ? "rgba(17,24,39,0.035)" : "transparent";
}

function parseWeekFromQuery(raw: string | null) {
  if (!raw) return null;
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  if (!ok) return null;
  const d = dayjs(raw);
  if (!d.isValid()) return null;
  return d.startOf("day");
}

function shortFieldLabel(name: string) {
  const n = (name || "").toLowerCase();
  if (n.includes("campo a")) return "A";
  if (n.includes("campo b")) return "B";
  if (n.includes("campetto") || n.includes("mini")) return "MINI";
  return name.length > 6 ? name.slice(0, 6).toUpperCase() : name.toUpperCase();
}

function csvEscape(value: any) {
  const s = value === null || value === undefined ? "" : String(value);
  const needs = /[",\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needs ? `"${escaped}"` : escaped;
}

function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function pickResource(r: ExportRow): { id: number; name: string; type: string } | null {
  const x = r.resource ?? null;
  if (!x) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

/* =======================
   PAGE
======================= */

export default function WeeklyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [fields, setFields] = useState<FieldResource[]>([]);
  const [bookings, setBookings] = useState<TimelineBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [exporting, setExporting] = useState<null | "week" | "all">(null);

  // ✅ hover state (uniforme con daily)
  const [hoveredBookingKey, setHoveredBookingKey] = useState<string | null>(null);

  // settimana da query (?week=YYYY-MM-DD) oppure fallback su oggi
  const weekFromQuery = useMemo(() => parseWeekFromQuery(searchParams.get("week")), [searchParams]);
  const monday = useMemo(() => getWeekMonday(weekFromQuery ?? dayjs()), [weekFromQuery]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => monday.add(i, "day")), [monday]);

  // giorno selezionato (per pulsante "Giorno")
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => dayjs().format("YYYY-MM-DD"));

  // riallinea selectedDayKey quando cambia settimana
  useEffect(() => {
    const todayKey = dayjs().format("YYYY-MM-DD");
    const mondayKey = monday.format("YYYY-MM-DD");
    const sundayKey = monday.add(6, "day").format("YYYY-MM-DD");

    const within = selectedDayKey >= mondayKey && selectedDayKey <= sundayKey;
    if (within) return;

    if (todayKey >= mondayKey && todayKey <= sundayKey) setSelectedDayKey(todayKey);
    else setSelectedDayKey(mondayKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday]);

  // Timeline
  const startHour = 9;
  const endHour = 21;
  const stepMin = 10;

  // DENSITÀ
  const rowHeight = 10;
  const timeColW = 54;

  // se vuoi ancora più leggibilità, porta a 46
  const colMinW = 38;

  // linee (timeline)
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
    setSelectedDayKey(dayKey);
    router.push(`/planner?date=${dayKey}`);
  }

  function goToSelectedDay() {
    router.push(`/planner?date=${selectedDayKey}`);
  }

  // navigazione settimane via querystring ?week=YYYY-MM-DD (lunedì)
  function pushWeek(newMonday: dayjs.Dayjs) {
    const weekStr = newMonday.startOf("day").format("YYYY-MM-DD");
    const params = new URLSearchParams(searchParams.toString());
    params.set("week", weekStr);
    router.push(`${pathname}?${params.toString()}`);
  }

  function prevWeek() {
    pushWeek(monday.subtract(7, "day"));
  }
  function nextWeek() {
    pushWeek(monday.add(7, "day"));
  }
  function goThisWeek() {
    pushWeek(getWeekMonday(dayjs()));
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

        // Mostra SOLO 3 campi
        const mappedFields: FieldResource[] = onlyFields
          .map((x: any) => ({ id: x.id, name: x.name, type: x.type }))
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

  /* =======================
     EXPORT CSV (week + all)
  ======================= */

  async function fetchBookingResourcesPaged(opts: { startIso?: string; endIso?: string }) {
    const pageSize = 1000; // robusto; Supabase di solito regge bene 1000
    let from = 0;
    const out: ExportRow[] = [];

    while (true) {
      let q = supabase
        .from("booking_resources")
        .select(
          "booking_id,resource_id,start_at,end_at,booking:bookings(id,status,type,notes,squad_id,created_by),resource:resources(id,name,type)"
        )
        .order("start_at", { ascending: true })
        .range(from, from + pageSize - 1);

      if (opts.startIso) q = q.gte("start_at", opts.startIso);
      if (opts.endIso) q = q.lt("start_at", opts.endIso);

      const res = await q;
      if (res.error) throw res.error;

      const chunk = (res.data ?? []) as ExportRow[];
      out.push(...chunk);

      if (chunk.length < pageSize) break;
      from += pageSize;
    }

    return out;
  }

  async function buildCsv(rows: ExportRow[], filename: string) {
    // recupero squadre (se presenti)
    const squadIds = Array.from(
      new Set(rows.map((r) => r.booking?.squad_id).filter((x): x is number => typeof x === "number"))
    );

    let squadsById = new Map<number, string>();
    if (squadIds.length) {
      const s = await supabase.from("squads").select("id,name").in("id", squadIds);
      if (s.error) throw s.error;
      squadsById = new Map((s.data ?? []).map((x: any) => [x.id, x.name]));
    }

    const header = [
      "booking_id",
      "resource_id",
      "resource_name",
      "resource_type",
      "start_at",
      "end_at",
      "booking_status",
      "booking_type",
      "squad_id",
      "squad_name",
      "created_by",
      "notes",
    ];

    const lines: string[] = [];
    lines.push(header.map(csvEscape).join(","));

    for (const r of rows) {
      const booking = r.booking ?? null;
      const resource = pickResource(r);
      const squadName = booking?.squad_id ? squadsById.get(booking.squad_id) ?? "" : "";

      const line = [
        r.booking_id ?? "",
        r.resource_id ?? "",
        resource?.name ?? "",
        resource?.type ?? "",
        r.start_at ?? "",
        r.end_at ?? "",
        booking?.status ?? "",
        booking?.type ?? "",
        booking?.squad_id ?? "",
        squadName,
        booking?.created_by ?? "",
        booking?.notes ?? "",
      ];

      lines.push(line.map(csvEscape).join(","));
    }

    downloadTextFile(filename, lines.join("\n"));
  }

  async function exportWeekCsv() {
    setExporting("week");
    try {
      const ok = await waitForSession(8000);
      if (!ok) throw new Error("Sessione non trovata. Apri prima /planner (login) e riprova.");

      const startIso = monday.toISOString();
      const endIso = monday.add(7, "day").toISOString();

      const rows = await fetchBookingResourcesPaged({ startIso, endIso });

      const startKey = monday.format("YYYY-MM-DD");
      const endKey = monday.add(6, "day").format("YYYY-MM-DD");
      const filename = `prenotazioni_${startKey}__${endKey}.csv`;

      await buildCsv(rows, filename);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Errore export CSV (settimana)");
    } finally {
      setExporting(null);
    }
  }

  async function exportAllCsv() {
    setExporting("all");
    try {
      const ok = await waitForSession(8000);
      if (!ok) throw new Error("Sessione non trovata. Apri prima /planner (login) e riprova.");

      const rows = await fetchBookingResourcesPaged({});

      const nowKey = dayjs().format("YYYY-MM-DD_HH-mm");
      const filename = `prenotazioni_TUTTE_${nowKey}.csv`;

      await buildCsv(rows, filename);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Errore export CSV (totale)");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div style={{ padding: 12, background: "#fff", color: C.text, fontSize: 13 }}>
      {/* TOP BAR */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontWeight: 1000, color: C.text }}>Planner settimanale · Campi</h2>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 1000, opacity: 0.85 }}>
            {monday.format("DD/MM")} – {monday.add(6, "day").format("DD/MM")}
          </div>

          <button style={btnStyleGhost} onClick={prevWeek} title="Settimana precedente">
            ◀ Settimana
          </button>
          <button style={btnStyleGhost} onClick={goThisWeek} title="Torna alla settimana corrente">
            Oggi
          </button>
          <button style={btnStyleGhost} onClick={nextWeek} title="Settimana successiva">
            Settimana ▶
          </button>

          <button style={btnStylePrimary} onClick={goToSelectedDay} title={`Vai al planner giornaliero (${selectedDayKey})`}>
            Giorno
          </button>

          <button
            style={btnStyleGhost}
            onClick={exportWeekCsv}
            disabled={exporting !== null}
            title="Scarica CSV della settimana visualizzata"
          >
            {exporting === "week" ? "Export…" : "Export CSV"}
          </button>

          <button
            style={btnStyleGhost}
            onClick={exportAllCsv}
            disabled={exporting !== null}
            title="Scarica CSV completo di tutte le prenotazioni (booking_resources)"
          >
            {exporting === "all" ? "Export…" : "Export totale"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 6, fontWeight: 900, fontSize: 12, opacity: 0.9, color: C.text }}>
        {loading ? "Caricamento…" : ""}
        {err ? ` · ${err}` : ""}
        {!loading && !err ? ` · Campi: ${fields.length} · Prenotazioni: ${bookings.length}` : ""}
        {!loading && !err && fields.length !== 3 ? " · (Nota: attesi 3 campi)" : ""}
      </div>

      {/* MAIN GRID */}
      <div style={{ marginTop: 10, ...S.shell, border: `2px solid ${C.border}` }}>
        <div style={{ overflowX: "auto", overflowY: "hidden" }}>
          <div style={{ minWidth: timeColW + totalFieldCols * colMinW }}>
            {/* HEADER (sticky) */}
            <div style={S.stickyHeader}>
              {/* RIGA 1: GIORNI */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `${timeColW}px repeat(${totalFieldCols}, minmax(${colMinW}px, 1fr))`,
                  borderBottom: `1px solid rgba(17,24,39,0.20)`,
                  background: "#fff",
                }}
              >
                <div style={{ background: C.timeBg }} />

                {days.map((d, dayIndex) => {
                  const dayKey = d.format("YYYY-MM-DD");
                  const isToday = dayKey === todayKey;
                  const isSelected = dayKey === selectedDayKey;

                  const shadow = [
                    `inset 2px 0 0 rgba(17,24,39,0.30)`,
                    `inset -2px 0 0 rgba(17,24,39,0.30)`,
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
                        ...(isSelected ? S.selectedDayHeader : null),
                        color: C.text,
                      }}
                      title="Apri il planner giornaliero"
                    >
                      <div style={S.dayName}>{formatDayName(d)}</div>
                      <div style={S.dayDate}>{formatDayDate(d)}</div>
                    </button>
                  );
                })}
              </div>

              {/* RIGA 2: CAMPI (etichette corte + tooltip) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `${timeColW}px repeat(${totalFieldCols}, minmax(${colMinW}px, 1fr))`,
                  borderBottom: `2px solid rgba(17,24,39,0.65)`,
                  background: "#fff",
                }}
              >
                <div style={{ background: C.timeBg }} />

                {days.map((d) => {
                  const dayKey = d.format("YYYY-MM-DD");
                  return fields.map((f) => (
                    <div
                      key={`${dayKey}-${f.id}`}
                      style={{
                        ...columnHeaderStyle(f as any, colMinW, 6),
                        height: 28,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 1000,
                        letterSpacing: 0.2,
                        color: C.text,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={f.name}
                    >
                      {shortFieldLabel(f.name)}
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
                  background: C.timeBg,
                  borderRight: `2px solid rgba(17,24,39,0.65)`,
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
                      color: C.text,
                      borderBottom: s.isHour
                        ? `1px solid ${hourLine}`
                        : s.isHalf
                        ? `1px solid ${halfLine}`
                        : `1px solid ${slotLine}`,
                    }}
                  >
                    {s.label}
                  </div>
                ))}
              </div>

              {/* 21 COLONNE */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${totalFieldCols}, minmax(${colMinW}px, 1fr))`,
                  flex: 1,
                }}
              >
                {days.map((d) => {
                  const dayKey = d.format("YYYY-MM-DD");
                  const isSelected = dayKey === selectedDayKey;

                  return fields.map((field) => {
                    const k = `${field.id}__${dayKey}`;
                    const list = bookingsByResDay.get(k) ?? [];

                    const bg = columnBg(field as any);
                    const gridLine = columnGridLine(field as any);

                    return (
                      <div
                        key={`${dayKey}-${field.id}`}
                        onClick={() => goToDay(dayKey)}
                        style={{
                          position: "relative",
                          height: timelineHeight,
                          cursor: "pointer",
                          background: bg,
                          ...(isSelected ? { boxShadow: "inset 0 0 0 2px rgba(17,24,39,0.85)" } : null),
                        }}
                        title={`Apri ${dayKey}`}
                      >
                        {/* righe grid (stile daily) */}
                        {slots.map((_, i) => (
                          <div
                            key={i}
                            style={{
                              height: rowHeight,
                              borderBottom: `1px solid ${gridLine}`,
                            }}
                          />
                        ))}

                        {/* blocchi occupati */}
                        {list.map((b) => {
                          const { top, height } = blockTopHeight(b);
                          const blockStyle = bookingStyleFromCategory(b.colorKey);

                          const hoverKey = `${b.id}-${b.start}-${field.id}`;
                          const isHover = hoveredBookingKey === hoverKey;

                          return (
                            <div
                              key={hoverKey}
                              onMouseEnter={() => setHoveredBookingKey(hoverKey)}
                              onMouseLeave={() => setHoveredBookingKey(null)}
                              onClick={(e) => {
                                e.stopPropagation();
                                goToDay(dayKey);
                              }}
                              style={{
                                position: "absolute",
                                left: 3,
                                right: 3,
                                top,
                                height,

                                ...blockStyle,
                                ...bookingInteractiveStyle(isHover),

                                borderRadius: 8,
                                pointerEvents: "auto",
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

      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, opacity: 0.75, color: C.textMuted }}>
        Suggerimento: desktop consigliato (su schermi stretti può comparire scroll orizzontale).
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  shell: {
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

  selectedDayHeader: {
    background: "rgba(17,24,39,0.10)",
    boxShadow: "inset 0 -2px 0 #111827",
  },

  dayName: { fontSize: 11, fontWeight: 1000, opacity: 0.75, letterSpacing: 0.2 },
  dayDate: { fontSize: 12, fontWeight: 1000 },
};
