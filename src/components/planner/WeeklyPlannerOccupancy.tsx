"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";

/** =========
 *  Tipi minimi (NON rinominare i tuoi: adattali SOLO qui nel mapping)
 *  ========= */
type BookingLike = {
  id: string | number;
  resourceId: string | number;
  // data/ora: usa i tuoi campi reali qui sotto nel mapping
  start: string | Date; // es. "2026-02-08T16:00:00Z"
  end: string | Date;
  categoryKey: string; // es. "pulcini" | "esordienti" ...
};

type ResourceLike = {
  id: string | number;
  label: string; // es. "Campo 1"
};

type Props = {
  /** già filtrate per sezione (Campi / Spogliatoi / ...) dal tuo menu esterno */
  resources: ResourceLike[];
  /** prenotazioni già caricate (qualsiasi range tu abbia già) */
  bookings: BookingLike[];

  /** data any-day dentro la settimana corrente (es. oggi) */
  anchorDate: Date;

  /** route del planner giornaliero esistente */
  dailyRoute: string; // es. "/planner" oppure "/admin/planner"
};

export default function WeeklyPlannerOccupancy({
  resources,
  bookings,
  anchorDate,
  dailyRoute,
}: Props) {
  const router = useRouter();

  const weekDays = useMemo(() => getWeekMondayToSunday(anchorDate), [anchorDate]);

  // indicizza prenotazioni per (resourceId + yyyy-mm-dd)
  const index = useMemo(() => {
    const map = new Map<string, BookingLike[]>();
    for (const b of bookings) {
      const dayKey = toISODateKey(b.start);
      const key = `${String(b.resourceId)}__${dayKey}`;
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    // opzionale: ordinamento interno (utile se vuoi pattern consistenti)
    for (const [k, arr] of map.entries()) {
      arr.sort((a, c) => +new Date(a.start) - +new Date(c.start));
      map.set(k, arr);
    }
    return map;
  }, [bookings]);

  const todayKey = toISODateKey(new Date());

  return (
    <div style={styles.shell}>
      <div style={styles.grid}>
        {/* header empty cell */}
        <div style={{ ...styles.headerCell, ...styles.cornerCell }} />

        {/* header giorni */}
        {weekDays.map((d) => {
          const key = toISODateKey(d);
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              style={{
                ...styles.headerCell,
                ...(isToday ? styles.todayHeader : null),
              }}
            >
              <div style={styles.dayName}>{formatDayName(d)}</div>
              <div style={styles.dayDate}>{formatDayDate(d)}</div>
            </div>
          );
        })}

        {/* righe risorse */}
        {resources.map((r) => {
          return (
            <React.Fragment key={String(r.id)}>
              {/* label risorsa */}
              <div style={styles.resourceCell}>
                <div style={styles.resourceLabel}>{r.label}</div>
              </div>

              {/* celle settimana */}
              {weekDays.map((d) => {
                const dateKey = toISODateKey(d);
                const isToday = dateKey === todayKey;
                const cellKey = `${String(r.id)}__${dateKey}`;
                const dayBookings = index.get(cellKey) ?? [];

                const occupied = dayBookings.length > 0;

                return (
                  <button
                    key={cellKey}
                    type="button"
                    onClick={() => {
                      // apre il planner giornaliero già esistente
                      const url = `${dailyRoute}?date=${dateKey}`;
                      router.push(url);
                    }}
                    style={{
                      ...styles.cellButton,
                      ...(isToday ? styles.todayCell : null),
                      ...(occupied ? styles.occupiedCell : styles.freeCell),
                    }}
                    aria-label={`${r.label} - ${dateKey} - ${
                      occupied ? "Occupato" : "Libero"
                    }`}
                  >
                    {/* stato testo compatto */}
                    <div style={styles.cellTopRow}>
                      <span style={occupied ? styles.occupiedText : styles.freeText}>
                        {occupied ? "OCCUPATO" : "LIBERO"}
                      </span>

                      {/* se vuoi: piccolo contatore */}
                      {occupied ? (
                        <span style={styles.countPill}>{dayBookings.length}</span>
                      ) : null}
                    </div>

                    {/* “strisce” categoria (niente nomi) */}
                    {occupied ? (
                      <div style={styles.categoryBarsWrap}>
                        {compressCategories(dayBookings).map((cat) => (
                          <span
                            key={cat.categoryKey}
                            title={cat.categoryKey}
                            style={{
                              ...styles.categoryBar,
                              background: getCategoryColor(cat.categoryKey),
                              opacity: 0.95,
                              width: barWidth(cat.count),
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div style={styles.freeHint}>Clicca per aprire il giorno</div>
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/** =========
 *  Helpers (centralizzati)
 *  ========= */

function getWeekMondayToSunday(anyDate: Date): Date[] {
  const d = new Date(anyDate);
  d.setHours(0, 0, 0, 0);

  // JS: 0=Dom, 1=Lun...
  const day = d.getDay();
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const out: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    out.push(x);
  }
  return out;
}

function toISODateKey(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : new Date(input);
  // usa la data locale (come tipicamente fai nel planner)
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDayName(d: Date): string {
  return d.toLocaleDateString("it-IT", { weekday: "short" }).toUpperCase();
}

function formatDayDate(d: Date): string {
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

function compressCategories(bookings: BookingLike[]) {
  const map = new Map<string, number>();
  for (const b of bookings) {
    map.set(b.categoryKey, (map.get(b.categoryKey) ?? 0) + 1);
  }
  // ordine: più presenti prima
  return [...map.entries()]
    .map(([categoryKey, count]) => ({ categoryKey, count }))
    .sort((a, b) => b.count - a.count);
}

function barWidth(count: number): string {
  // UI-only: più prenotazioni di quella categoria => barra un po’ più larga
  if (count >= 4) return "100%";
  if (count === 3) return "80%";
  if (count === 2) return "60%";
  return "40%";
}

/**
 * IMPORTANTISSIMO:
 * Sostituisci questa funzione con LA TUA (quella del planner giornaliero),
 * così i colori restano identici.
 */
function getCategoryColor(categoryKey: string): string {
  const palette: Record<string, string> = {
    pulcini: "#2DD4BF",
    esordienti: "#60A5FA",
    giovanissimi: "#F59E0B",
    allievi: "#A78BFA",
    juniores: "#F472B6",
  };
  return palette[categoryKey] ?? "#94A3B8";
}

/** =========
 *  Styles (centralizzati, niente hardcoded sparsi)
 *  ========= */
const styles: Record<string, React.CSSProperties> = {
  shell: {
    width: "100%",
    overflowX: "auto",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#fff",
  },
  grid: {
    display: "grid",
    // 1 col per labels + 7 giorni
    gridTemplateColumns: "220px repeat(7, minmax(160px, 1fr))",
    // header row + N righe risorse
    gridAutoRows: "64px",
    minWidth: 220 + 7 * 160,
  },

  cornerCell: {
    background: "#fff",
  },

  headerCell: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: "#fff",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "10px 12px",
  },
  todayHeader: {
    background: "rgba(37, 99, 235, 0.06)",
    borderBottom: "1px solid rgba(37, 99, 235, 0.25)",
  },
  dayName: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.6,
    opacity: 0.85,
  },
  dayDate: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: 700,
  },

  resourceCell: {
    position: "sticky",
    left: 0,
    zIndex: 1,
    background: "#fff",
    borderRight: "1px solid rgba(0,0,0,0.08)",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    display: "flex",
    alignItems: "center",
    padding: "10px 12px",
  },
  resourceLabel: {
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.15,
  },

  cellButton: {
    border: "none",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    borderRight: "1px solid rgba(0,0,0,0.06)",
    padding: 10,
    textAlign: "left",
    cursor: "pointer",
    background: "transparent",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: 8,
  },
  todayCell: {
    boxShadow: "inset 0 0 0 1px rgba(37, 99, 235, 0.35)",
    background: "rgba(37, 99, 235, 0.04)",
  },

  freeCell: {
    background: "rgba(2, 6, 23, 0.015)",
  },
  occupiedCell: {
    background: "rgba(2, 6, 23, 0.03)",
  },

  cellTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  freeText: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.4,
    opacity: 0.55,
  },
  occupiedText: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.4,
    opacity: 0.85,
  },

  countPill: {
    fontSize: 12,
    fontWeight: 800,
    padding: "2px 8px",
    borderRadius: 999,
    background: "rgba(0,0,0,0.06)",
  },

  categoryBarsWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  categoryBar: {
    height: 8,
    borderRadius: 999,
  },

  freeHint: {
    fontSize: 12,
    opacity: 0.55,
  },
};
