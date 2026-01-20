"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "@/lib/supabaseClient";

type ResourceType = "FIELD_HALF" | "MINI_FIELD" | "LOCKER" | "MINIBUS";
type Resource = { id: number; name: string; type: ResourceType };

type Squad = { id: number; name: string; color: string };

type BookingStatus = "PROPOSED" | "CONFIRMED" | "CHANGE_REQUESTED" | "CANCELLED" | string;
type BookingType = "TRAINING" | "MATCH" | "MAINTENANCE" | string;
type BookingKind = "FIELD" | "LOCKER" | "MINIBUS" | string;

type Booking = {
  id: number;
  created_by: string;
  squad_id: number;
  kind: BookingKind;
  type: BookingType;
  status: BookingStatus;
  notes: string | null;
};

type BookingRes = {
  booking_id: number;
  resource_id: number;
  start_at: string;
  end_at: string;
  resources?: Resource | null;
};

function statusPillColors(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "CONFIRMED") return { bg: "#E8F7EE", border: "#2E7D32", text: "#2E7D32" };
  if (s === "PROPOSED") return { bg: "#FFF7E6", border: "#B26A00", text: "#B26A00" };
  if (s.includes("CHANGE")) return { bg: "#FFF1F2", border: "#B42318", text: "#B42318" };
  if (s === "CANCELLED" || s === "CANCELED") return { bg: "#F2F4F7", border: "#667085", text: "#667085" };
  return { bg: "#EEF2FF", border: "#4F46E5", text: "#4F46E5" };
}

function kindBadge(kind: string) {
  const k = (kind || "").toUpperCase();
  if (k === "MINIBUS") return { bg: "#ECFDF3", border: "#039855", text: "#039855" };
  if (k === "LOCKER") return { bg: "#F9FAFB", border: "#344054", text: "#344054" };
  return { bg: "#EFF6FF", border: "#2563EB", text: "#2563EB" };
}

