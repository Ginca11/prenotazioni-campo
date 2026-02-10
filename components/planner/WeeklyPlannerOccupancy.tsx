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

  startHour?: number;
  endHour?: number;
  stepMin?: number;
  rowHeight?: number;
};

function getWeekMondayToSunday(anyDate: Date): Date[] {
  const d = new Date(anyDate);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
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

function colorForKey(key: string) {
  const palette = ["#DBEAFE", "#D1FAE5", "#FFEDD5", "#FCE7F3", "#CFFAFE", "#EDE9FE", "#FEF3C7"];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

export const WeeklyPlannerTimeline: React.FC<Props> = (...
  resources,
  bookings,
  anchorDate,
  dailyRoute,
  startHour = 15,
  endHour = 21,
  stepMin = 10,
  rowHeight = 18,
}) => {
  const router = useRouter();
  const weekDays = useMemo(() => getWeekMondayToSunday(anchorDate), [anchorDate]);
  const todayKey = toISODateKey(new Date());

  const slots = useMemo(() => {
    const arr: { label: string }[] = [];
    const totalMin = (endHour - startHour) * 60;
    for (let m = 0; m < totalMin; m += stepMin) {
      const hh = Math.floor((startHour * 60 + m) / 60);
      const mm = (startHour * 60 + m) % 60;
      arr.push({ label: mm === 0 ? `${String(hh).padStart(2, "0")}:00` : "" });
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
    for (const [k, arr] of m.entries()) {
      arr.sort((a, c) => +new Date(a.start) - +new Date(c.start));
      m.set(k, arr);
    }
    return m;
  }, [bookings]);

  function blockStyle(b: BookingLike) {
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
                      style={{ ...S.dayHeader, ...(isToday ? S.todayHeader : null) }}
                    >
                      <div style={S.dayName}>{formatDayName(d)}</div>
                      <div style={S.dayDate}>{formatDayDate(d)}</div>
                    </button>
                  );
                })}
              </div>

              <div style={S.bodyRow}>
                <div style={{ ...S.timeCol, height: heightPx }}>
                  {slots.map((s, i) => (
                    <div key={i} style={{ ...S.timeCell, height: rowHeight }}>
                      {s.label}
                    </div>
                  ))}
                </div>

                <div style={S.daysWrap}>
                  {weekDays.map((d) => {
                    const dayKey = toISODateKey(d);
                    const isToday = dayKey === todayKey;
                    const list = byDay.get(dayKey) ?? [];

                    return (
                      <div
                        key={dayKey}
                        style={{ ...S.dayCol, height: heightPx, ...(isToday ? S.todayCol : null) }}
                        onDoubleClick={() => router.push(`${dailyRoute}?date=${dayKey}`)}
                      >
                        {slots.map((_, i) => (
                          <div key={i} style={{ ...S.gridRow, height: rowHeight }} />
                        ))}

                        {list.map((b) => {
                          const { top, height } = blockStyle(b);
                          return (
                            <div
                              key={String(b.id)}
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
};


const S: Record<st
