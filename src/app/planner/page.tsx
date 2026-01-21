"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "@/lib/supabaseClient";
import { RESOURCE_ORDER } from "@/lib/resources";

/* =======================
   TYPES
======================= */

type Resource = { id: number; name: string; type: string };
type Squad = { id: number; name: string };

type Profile = {
  id: string;
  full_name: string;
  role: string;
};

type BookingType = "TRAINING" | "MATCH" | "MAINTENANCE";
type BookingStatus = string;
type FieldModeUI = "FULL" | "HALF_A" | "HALF_B";

type BookingRow = {
  id: number;
  status: BookingStatus;
  type: BookingType;
  notes: string | null;
  squad_id: number;
  created_by: string;
  series_id?: string | null;
};

type BookingResRow = {
  booking_id: number;
  resource_id: number;
  start_at: string;
  end_at: string;
  resources?: Resource | Resource[] | null;
  booking?: {
    id: number;
    status: BookingStatus;
    type: BookingType;
    notes: string | null;
    squad_id: number;
    created_by: string;
    series_id?: string | null;
    squad?: { id: number; name: string } | null;
  } | null;
};

type RenderBlock = {
  booking_id: number;
  start_at: string;
  end_at: string;
  anchor_resource_id: number;
  span_cols: 1 | 2;
  squad_name: string;
  coach_name: string;
  booking_type: string;
  status: string;
  created_by: string;
  is_minibus: boolean;
};

/* =======================
   HELPERS (PURE)
======================= */

function pickResource(row: BookingResRow): Resource | null {
  const r = row.resources;
  if (!r) return null;
  return Array.isArray(r) ? (r[0] ?? null) : r;
}

function isLocker(res: Resource) {
  return res.type === "LOCKER" || res.name.toLowerCase().includes("spogliatoio");
}
function isMiniField(res: Resource) {
  return res.type === "MINI_FIELD" || res.name.toLowerCase().includes("campetto");
}
function isMinibus(res: Resource) {
  return res.type === "MINIBUS" || res.name.toLowerCase().includes("pulmino");
}
function isMainFieldA(res: Resource) {
  return res.name === "Campo A";
}
function isMainFieldB(res: Resource) {
  return res.name === "Campo B";
}

function statusPillColors(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "CONFIRMED") return { bg: "#E8F7EE", border: "#2E7D32", text: "#2E7D32" };
  if (s === "PROPOSED") return { bg: "#FFF7E6", border: "#B26A00", text: "#B26A00" };
  if (s.includes("CHANGE")) return { bg: "#FFF1F2", border: "#B42318", text: "#B42318" };
  if (s === "CANCELLED" || s === "CANCELED") return { bg: "#F2F4F7", border: "#667085", text: "#667085" };
  return { bg: "#EEF2FF", border: "#4F46E5", text: "#4F46E5" };
}

function niceDbError(message: string) {
  const m = message || "";
  if (m.toLowerCase().includes("booking_resources_no_overlap")) return "Orario già occupato per questa risorsa.";
  if (m.toLowerCase().includes("conflicts with key")) return "Orario già occupato per questa risorsa.";
  if (m.toLowerCase().includes("overlap")) return "Orario già occupato per questa risorsa.";
  return m;
}

