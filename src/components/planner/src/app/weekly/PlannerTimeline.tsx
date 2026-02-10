"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";

type ResourceLike = { id: number; label: string };

type BookingLike = {
  id: number | string;
  resourceId: number;
  start: string; // ISO
  end: string;   // ISO
  colorKey: string; // es. nome squadra/categoria
};

type Props = {
  resources: ResourceLike[];
  bookings: BookingLike[];
  anchorDate: Date;
  dailyRoute: string;

  // timeline settings (centralizzati)
  startHour?: number; // default 15
  endHour?: number;   // default 21
  stepMin?: number;   // default 10
  rowHeight?: number; // default 18
};

function getWeekMondayToSunday(anyDate: Date): Date[] {
  const d = new Date(anyDate);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 dom
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return x;
  });
}

function toISODateKey(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDayName(d: Date) {
  return d.toLocaleDateString("it-IT", { weekday: "short" }).toUpperCase();
}
function formatDayDate(d: Date) {
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

// stesso concetto del tuo colorForSquad (hash -> palette)
function colorForKey(key: string) {
  const palette = ["#DBEAFE", "#D1FAE5", "#FFEDD5", "#FCE7F3", "#CFFAFE", "#EDE9FE", "#FEF3C7"];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

export default function WeeklyPlannerTimeline({
  resources,
  bookings,
  anchorDate,
  dailyRoute,
  startHour = 15,
  endHour = 21,
  stepMin = 10,
  rowHeight = 18,
}: Props) {
  const router = useRouter();
  const weekDays = useMemo(() => getWeekMondayToSunday(anchorDate), [anchorDate]);
  const todayKey = toISODateKey(new Date());

  const slots = useMemo(() => {
    const arr: { label: string; minutesFromStart: number }[] = [];
    const totalMin = (endHour - startHour) * 60;
    for (let m = 0; m < totalMin; m += stepMin) {
      const hh = Math.floor((startHour * 60 + m) / 60);
      const mm = (startHour * 60 + m) % 60;
      arr.push({
        label: mm === 0 ? `${String(hh).padStart(2, "0")}:00` : "",
        minutesFromStart: m,
      });
    }
    return arr;
  }, [startHour, endHour, stepMin]);

  const heightPx = slots.length * rowHeight;

  const bookingsByResource = useMemo(() => {
    const m = new Map<number, BookingLike[]>();
    for (const b of bookings) {
      const arr = m.get(b.resourceId) ?? [];
      arr.push(b);
      m.set(b.resourceId, arr);
    }
    // ordina per inizio
    for (const [k, arr] of m.entries()) {
      arr.sort((a, c) => +new Date(a.start) - +new Date(c.start));
      m.set(k, arr);
    }
    return m;
  }, [bookings]);

  function blockStyle(b: BookingLike) {
    // calcolo top/height in minuti dal startHour
    const s = dayjs(b.start);
    const e = dayjs(b.end);

    const dayStart = s.startOf("day").add(startHour, "hour");
    const topMin = Math.max(0, s.diff(dayStart, "minute"));
    const durMin = Math.max(stepMin, e.diff(s, "minute"));

    const top = Math.floor(topMin / stepMin) * rowHeight;
    const height = Math.ceil(durMin / stepMin) * rowHeight;

    return { top, height };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {resources.map((res) => {
        const resBookings = bookingsByResource.get(res.id) ?? [];

        // indicizza per giorno (YYYY-MM-DD)
        const byDay = new Map<string, BookingLike[]>();
        for (const b of resBookings) {
          const key = dayjs(b.start).format("YYYY-MM-DD");
          const arr = byDay.get(key) ?? [];
          arr.push(b);
          byDay.set(key, arr);
        }

        return (
          <div key={res.id} style={S.card}>
            <div style={S.titleRow}>
              <div style={S.title}>{res.label}</div>
              <button
                type="button"
                style={S.linkBtn}
                onClick={() => router.push(`${dailyRoute}?date=${toISODateKey(anchorDate)}`)}
              >
                Apri giorno
              </button>
            </div>

            <div style={S.shell}>
              {/* HEADER GIORNI */}
              <div style={S.headerGrid}>
                <div style={S.corner} />
                {weekDays.map((d) => {
                  const k = toISODateKey(d);
                  const isToday = k === todayKey;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => router.push(`${dailyRoute}?date=${k}`)}
                      style={{
                        ...S.dayHeader,
                        ...(isToday ? S.todayHeader : null),
                      }}
                    >
                      <div style={S.dayName}>{formatDayName(d)}</div>
                      <div style={S.dayDate}>{formatDayDate(d)}</div>
                    </button>
                  );
                })}
              </div>

              {/* BODY */}
              <div style={S.bodyRow}>
                {/* COLONNA ORARI */}
                <div style={{ ...S.timeCol, height: heightPx }}>
                  {slots.map((s, i) => (
                    <div key={i} style={{ ...S.timeCell, height: rowHeight }}>
                      {s.label}
                    </div>
                  ))}
                </div>

                {/* 7 colonne giorni */}
                <div style={S.daysWrap}>
                  {weekDays.map((d) => {
                    const dayKey = toISODateKey(d);
                    const isToday = dayKey === todayKey;
                    const list = byDay.get(dayKey) ?? [];

                    return (
                      <div
                        key={dayKey}
                        style={{
                          ...S.dayCol,
                          height: heightPx,
                          ...(isToday ? S.todayCol : null),
                        }}
                        onDoubleClick={() => router.push(`${dailyRoute}?date=${dayKey}`)}
                      >
                        {/* righe griglia */}
                        {slots.map((_, i) => (
                          <div key={i} style={{ ...S.gridRow, height: rowHeight }} />
                        ))}

                        {/* blocchi */}
                        {list.map((b) => {
                          const { top, height } = blockStyle(b);
                          return (
                            <div
                              key={String(b.id)}
                              title="" // niente testo
                              style={{
                                ...S.block,
                                top,
                                height,
                                background: colorForKey(b.colorKey),
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
  );
}

const S: Record<string, React.CSSProperties> = {
  card: {
    border: "2px solid #111827",
    borderRadius: 14,
    background: "#fff",
    overflow: "hidden",
  },
  titleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    borderBottom: "2px solid #111827",
  },
  title: { fontWeight: 900, fontSize: 14 },
  linkBtn: {
    border: "2px solid #111827",
    borderRadius: 12,
    padding: "8px 10px",
    background: "#F3F4F6",
    fontWeight: 900,
    cursor: "pointer",
  },

  shell: { overflowX: "auto" },

  headerGrid: {
    display: "grid",
    gridTemplateColumns: "72px repeat(7, minmax(160px, 1fr))",
    borderBottom: "2px solid #111827",
    minWidth: 72 + 7 * 160,
  },
  corner: { background: "#E5E7EB" },
  dayHeader: {
    border: "0",
    background: "#fff",
    padding: "10px 10px",
    textAlign: "left",
    cursor: "pointer",
  },
  todayHeader: {
    background: "rgba(37, 99, 235, 0.06)",
  },
  dayName: { fontSize: 12, fontWeight: 900, opacity: 0.85 },
  dayDate: { fontSize: 13, fontWeight: 900, marginTop: 2 },

  bodyRow: { display: "flex", minWidth: 72 + 7 * 160 },
  timeCol: {
    width: 72,
    background: "#E5E7EB",
    borderRight: "2px solid #111827",
  },
  timeCell: {
    display: "flex",
    alignItems: "center",
    paddingLeft: 10,
    fontSize: 12,
    fontWeight: 900,
    borderBottom: "1px solid rgba(17,24,39,0.25)",
  },

  daysWrap: { display: "grid", gridTemplateColumns: "repeat(7, minmax(160px, 1fr))", flex: 1 },

  dayCol: {
    position: "relative",
    borderRight: "1px solid rgba(17,24,39,0.12)",
  },
  todayCol: {
    boxShadow: "inset 0 0 0 1px rgba(37, 99, 235, 0.35)",
    background: "rgba(37, 99, 235, 0.03)",
  },
  gridRow: {
    borderBottom: "1px solid rgba(17,24,39,0.12)",
  },
  block: {
    position: "absolute",
    left: 6,
    right: 6,
    borderRadius: 12,
    border: "2px solid #111827",
    boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
  },
};