export default function PlannerPage() {
  const [day, setDay] = useState(dayjs());

  const [resources, setResources] = useState<Resource[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [bookingRes, setBookingRes] = useState<BookingRes[]>([]);
  const [bookingsById, setBookingsById] = useState<Map<number, Booking>>(new Map());
  const [loading, setLoading] = useState(true);

  // auth
  const [userId, setUserId] = useState<string | null>(null);

  // modal
  const [open, setOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string>("");

  // form
  const [squadId, setSquadId] = useState<number | "">("");
  const [bookingType, setBookingType] = useState<BookingType>("TRAINING");
  const [startHHMM, setStartHHMM] = useState("15:00");
  const [endHHMM, setEndHHMM] = useState("16:00");
  const [notes, setNotes] = useState("");
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // hours
  const isWeekend = day.day() === 0 || day.day() === 6;
  const startHour = isWeekend ? 9 : 15;
  const endHour = 21;
  const stepMin = 10;

  const rowHeight = 22;
  const timeColWidth = 76;
  const colWidth = 180;

  const slots = useMemo(() => {
    const arr: dayjs.Dayjs[] = [];
    let t = day.hour(startHour).minute(0).second(0).millisecond(0);
    const end = day.hour(endHour).minute(0).second(0).millisecond(0);
    while (t.isBefore(end)) {
      arr.push(t);
      t = t.add(stepMin, "minute");
    }
    return arr;
  }, [day, startHour]);

  function clampToStep(hhmm: string) {
    const [hh, mm] = hhmm.split(":").map(Number);
    const total = hh * 60 + mm;
    const snapped = Math.round(total / stepMin) * stepMin;
    const nh = Math.floor(snapped / 60);
    const nm = snapped % 60;
    return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
  }

  function dayTimeToIso(hhmm: string) {
    const [hh, mm] = hhmm.split(":").map(Number);
    return day.hour(hh).minute(mm).second(0).millisecond(0).toISOString();
  }

  function spanSlots(startIso: string, endIso: string) {
    const s = dayjs(startIso);
    const e = dayjs(endIso);
    const start = day.hour(startHour).minute(0).second(0).millisecond(0);

    const top = Math.max(0, Math.floor(s.diff(start, "minute") / stepMin)) * rowHeight;
    const height = Math.max(rowHeight, Math.ceil(e.diff(s, "minute") / stepMin) * rowHeight);
    return { top, height };
  }

  async function ensureAuth() {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    setUserId(uid);

    if (!uid) {
      window.location.href = "/login";
      return false;
    }
    return true;
  }

  async function load() {
    setLoading(true);
    const ok = await ensureAuth();
    if (!ok) return;

    // resources
    const r = await supabase.from("resources").select("id,name,type").order("id");
    if (r.error) console.error(r.error);
    setResources((r.data ?? []) as Resource[]);

    // squads (per dropdown)
    const s = await supabase.from("squads").select("id,name,color").order("id");
    if (s.error) console.error(s.error);
    setSquads((s.data ?? []) as Squad[]);

    // booking_resources del giorno
    const dayStart = day.startOf("day").toISOString();
    const dayEnd = day.add(1, "day").startOf("day").toISOString();

    const br = await supabase
      .from("booking_resources")
      .select("booking_id,resource_id,start_at,end_at,resources(id,name,type)")
      .gte("start_at", dayStart)
      .lt("start_at", dayEnd);

    if (br.error) {
      console.error("booking_resources error:", br.error);
      setBookingRes([]);
      setBookingsById(new Map());
      setLoading(false);
      return;
    }

    const brData = (br.data ?? []) as any[];
    setBookingRes(brData as BookingRes[]);

    const ids = Array.from(new Set(brData.map((x) => x.booking_id))).filter(Boolean);
    if (!ids.length) {
      setBookingsById(new Map());
      setLoading(false);
      return;
    }

    const b = await supabase.from("bookings").select("id,created_by,squad_id,kind,type,status,notes").in("id", ids);
    if (b.error) console.error("bookings error:", b.error);

    const map = new Map<number, Booking>();
    for (const row of (b.data ?? []) as Booking[]) map.set(row.id, row);
    setBookingsById(map);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  function openModal(res: Resource, slotHHMM: string) {
    setSubmitErr(null);
    setSelectedResource(res);
    setSelectedSlot(slotHHMM);
    setOpen(true);

    setSquadId("");
    setBookingType(res.type === "LOCKER" ? "MAINTENANCE" : "TRAINING");

    const st = clampToStep(slotHHMM);
    const en = clampToStep(dayjs(`${day.format("YYYY-MM-DD")}T${slotHHMM}`).add(60, "minute").format("HH:mm"));
    setStartHHMM(st);
    setEndHHMM(en);
    setNotes("");
  }

  function closeModal() {
    setOpen(false);
    setSelectedResource(null);
    setSubmitErr(null);
    setSubmitting(false);
  }

  function inferKind(res: Resource): BookingKind {
    if (res.type === "MINIBUS") return "MINIBUS";
    if (res.type === "LOCKER") return "LOCKER";
    return "FIELD";
  }

  async function createSimpleBooking() {
    setSubmitErr(null);
    if (!userId) return setSubmitErr("Non sei loggato.");
    if (!selectedResource) return setSubmitErr("Seleziona una risorsa.");
    if (squadId === "") return setSubmitErr("Seleziona una squadra.");

    const startIso = dayTimeToIso(startHHMM);
    const endIso = dayTimeToIso(endHHMM);
    if (!dayjs(endIso).isAfter(dayjs(startIso))) return setSubmitErr("L'orario di fine deve essere dopo l'inizio.");

    setSubmitting(true);

    const kind = inferKind(selectedResource);

    // 1) inserisci booking
    const insB = await supabase
      .from("bookings")
      .insert({
        created_by: userId,
        squad_id: Number(squadId),
        kind,
        type: bookingType,
        status: "PROPOSED",
        notes: notes || null,
      })
      .select("id")
      .single();

    if (insB.error || !insB.data?.id) {
      setSubmitting(false);
      return setSubmitErr(insB.error?.message ?? "Errore creazione booking.");
    }

    const bookingId = insB.data.id as number;

    // 2) inserisci booking_resource (una risorsa sola per ora)
    const insBR = await supabase.from("booking_resources").insert({
      booking_id: bookingId,
      resource_id: selectedResource.id,
      start_at: startIso,
      end_at: endIso,
    });

    setSubmitting(false);
    if (insBR.error) return setSubmitErr(insBR.error.message);

    await load();
    closeModal();
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // blocks per colonna risorsa
  const blocksByResource = useMemo(() => {
    const m = new Map<number, BookingRes[]>();
    for (const r of bookingRes) {
      const arr = m.get(r.resource_id) ?? [];
      arr.push(r);
      m.set(r.resource_id, arr);
    }
    return m;
  }, [bookingRes]);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Planner</div>
          <div style={{ fontSize: 13, color: "#666" }}>{day.format("DD/MM/YYYY")}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button style={{ border: "1px solid #ccc", borderRadius: 8, padding: "8px 12px" }} onClick={() => setDay(day.subtract(1, "day"))}>
            ◀︎
          </button>
          <button style={{ border: "1px solid #ccc", borderRadius: 8, padding: "8px 12px" }} onClick={() => setDay(dayjs())}>
            Oggi
          </button>
          <button style={{ border: "1px solid #ccc", borderRadius: 8, padding: "8px 12px" }} onClick={() => setDay(day.add(1, "day"))}>
            ▶︎
          </button>
          <button style={{ border: "1px solid #ccc", borderRadius: 8, padding: "8px 12px" }} onClick={logout}>
            Esci
          </button>
        </div>
      </div>

      {/* Planner */}
      {loading ? (
        <div>Caricamento…</div>
      ) : (
        <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "auto", background: "white" }}>
          {/* header */}
          <div style={{ position: "sticky", top: 0, zIndex: 5, background: "white", borderBottom: "1px solid #eee" }}>
            <div style={{ display: "flex", minWidth: timeColWidth + resources.length * colWidth }}>
              <div style={{ width: timeColWidth, borderRight: "1px solid #eee", padding: "10px 8px", fontWeight: 700 }}>
                Ora
              </div>
              {resources.map((res) => (
                <div key={res.id} style={{ width: colWidth, borderRight: "1px solid #eee", padding: "10px 8px", fontWeight: 700 }}>
                  {res.name}
                </div>
              ))}
            </div>
          </div>

          {/* body */}
          <div style={{ display: "flex", minWidth: timeColWidth + resources.length * colWidth }}>
            {/* time col */}
            <div style={{ width: timeColWidth, borderRight: "1px solid #eee" }}>
              {slots.map((t, idx) => (
                <div
                  key={idx}
                  style={{
                    height: rowHeight,
                    borderBottom: "1px solid #f0f0f0",
                    padding: "0 8px",
                    fontSize: 12,
                    color: "#666",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {t.minute() === 0 ? t.format("HH:mm") : ""}
                </div>
              ))}
            </div>

            {/* columns */}
            {resources.map((res) => {
              const blocks = blocksByResource.get(res.id) ?? [];

              return (
                <div
                  key={res.id}
                  style={{ width: colWidth, borderRight: "1px solid #eee", cursor: "pointer", position: "relative" }}
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const idx = Math.max(0, Math.min(slots.length - 1, Math.floor(y / rowHeight)));
                    openModal(res, slots[idx].format("HH:mm"));
                  }}
                >
                  {slots.map((_, idx) => (
                    <div key={idx} style={{ height: rowHeight, borderBottom: "1px solid #f0f0f0" }} />
                  ))}

                  {blocks.map((br) => {
                    const b = bookingsById.get(br.booking_id);
                    const { top, height } = spanSlots(br.start_at, br.end_at);

                    const statusColors = statusPillColors(b?.status ?? "—");
                    const badge = kindBadge(b?.kind ?? "FIELD");

                    const timeLine = `${dayjs(br.start_at).format("HH:mm")}–${dayjs(br.end_at).format("HH:mm")}`;
                    const squad = squads.find((s) => s.id === b?.squad_id);

                    return (
                      <div
                        key={`${br.booking_id}-${br.resource_id}-${br.start_at}-${br.end_at}`}
                        style={{
                          position: "absolute",
                          left: 6,
                          top: top + 2,
                          height: height - 4,
                          width: colWidth - 12,
                          borderRadius: 12,
                          border: `1px solid ${badge.border}`,
                          background: squad?.color || badge.bg,
                          padding: "6px 8px",
                          fontSize: 12,
                          overflow: "hidden",
                          pointerEvents: "none",
                          zIndex: 3,
                          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                        }}
                        title={`${squad?.name ?? "—"}\n${timeLine}\n${b?.status ?? ""} ${b?.type ?? ""}`}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {squad?.name ?? `#${br.booking_id}`}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 999,
                              border: `1px solid ${statusColors.border}`,
                              background: statusColors.bg,
                              color: statusColors.text,
                              fontWeight: 800,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {(b?.status ?? "—").toUpperCase()}
                          </div>
                        </div>

                        <div style={{ marginTop: 4, color: "#344054", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700 }}>{timeLine}</span>
                          <span
                            style={{
                              fontSize: 11,
                              padding: "1px 6px",
                              borderRadius: 999,
                              border: `1px solid ${badge.border}`,
                              background: badge.bg,
                              color: badge.text,
                              fontWeight: 800,
                            }}
                          >
                            {(b?.kind ?? "FIELD").toUpperCase()}
                          </span>
                          <span style={{ fontSize: 11, color: "#475467" }}>{(b?.type ?? "").toUpperCase()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL */}
      {open && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 720,
              background: "white",
              borderRadius: 14,
              border: "1px solid #ddd",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 16, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>Nuova prenotazione</div>
                <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                  {selectedResource?.name ?? "—"} — {day.format("DD/MM/YYYY")} — ore {selectedSlot}
                </div>
              </div>
              <button style={{ border: "1px solid #ccc", borderRadius: 8, padding: "6px 10px" }} onClick={closeModal}>
                ✕
              </button>
            </div>

            <div style={{ padding: 16, maxHeight: "70vh", overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Squadra</div>
                  <select
                    value={squadId}
                    onChange={(e) => setSquadId(e.target.value ? Number(e.target.value) : "")}
                    style={{ width: "100%", border: "1px solid #ccc", borderRadius: 10, padding: 10 }}
                  >
                    <option value="">Seleziona…</option>
                    {squads.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Tipo</div>
                  <select
                    value={bookingType}
                    onChange={(e) => setBookingType(e.target.value as BookingType)}
                    style={{ width: "100%", border: "1px solid #ccc", borderRadius: 10, padding: 10 }}
                  >
                    <option value="TRAINING">Allenamento</option>
                    <option value="MATCH">Partita</option>
                    <option value="MAINTENANCE">Manutenzione</option>
                  </select>
                </label>

                <div style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Orario</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="time"
                      step={stepMin * 60}
                      value={startHHMM}
                      onChange={(e) => setStartHHMM(clampToStep(e.target.value))}
                      style={{ width: "100%", border: "1px solid #ccc", borderRadius: 10, padding: 10 }}
                    />
                    <input
                      type="time"
                      step={stepMin * 60}
                      value={endHHMM}
                      onChange={(e) => setEndHHMM(clampToStep(e.target.value))}
                      style={{ width: "100%", border: "1px solid #ccc", borderRadius: 10, padding: 10 }}
                    />
                  </div>
                </div>

                <label style={{ gridColumn: "1 / -1", fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Note</div>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ width: "100%", border: "1px solid #ccc", borderRadius: 10, padding: 10 }} />
                </label>
              </div>

              {submitErr && <div style={{ marginTop: 12, color: "#b00020", fontSize: 13, fontWeight: 700 }}>{submitErr}</div>}
            </div>

            <div style={{ padding: 16, borderTop: "1px solid #eee", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button style={{ border: "1px solid #ccc", borderRadius: 8, padding: "8px 12px" }} onClick={closeModal}>
                Annulla
              </button>
              <button
                style={{ border: "1px solid #000", background: "#000", color: "white", borderRadius: 8, padding: "8px 12px", opacity: submitting ? 0.7 : 1 }}
                onClick={createSimpleBooking}
                disabled={submitting}
              >
                {submitting ? "Creo…" : "Crea prenotazione"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