function colorForSquad(squadName: string) {
  const palette = ["#EFF6FF", "#ECFDF3", "#FFF7ED", "#FDF2F8", "#F0F9FF", "#F5F3FF", "#FEF3C7"];
  let hash = 0;
  for (let i = 0; i < squadName.length; i++) hash = squadName.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

/* =======================
   PAGE
======================= */

export default function PlannerPage() {
  const [day, setDay] = useState(dayjs());

  const [resources, setResources] = useState<Resource[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [rows, setRows] = useState<BookingResRow[]>([]);
  const [loading, setLoading] = useState(true);

  // auth / profile
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profilesById, setProfilesById] = useState<Map<string, Profile>>(new Map());

  // responsive
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // modal
  const [openCreate, setOpenCreate] = useState(false);
  const [openDetails, setOpenDetails] = useState(false);

  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string>("");

  const [activeBookingId, setActiveBookingId] = useState<number | null>(null);
  const [activeBookingOwner, setActiveBookingOwner] = useState<string>("");

  // form
  const [squadId, setSquadId] = useState<number | "">("");
  const [bookingType, setBookingType] = useState<BookingType>("TRAINING");

  const [fieldModeUI, setFieldModeUI] = useState<FieldModeUI>("FULL");
  const [startHHMM, setStartHHMM] = useState("15:00");
  const [endHHMM, setEndHHMM] = useState("16:00");

  // spogliatoi
  const [locker1Id, setLocker1Id] = useState<number | "NONE">("NONE");
  const [locker2Id, setLocker2Id] = useState<number | "NONE">("NONE");
  const [lockerBeforeMin, setLockerBeforeMin] = useState(60);
  const [lockerAfterMin, setLockerAfterMin] = useState(60);

  const [notes, setNotes] = useState("");
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ricorrenza
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringUntil, setRecurringUntil] = useState("");

  // orari planner
  const isWeekend = day.day() === 0 || day.day() === 6;
  const startHour = isWeekend ? 9 : 15;
  const endHour = 21;
  const stepMin = 10;

  // UI sizing (più compatto su mobile)
  const rowHeight = isMobile ? 20 : 22;
  const timeColWidth = isMobile ? 64 : 76;

  const fieldColWidth = isMobile ? 132 : 180;
  const lockerColWidth = isMobile ? 92 : 110;
  const miniColWidth = isMobile ? 120 : 160;
  const minibusColWidth = isMobile ? 120 : 160;

  const headerPad = isMobile ? 6 : 8;
  const baseFont = isMobile ? 12 : 13;

  /* =======================
     TIME HELPERS
  ======================= */

  function dayTimeToIsoFor(d: dayjs.Dayjs, hhmm: string) {
    const [hh, mm] = hhmm.split(":").map(Number);
    return d.hour(hh).minute(mm).second(0).millisecond(0).toISOString();
  }

  function clampToStep(hhmm: string) {
    const [hh, mm] = hhmm.split(":").map(Number);
    const total = hh * 60 + mm;
    const snapped = Math.round(total / stepMin) * stepMin;
    const nh = Math.floor(snapped / 60);
    const nm = snapped % 60;
    return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
  }

  function spanSlots(startIso: string, endIso: string) {
    const s = dayjs(startIso);
    const e = dayjs(endIso);
    const start = day.hour(startHour).minute(0).second(0).millisecond(0);

    const top = Math.max(0, Math.floor(s.diff(start, "minute") / stepMin)) * rowHeight;
    const height = Math.max(rowHeight, Math.ceil(e.diff(s, "minute") / stepMin) * rowHeight);

    return { top, height };
  }

  /* =======================
     SLOTS + IDs
  ======================= */

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

  const lockerResources = useMemo(() => resources.filter(isLocker), [resources]);
  const fieldAId = useMemo(() => resources.find((r) => r.name === "Campo A")?.id ?? null, [resources]);
  const fieldBId = useMemo(() => resources.find((r) => r.name === "Campo B")?.id ?? null, [resources]);

  function colWidthFor(res: Resource) {
    if (isLocker(res)) return lockerColWidth;
    if (isMiniField(res)) return miniColWidth;
    if (isMinibus(res)) return minibusColWidth;
    return fieldColWidth;
  }

  function computeRpcFieldMode(res: Resource): "A" | "B" | "FULL" {
    if (isMainFieldA(res)) return "A";
    if (isMainFieldB(res)) return "B";
    if (fieldModeUI === "HALF_A") return "A";
    if (fieldModeUI === "HALF_B") return "B";
    return "FULL";
  }

  /* =======================
     COLUMN COLORS
  ======================= */

  // palette spogliatoi: da arancio scuro -> giallo chiaro
  const lockerBgPalette = ["#C2410C", "#EA580C", "#F59E0B", "#FBBF24", "#FDE68A", "#FEF3C7"];

  const lockerBgById = useMemo(() => {
    const m = new Map<number, string>();
    const lockers = resources.filter(isLocker);
    for (let i = 0; i < lockers.length; i++) {
      m.set(lockers[i].id, lockerBgPalette[i % lockerBgPalette.length]);
    }
    return m;
  }, [resources]);

  function columnBg(res: Resource) {
    // Campi: verde scuro
    if (isMainFieldA(res) || isMainFieldB(res)) return "#0B3D2E";
    // Campetto: verde più chiaro
    if (isMiniField(res)) return "#1F7A4D";
    // Spogliatoi: giallo/arancio
    if (isLocker(res)) return lockerBgById.get(res.id) ?? "#F59E0B";
    // Pulmino: azzurro
    if (isMinibus(res)) return "#0EA5E9";
    // default neutro
    return "#F8FAFC";
  }

  function columnHeaderTextColor(res: Resource) {
    // sui colori scuri testo bianco
    if (isMainFieldA(res) || isMainFieldB(res)) return "#FFFFFF";
    if (isMiniField(res)) return "#FFFFFF";
    if (isMinibus(res)) return "#FFFFFF";
    // sugli spogliatoi testo scuro per leggibilità
    if (isLocker(res)) return "#111827";
    return "#111827";
  }

  function columnGridLine(res: Resource) {
    // linea più visibile su sfondi colorati
    if (isMainFieldA(res) || isMainFieldB(res) || isMiniField(res) || isMinibus(res)) return "rgba(255,255,255,0.18)";
    if (isLocker(res)) return "rgba(17,24,39,0.12)";
    return "#eee";
  }

  /* =======================
     AUTH + LOAD
  ======================= */

  async function ensureAuth() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      window.location.href = "/login";
      return null;
    }

    setMe({ id: data.user.id });

    const p = await supabase
      .from("profiles")
      .select("id,full_name,role")
      .eq("id", data.user.id)
      .maybeSingle();

    if (p.data) {
      setProfilesById((prev) => {
        const m = new Map(prev);
        m.set(p.data!.id, p.data as Profile);
        return m;
      });
      setIsAdmin((p.data.role ?? "").toLowerCase() === "admin");
    }

    return data.user;
  }

  async function load() {
    setLoading(true);
    const user = await ensureAuth();
    if (!user) return;

    const r = await supabase.from("resources").select("id,name,type").order("id");
    const all = (r.data ?? []) as Resource[];

    const ordered = RESOURCE_ORDER.map((n) => all.find((x) => x.name === n)).filter(Boolean) as Resource[];
    const inOrder = new Set(ordered.map((x) => x.id));
    const tail = all.filter((x) => !inOrder.has(x.id));
    setResources([...ordered, ...tail]);

    const s = await supabase.from("squads").select("id,name").order("id");
    setSquads((s.data ?? []) as Squad[]);

    const dayStart = day.startOf("day").toISOString();
    const dayEnd = day.add(1, "day").startOf("day").toISOString();

    const br0 = await supabase
      .from("booking_resources")
      .select("booking_id,resource_id,start_at,end_at,resources(id,name,type)")
      .gte("start_at", dayStart)
      .lt("start_at", dayEnd);

    if (br0.error) {
      console.error(br0.error);
      setRows([]);
      setLoading(false);
      return;
    }

    const brData: BookingResRow[] = (br0.data ?? []).map((x: any) => ({
      booking_id: x.booking_id,
      resource_id: x.resource_id,
      start_at: x.start_at,
      end_at: x.end_at,
      resources: x.resources ?? null,
    }));

    const bookingIds = Array.from(new Set(brData.map((x) => x.booking_id)));

    let bookingsById = new Map<number, BookingRow>();
    if (bookingIds.length) {
      const b0 = await supabase
        .from("bookings")
        .select("id,status,type,notes,squad_id,created_by,series_id")
        .in("id", bookingIds);

      if (b0.data) bookingsById = new Map(b0.data.map((b) => [b.id, b as BookingRow]));
      if (b0.error) console.error(b0.error);
    }

    const squadIds = Array.from(new Set(Array.from(bookingsById.values()).map((b) => b.squad_id)));
    let squadsById = new Map<number, Squad>();
    if (squadIds.length) {
      const s0 = await supabase.from("squads").select("id,name").in("id", squadIds);
      if (s0.data) squadsById = new Map(s0.data.map((x) => [x.id, x]));
      if (s0.error) console.error(s0.error);
    }

    const creatorIds = Array.from(new Set(Array.from(bookingsById.values()).map((b) => b.created_by)));
    if (creatorIds.length) {
      const p0 = await supabase.from("profiles").select("id,full_name,role").in("id", creatorIds);
      if (p0.data) {
        setProfilesById((prev) => {
          const m = new Map(prev);
          for (const p of p0.data as Profile[]) m.set(p.id, p);
          return m;
        });
      }
      if (p0.error) console.error(p0.error);
    }

    const merged: BookingResRow[] = brData.map((r) => {
      const b = bookingsById.get(r.booking_id);
      const sq = b ? squadsById.get(b.squad_id) : undefined;
      return {
        ...r,
        booking: b
          ? ({
              ...b,
              squad: sq ? { id: sq.id, name: sq.name } : null,
            } as any)
          : null,
      };
    });

    setRows(merged);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  /* =======================
     MODAL / FORM HELPERS
  ======================= */

  function resetFormForSlot(res: Resource, slotHHMM: string) {
    setSubmitErr(null);
    setSelectedResource(res);
    setSelectedSlot(slotHHMM);

    setSquadId("");
    setBookingType(isLocker(res) ? "MAINTENANCE" : "TRAINING");

    const st = clampToStep(slotHHMM);
    const en = clampToStep(
      dayjs(`${day.format("YYYY-MM-DD")}T${slotHHMM}`)
        .add(60, "minute")
        .format("HH:mm")
    );

    setStartHHMM(st);
    setEndHHMM(en);

    if (isMainFieldA(res)) setFieldModeUI("HALF_A");
    else if (isMainFieldB(res)) setFieldModeUI("HALF_B");
    else setFieldModeUI("FULL");

    setLocker1Id("NONE");
    setLocker2Id("NONE");
    setLockerBeforeMin(60);
    setLockerAfterMin(60);

    setNotes("");

    setIsRecurring(false);
    setRecurringUntil("");
  }

  function openCreateModal(res: Resource, slotHHMM: string) {
    setActiveBookingId(null);
    setActiveBookingOwner("");
    resetFormForSlot(res, slotHHMM);
    setOpenDetails(false);
    setOpenCreate(true);
  }

  function closeAllModals() {
    setOpenCreate(false);
    setOpenDetails(false);
    setSelectedResource(null);
    setActiveBookingId(null);
    setSubmitErr(null);
    setSubmitting(false);
  }

  function canEditOrDelete(ownerId: string) {
    if (!me) return false;
    return isAdmin || ownerId === me.id;
  }

  function openDetailsModal(block: RenderBlock) {
    setSubmitErr(null);

    setActiveBookingId(block.booking_id);
    setActiveBookingOwner(block.created_by);

    const brs = rows.filter((x) => x.booking_id === block.booking_id);
    const b = brs[0]?.booking ?? null;

    const fieldRow =
      brs.find((x) => pickResource(x)?.name === "Campo A") ||
      brs.find((x) => pickResource(x)?.name === "Campo B");

    const resRow = fieldRow ?? brs[0];
    const res = resources.find((r) => r.id === resRow.resource_id) ?? null;

    setSelectedResource(res);
    setSelectedSlot(dayjs(resRow.start_at).format("HH:mm"));

    setSquadId(b?.squad_id ?? "");
    setBookingType((b?.type as BookingType) ?? "TRAINING");
    setNotes(b?.notes ?? "");

    setStartHHMM(dayjs(resRow.start_at).format("HH:mm"));
    setEndHHMM(dayjs(resRow.end_at).format("HH:mm"));

    const hasA = fieldAId ? brs.some((x) => x.resource_id === fieldAId) : false;
    const hasB = fieldBId ? brs.some((x) => x.resource_id === fieldBId) : false;

    if (hasA && hasB) setFieldModeUI("FULL");
    else if (hasA) setFieldModeUI("HALF_A");
    else if (hasB) setFieldModeUI("HALF_B");
    else setFieldModeUI("FULL");

    const lockers = brs.filter((x) => {
      const rr = pickResource(x);
      if (!rr) return false;
      return isLocker(rr);
    });

    setLocker1Id(lockers[0]?.resource_id ?? "NONE");
    setLocker2Id(lockers[1]?.resource_id ?? "NONE");

    setIsRecurring(false);
    setRecurringUntil("");

    setOpenCreate(false);
    setOpenDetails(true);
  }

  /* =======================
     CREATE / UPDATE BOOKING
  ======================= */

  async function createOrUpdateBooking(mode: "create" | "update") {
    setSubmitErr(null);

    if (!selectedResource) return setSubmitErr("Seleziona una risorsa.");
    if (squadId === "") return setSubmitErr("Seleziona una squadra.");

    const daysToCreate: dayjs.Dayjs[] = [];

    if (isRecurring) {
      if (!recurringUntil) return setSubmitErr("Seleziona la data di fine ripetizione.");

      let d = day.startOf("day");
      const end = dayjs(recurringUntil).endOf("day");

      while (d.isBefore(end) || d.isSame(end)) {
        daysToCreate.push(d);
        d = d.add(1, "week");
      }
    } else {
      daysToCreate.push(day);
    }

    setSubmitting(true);

    try {
      if (mode === "update") {
        if (!activeBookingId) throw new Error("Booking non selezionata.");
        if (!canEditOrDelete(activeBookingOwner)) throw new Error("Non hai permessi per modificare questa prenotazione.");

        const del = await supabase.rpc("delete_booking", { p_booking_id: activeBookingId });
        if (del.error) throw del.error;
      }

      const seriesId = isRecurring ? (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`) : null;

      for (const bookingDay of daysToCreate) {
        const startIso = dayTimeToIsoFor(bookingDay, startHHMM);
        const endIso = dayTimeToIsoFor(bookingDay, endHHMM);
        if (!dayjs(endIso).isAfter(dayjs(startIso))) throw new Error("L'orario di fine deve essere dopo l'inizio.");

        const minibus = isMinibus(selectedResource);
        const lockerOnly = isLocker(selectedResource);

        const chosenLockerIds: number[] = [];
        if (locker1Id !== "NONE") chosenLockerIds.push(Number(locker1Id));
        if (locker2Id !== "NONE" && Number(locker2Id) !== Number(locker1Id)) chosenLockerIds.push(Number(locker2Id));

        const lockerStartIso = dayjs(startIso).subtract(lockerBeforeMin, "minute").toISOString();
        const lockerEndIso = dayjs(endIso).add(lockerAfterMin, "minute").toISOString();

        const { data: ins, error: insErr } = await supabase
          .from("bookings")
          .insert({
            squad_id: Number(squadId),
            type: bookingType,
            status: "PROPOSED",
            kind: minibus ? "MINIBUS" : lockerOnly ? "LOCKER" : "FIELD",
            notes: notes || null,
            created_by: me?.id,
            series_id: seriesId,
          })
          .select("id")
          .single();

        if (insErr) throw insErr;
        const newBookingId = ins.id as number;

        const rowsToInsert: any[] = [];

        if (minibus) {
          rowsToInsert.push({ booking_id: newBookingId, resource_id: selectedResource.id, start_at: startIso, end_at: endIso });
        } else if (lockerOnly) {
          const baseLockerId = selectedResource.id;
          const lockerIds = new Set<number>([baseLockerId, ...chosenLockerIds]);
          for (const lid of lockerIds) {
            rowsToInsert.push({ booking_id: newBookingId, resource_id: lid, start_at: startIso, end_at: endIso });
          }
        } else {
          const rpcMode = computeRpcFieldMode(selectedResource);

          if (isMiniField(selectedResource)) {
            rowsToInsert.push({ booking_id: newBookingId, resource_id: selectedResource.id, start_at: startIso, end_at: endIso });
          } else {
            if (rpcMode === "A") {
              if (!fieldAId) throw new Error("Campo A non trovato.");
              rowsToInsert.push({ booking_id: newBookingId, resource_id: fieldAId, start_at: startIso, end_at: endIso });
            } else if (rpcMode === "B") {
              if (!fieldBId) throw new Error("Campo B non trovato.");
              rowsToInsert.push({ booking_id: newBookingId, resource_id: fieldBId, start_at: startIso, end_at: endIso });
            } else {
              if (!fieldAId || !fieldBId) throw new Error("Campo A/B non trovati.");
              rowsToInsert.push({ booking_id: newBookingId, resource_id: fieldAId, start_at: startIso, end_at: endIso });
              rowsToInsert.push({ booking_id: newBookingId, resource_id: fieldBId, start_at: startIso, end_at: endIso });
            }
          }

          for (const lid of chosenLockerIds) {
            rowsToInsert.push({ booking_id: newBookingId, resource_id: lid, start_at: lockerStartIso, end_at: lockerEndIso });
          }
        }

        const brIns = await supabase.from("booking_resources").insert(rowsToInsert);
        if (brIns.error) {
          if (isRecurring && brIns.error.message?.toLowerCase().includes("overlap")) continue;
          throw brIns.error;
        }
      }

      await load();
      closeAllModals();
    } catch (e: any) {
      setSubmitErr(niceDbError(e?.message ?? "Errore"));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteBooking() {
    setSubmitErr(null);
    if (!activeBookingId) return;
    if (!canEditOrDelete(activeBookingOwner)) return setSubmitErr("Non hai permessi per eliminare questa prenotazione.");

    setSubmitting(true);
    const { error } = await supabase.rpc("delete_booking", { p_booking_id: activeBookingId });
    setSubmitting(false);

    if (error) return setSubmitErr(niceDbError(error.message));

    await load();
    closeAllModals();
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  /* =======================
     RENDER BLOCKS
  ======================= */

  const renderBlocks: RenderBlock[] = useMemo(() => {
    const byBooking = new Map<number, BookingResRow[]>();
    for (const row of rows) {
      const arr = byBooking.get(row.booking_id) ?? [];
      arr.push(row);
      byBooking.set(row.booking_id, arr);
    }

    const blocks: RenderBlock[] = [];

    for (const [bookingId, brs] of byBooking.entries()) {
      const b = brs[0]?.booking;
      const squadName = b?.squad?.name ?? `#${bookingId}`;
      const type = b?.type ?? "TRAINING";
      const status = b?.status ?? "—";
      const createdBy = b?.created_by ?? "";
      const coachName = createdBy ? profilesById.get(createdBy)?.full_name ?? "—" : "—";

      const hasA = fieldAId ? brs.some((x) => x.resource_id === fieldAId) : false;
      const hasB = fieldBId ? brs.some((x) => x.resource_id === fieldBId) : false;

      const isMin = brs.some((x) => {
        const rr = pickResource(x);
        const rn = rr?.name?.toLowerCase() ?? "";
        const rt = rr?.type ?? "";
        return rt === "MINIBUS" || rn.includes("pulmino");
      });

      if (hasA && hasB && fieldAId && fieldBId) {
        const startAt = brs
          .filter((x) => x.resource_id === fieldAId || x.resource_id === fieldBId)
          .map((x) => x.start_at)
          .sort()[0];

        const endAt = brs
          .filter((x) => x.resource_id === fieldAId || x.resource_id === fieldBId)
          .map((x) => x.end_at)
          .sort()
          .slice(-1)[0];

        blocks.push({
          booking_id: bookingId,
          start_at: startAt,
          end_at: endAt,
          anchor_resource_id: fieldAId,
          span_cols: 2,
          squad_name: squadName,
          coach_name: coachName,
          booking_type: type,
          status,
          created_by: createdBy,
          is_minibus: isMin,
        });
      }

      for (const rr of brs) {
        if ((rr.resource_id === fieldAId || rr.resource_id === fieldBId) && hasA && hasB) continue;

        blocks.push({
          booking_id: bookingId,
          start_at: rr.start_at,
          end_at: rr.end_at,
          anchor_resource_id: rr.resource_id,
          span_cols: 1,
          squad_name: squadName,
          coach_name: coachName,
          booking_type: type,
          status,
          created_by: createdBy,
          is_minibus: isMin,
        });
      }
    }

    return blocks;
  }, [rows, fieldAId, fieldBId, profilesById]);

  const blocksByAnchor = useMemo(() => {
    const m = new Map<number, RenderBlock[]>();
    for (const b of renderBlocks) {
      const arr = m.get(b.anchor_resource_id) ?? [];
      arr.push(b);
      m.set(b.anchor_resource_id, arr);
    }
    return m;
  }, [renderBlocks]);

  const minWidthTotal = useMemo(() => {
    const w = resources.reduce((sum, r) => sum + colWidthFor(r), 0);
    return timeColWidth + w;
  }, [resources, timeColWidth]);

  const fieldBWidth = useMemo(() => {
    const rb = resources.find((r) => r.name === "Campo B");
    return rb ? colWidthFor(rb) : fieldColWidth;
  }, [resources, fieldColWidth]);

  /* =======================
     UI
  ======================= */

  const stickyBorder = "1px solid rgba(17,24,39,0.10)";

  const dateInputValue = day.format("YYYY-MM-DD");

  return (
    <div style={{ padding: isMobile ? 12 : 24, fontSize: baseFont }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 900 }}>Planner</h2>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
            {/* data + picker */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>{day.format("DD/MM/YYYY")}</div>

              <input
                type="date"
                value={dateInputValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setDay(dayjs(v));
                }}
                style={{
                  padding: isMobile ? "6px 8px" : "6px 10px",
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  fontWeight: 900,
                }}
                aria-label="Seleziona data"
              />
            </div>

            {/* ✅ nuovo: titolo a destra della data */}
            <div
              style={{
                fontWeight: 900,
                fontSize: isMobile ? 18 : 22,
                letterSpacing: "0.2px",
                whiteSpace: "nowrap",
              }}
            >
              S.S. Stivo
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setDay(day.subtract(1, "day"))}>◀</button>
          <button onClick={() => setDay(dayjs())}>Oggi</button>
          <button onClick={() => setDay(day.add(1, "day"))}>▶</button>
          <button onClick={logout}>Esci</button>
        </div>
      </div>

      {/* PLANNER */}
      {loading ? (
        <div>Caricamento…</div>
      ) : (
        <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "auto" }}>
          {/* HEADER COLONNE (sticky top) */}
          <div
            style={{
              display: "flex",
              minWidth: minWidthTotal,
              position: "sticky",
              top: 0,
              zIndex: 10,
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            {/* ORA header sticky left */}
            <div
              style={{
                width: timeColWidth,
                padding: headerPad,
                fontWeight: 900,
                position: "sticky",
                left: 0,
                zIndex: 30,
                background: "#F3F4F6",
                borderRight: stickyBorder,
              }}
            >
              Ora
            </div>

            {resources.map((r) => (
              <div
                key={r.id}
                style={{
                  width: colWidthFor(r),
                  padding: headerPad,
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                  background: columnBg(r),
                  color: columnHeaderTextColor(r),
                  borderRight: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {r.name}
              </div>
            ))}
          </div>

          {/* BODY */}
          <div style={{ display: "flex", minWidth: minWidthTotal }}>
            {/* COLONNA ORARI (sticky left) */}
            <div
              style={{
                width: timeColWidth,
                position: "sticky",
                left: 0,
                zIndex: 9,
                background: "#F3F4F6",
                borderRight: stickyBorder,
              }}
            >
              {slots.map((t, i) => (
                <div
                  key={i}
                  style={{
                    height: rowHeight,
                    fontSize: isMobile ? 11 : 12,
                    paddingLeft: isMobile ? 6 : 8,
                    fontWeight: 900,
                    display: "flex",
                    alignItems: "center",
                    background: "#F3F4F6",
                    borderBottom: "1px solid rgba(17,24,39,0.12)", // ✅ righe 10 minuti visibili
                  }}
                >
                  {t.minute() === 0 ? t.format("HH:mm") : ""}
                </div>
              ))}
            </div>

            {/* COLONNE RISORSE */}
            {resources.map((res) => {
              const blocks = blocksByAnchor.get(res.id) ?? [];
              const w = colWidthFor(res);
              const bg = columnBg(res);
              const gridLine = columnGridLine(res);

              return (
                <div
                  key={res.id}
                  style={{
                    width: w,
                    position: "relative",
                    cursor: "pointer",
                    background: bg,
                  }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const idx = Math.floor(y / rowHeight);
                    if (idx >= 0 && idx < slots.length) {
                      openCreateModal(res, slots[idx].format("HH:mm"));
                    }
                  }}
                >
                  {/* GRIGLIA */}
                  {slots.map((_, i) => (
                    <div key={i} style={{ height: rowHeight, borderBottom: `1px solid ${gridLine}` }} />
                  ))}

                  {/* BLOCCHI */}
                  {blocks.map((b) => {
                    const { top, height } = spanSlots(b.start_at, b.end_at);
                    const blockBg = colorForSquad(b.squad_name);
                    const pill = statusPillColors(b.status);
                    const blockWidth = b.span_cols === 2 && res.name === "Campo A" ? w + fieldBWidth - 8 : w - 8;

                    return (
                      <div
                        key={`${b.booking_id}-${b.anchor_resource_id}-${b.start_at}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetailsModal(b);
                        }}
                        style={{
                          position: "absolute",
                          left: 4,
                          top,
                          height,
                          width: blockWidth,
                          background: blockBg,
                          border: "1px solid rgba(17,24,39,0.75)",
                          borderRadius: 10,
                          padding: isMobile ? 5 : 6,
                          fontSize: isMobile ? 11 : 12,
                          boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <b style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {b.squad_name}
                          </b>
                          <span
                            style={{
                              background: pill.bg,
                              border: `1px solid ${pill.border}`,
                              color: pill.text,
                              padding: "1px 6px",
                              borderRadius: 999,
                              fontSize: 11,
                              whiteSpace: "nowrap",
                              height: "fit-content",
                              fontWeight: 900,
                            }}
                          >
                            {b.status}
                          </span>
                        </div>
                        <div style={{ marginTop: 2, fontWeight: 900 }}>
                          {dayjs(b.start_at).format("HH:mm")}–{dayjs(b.end_at).format("HH:mm")}
                        </div>
                        <div style={{ fontSize: isMobile ? 10.5 : 11, opacity: 0.9, fontWeight: 800 }}>
                          {b.booking_type} · {b.coach_name}
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

      {/* MODALE */}
      {(openCreate || openDetails) && (
        <div
          onClick={closeAllModals}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 50,
            padding: isMobile ? 12 : 0,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 12,
              width: 780,
              maxWidth: "95vw",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <h3 style={{ marginTop: 0, fontWeight: 900 }}>{openCreate ? "Nuova prenotazione" : "Dettagli prenotazione"}</h3>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Risorsa</div>
                <div style={{ fontWeight: 900 }}>{selectedResource?.name ?? "—"}</div>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Giorno</div>
                <div style={{ fontWeight: 900 }}>{day.format("DD/MM/YYYY")}</div>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Squadra</span>
                <select value={squadId === "" ? "" : String(squadId)} onChange={(e) => setSquadId(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">— seleziona —</option>
                  {squads.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Tipo</span>
                <select value={bookingType} onChange={(e) => setBookingType(e.target.value as BookingType)}>
                  <option value="TRAINING">Allenamento</option>
                  <option value="MATCH">Partita</option>
                  <option value="MAINTENANCE">Manutenzione</option>
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Inizio</span>
                <input value={startHHMM} onChange={(e) => setStartHHMM(clampToStep(e.target.value))} />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Fine</span>
                <input value={endHHMM} onChange={(e) => setEndHHMM(clampToStep(e.target.value))} />
              </label>

              {!selectedResource || isLocker(selectedResource) || isMinibus(selectedResource) || isMiniField(selectedResource) ? null : (
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.75 }}>Campo</span>
                  <select value={fieldModeUI} onChange={(e) => setFieldModeUI(e.target.value as FieldModeUI)}>
                    <option value="FULL">Intero (A+B)</option>
                    <option value="HALF_A">Metà A</option>
                    <option value="HALF_B">Metà B</option>
                  </select>
                </label>
              )}

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Spogliatoio 1</span>
                <select value={locker1Id === "NONE" ? "NONE" : String(locker1Id)} onChange={(e) => setLocker1Id(e.target.value === "NONE" ? "NONE" : Number(e.target.value))}>
                  <option value="NONE">— nessuno —</option>
                  {lockerResources.map((l) => (
                    <option key={l.id} value={String(l.id)}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Spogliatoio 2</span>
                <select value={locker2Id === "NONE" ? "NONE" : String(locker2Id)} onChange={(e) => setLocker2Id(e.target.value === "NONE" ? "NONE" : Number(e.target.value))}>
                  <option value="NONE">— nessuno —</option>
                  {lockerResources.map((l) => (
                    <option key={l.id} value={String(l.id)}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Spogliatoi: minuti prima</span>
                <input type="number" value={lockerBeforeMin} onChange={(e) => setLockerBeforeMin(Number(e.target.value || 0))} />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Spogliatoi: minuti dopo</span>
                <input type="number" value={lockerAfterMin} onChange={(e) => setLockerAfterMin(Number(e.target.value || 0))} />
              </label>

              <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Note</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </label>

              {openCreate && (
                <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
                    Ripeti ogni settimana
                  </label>

                  {isRecurring && (
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      fino al:
                      <input type="date" value={recurringUntil} onChange={(e) => setRecurringUntil(e.target.value)} />
                    </label>
                  )}
                </div>
              )}
            </div>

            {submitErr && <div style={{ color: "red", marginTop: 10, fontWeight: 900 }}>{submitErr}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <button onClick={closeAllModals}>Chiudi</button>

              {openCreate && (
                <button onClick={() => createOrUpdateBooking("create")} disabled={submitting}>
                  {submitting ? "Creo…" : "Crea"}
                </button>
              )}

              {openDetails && (
                <>
                  <button onClick={deleteBooking} disabled={submitting}>
                    Elimina
                  </button>
                  <button onClick={() => createOrUpdateBooking("update")} disabled={submitting}>
                    Salva
                  </button>
                </>
              )}
            </div>

            {openDetails && activeBookingId && (
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                Booking ID: <b>{activeBookingId}</b>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
