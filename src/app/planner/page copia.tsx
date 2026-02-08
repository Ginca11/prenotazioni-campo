"use client";

import { ensureAuth } from "@/lib/ensureAuth";
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
  if (s === "CONFIRMED") return { bg: "#DCFCE7", border: "#14532D", text: "#14532D" };
  if (s === "PROPOSED") return { bg: "#FFEDD5", border: "#7C2D12", text: "#7C2D12" };
  if (s.includes("CHANGE")) return { bg: "#FFE4E6", border: "#7F1D1D", text: "#7F1D1D" };
  if (s === "CANCELLED" || s === "CANCELED") return { bg: "#E5E7EB", border: "#111827", text: "#111827" };
  return { bg: "#E0E7FF", border: "#1E3A8A", text: "#1E3A8A" };
}

function niceDbError(message: string) {
  const m = message || "";
  if (m.toLowerCase().includes("booking_resources_no_overlap")) return "Orario già occupato per questa risorsa.";
  if (m.toLowerCase().includes("conflicts with key")) return "Orario già occupato per questa risorsa.";
  if (m.toLowerCase().includes("overlap")) return "Orario già occupato per questa risorsa.";
  return m;
}

function colorForSquad(squadName: string) {
  const palette = ["#DBEAFE", "#D1FAE5", "#FFEDD5", "#FCE7F3", "#CFFAFE", "#EDE9FE", "#FEF3C7"];
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

/* =======================
   LOAD BOOKINGS (ROWS)
======================= */
async function loadBookingsForDay() {
  const dayStart = day.startOf("day").toISOString();
  const dayEnd = day.add(1, "day").startOf("day").toISOString();

  const br0 = await supabase
    .from("booking_resources")
    .select("booking_id,resource_id,start_at,end_at,resources(id,name,type)")
    .gte("start_at", dayStart)
    .lt("start_at", dayEnd);

  console.log("BOOKING_RES FETCH", {
    error: br0.error?.message,
    count: (br0.data ?? []).length,
  });

  if (br0.error) throw br0.error;

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

    if (b0.error) throw b0.error;
    bookingsById = new Map((b0.data ?? []).map((b: any) => [b.id, b as BookingRow]));
  }

  const squadIds = Array.from(
    new Set(Array.from(bookingsById.values()).map((b) => b.squad_id).filter(Boolean))
  );

  let squadsById = new Map<number, Squad>();
  if (squadIds.length) {
    const s0 = await supabase.from("squads").select("id,name").in("id", squadIds);
    if (s0.error) throw s0.error;
    squadsById = new Map((s0.data ?? []).map((x: any) => [x.id, x as Squad]));
  }

  const creatorIds = Array.from(
    new Set(Array.from(bookingsById.values()).map((b) => b.created_by).filter(Boolean))
  );

  if (creatorIds.length) {
    const p0 = await supabase.from("profiles").select("id,full_name,role").in("id", creatorIds);
    if (p0.error) throw p0.error;

    setProfilesById((prev) => {
      const m = new Map(prev);
      for (const p of (p0.data ?? []) as Profile[]) m.set(p.id, p);
      return m;
    });
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
}

useEffect(() => {
  const onResize = () => setIsMobile(window.innerWidth < 640);
  onResize();
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}, []);

useEffect(() => {
  let cancelled = false;

  (async () => {
    setLoading(true);
    try {
      const auth = await ensureAuth();
      if (cancelled) return;

      setMe({ id: auth.user.id });
      setIsAdmin(auth.roleLower === "admin");

const r = await supabase.from("resources").select("id,name,type").order("id");

console.log("RESOURCES FETCH", {
  error: r.error?.message,
  count: (r.data ?? []).length,
  data: r.data,
});

if (r.error) throw r.error;
      if (cancelled) return;

      const all = (r.data ?? []) as Resource[];
      const ordered = RESOURCE_ORDER
        .map((n) => all.find((x) => x.name === n))
        .filter(Boolean) as Resource[];

      const inOrder = new Set(ordered.map((x) => x.id));
      const tail = all.filter((x) => !inOrder.has(x.id));
      setResources([...ordered, ...tail]);

      const s =
        auth.roleLower === "admin"
          ? await supabase.from("squads").select("id,name").order("id")
          : await supabase.from("my_managed_squads").select("id,name");

console.log("SQUADS FETCH", {
  roleLower: auth.roleLower,
  error: s.error?.message,
  count: (s.data ?? []).length,
  data: s.data,
});
      if (s.error) throw s.error;

      setSquads((s.data ?? []) as Squad[]);
      await loadBookingsForDay();

    } catch (e) {
      console.error("Planner load error:", e);
      if (!cancelled) {
        setResources([]);
        setSquads([]);
        setRows([]);
      }
    } finally {
      if (!cancelled) setLoading(false);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [day]);

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

  // UI sizing
  const rowHeight = isMobile ? 20 : 22;
  const timeColWidth = isMobile ? 66 : 76;

  const fieldColWidth = isMobile ? 132 : 180;
  const lockerColWidth = isMobile ? 94 : 110;
  const miniColWidth = isMobile ? 122 : 160;
  const minibusColWidth = isMobile ? 122 : 160;

  const headerPad = isMobile ? 6 : 8;
  const baseFont = isMobile ? 13 : 13;

  /* =======================
     HIGH CONTRAST TOKENS
  ======================= */

  const C = {
    text: "#111827",
    textMuted: "#1F2937",
    cardBg: "#FFFFFF",
    border: "#111827",
    borderSoft: "#D1D5DB",
    shadow: "0 10px 30px rgba(0,0,0,0.20)",
    overlay: "rgba(0,0,0,0.60)",
    inputBg: "#FFFFFF",
    inputBorder: "#111827",
    inputText: "#111827",
    inputLabel: "#111827",
    inputHint: "#374151",
    buttonBg: "#111827",
    buttonText: "#FFFFFF",
    buttonBorder: "#111827",
    buttonGhostBg: "#F3F4F6",
    buttonGhostText: "#111827",
    timeBg: "#E5E7EB",
    timeLine: "rgba(17,24,39,0.25)",
    gridLine: "rgba(17,24,39,0.12)",
  };

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

  function hhmmToMinutes(hhmm: string) {
    const [hh, mm] = hhmm.split(":").map((x) => Number(x));
    return hh * 60 + mm;
  }

  function addMinutesToHHMM(hhmm: string, deltaMin: number) {
    // usa la data corrente del planner per fare add robusto
    const t = dayjs(`${day.format("YYYY-MM-DD")}T${hhmm}`).add(deltaMin, "minute").format("HH:mm");
    return clampToStep(t);
  }

  function ensureEndAfterStartHHMM(start: string, end: string) {
    // Regola: Fine deve essere strettamente dopo Inizio
    if (hhmmToMinutes(end) <= hhmmToMinutes(start)) return addMinutesToHHMM(start, stepMin);
    return end;
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
    if (isMainFieldA(res) || isMainFieldB(res)) return "#0B3D2E"; // verde scuro
    if (isMiniField(res)) return "#1F7A4D"; // verde chiaro
    if (isLocker(res)) return lockerBgById.get(res.id) ?? "#F59E0B"; // giallo/arancio
    if (isMinibus(res)) return "#0EA5E9"; // azzurro
    return "#F8FAFC";
  }

  function columnHeaderTextColor(res: Resource) {
    if (isMainFieldA(res) || isMainFieldB(res) || isMiniField(res) || isMinibus(res)) return "#FFFFFF";
    if (isLocker(res)) return "#111827";
    return "#111827";
  }

  function columnGridLine(res: Resource) {
    if (isMainFieldA(res) || isMainFieldB(res) || isMiniField(res) || isMinibus(res)) return "rgba(255,255,255,0.18)";
    if (isLocker(res)) return "rgba(17,24,39,0.20)";
    return C.gridLine;
  }

  /* =======================
     AUTH + LOAD
  ======================= */



async function load() {
  setLoading(true);
  try {
    const auth = await ensureAuth(); // se fallisce -> throw
    console.log("AUTH OK", { userId: auth.user.id, roleLower: auth.roleLower });

    setMe({ id: auth.user.id });
    setIsAdmin(auth.roleLower === "admin");

    const r = await supabase.from("resources").select("id,name,type").order("id");
    if (r.error) throw r.error;

    const all = (r.data ?? []) as Resource[];

    const ordered = RESOURCE_ORDER
      .map((n) => all.find((x) => x.name === n))
      .filter(Boolean) as Resource[];

    const inOrder = new Set(ordered.map((x) => x.id));
    const tail = all.filter((x) => !inOrder.has(x.id));
    setResources([...ordered, ...tail]);

    // (qui sotto poi ci rimetti la parte che carica squads/rows, se la vuoi dentro load)
  } catch (e) {
    console.error("load() error:", e);
    // consigliato: window.location.href = "/login";
  } finally {
    setLoading(false);
  }
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

    // ✅ default 2 ore (come da tua scelta)
    const en = clampToStep(
      dayjs(`${day.format("YYYY-MM-DD")}T${slotHHMM}`)
        .add(120, "minute")
        .format("HH:mm")
    );

    setStartHHMM(st);
    setEndHHMM(ensureEndAfterStartHHMM(st, en));

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

    const st = clampToStep(dayjs(resRow.start_at).format("HH:mm"));
    const en = clampToStep(dayjs(resRow.end_at).format("HH:mm"));
    setStartHHMM(st);
    setEndHHMM(ensureEndAfterStartHHMM(st, en));

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

await loadBookingsForDay();
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

await loadBookingsForDay();
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

  const dateInputValue = day.format("YYYY-MM-DD");

  // ✅ input/select più leggibili (soprattutto su iOS)
  const inputStyle: React.CSSProperties = {
    padding: isMobile ? "10px 10px" : "8px 10px",
    border: `2px solid ${C.inputBorder}`,
    borderRadius: 12,
    background: C.inputBg,
    color: C.inputText,
    fontWeight: 800,
    outline: "none",
    minHeight: 42,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 900,
    color: C.inputLabel,
  };

  const hintStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 800,
    color: C.inputHint,
    opacity: 1,
  };

  const btnStylePrimary: React.CSSProperties = {
    background: C.buttonBg,
    color: C.buttonText,
    border: `2px solid ${C.buttonBorder}`,
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 900,
  };

  const btnStyleGhost: React.CSSProperties = {
    background: C.buttonGhostBg,
    color: C.buttonGhostText,
    border: `2px solid ${C.buttonBorder}`,
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 900,
  };

  // ✅ controlli orario "mobile-first"
  const timeValueBox: React.CSSProperties = {
    border: `2px solid ${C.inputBorder}`,
    borderRadius: 14,
    padding: isMobile ? "12px 12px" : "10px 12px",
    background: "#FFFFFF",
    fontWeight: 1000,
    fontSize: isMobile ? 26 : 22,
    textAlign: "center",
    letterSpacing: "0.5px",
    lineHeight: 1.1,
    userSelect: "none",
  };

  const stepBtnBase: React.CSSProperties = {
    minHeight: 54,
    borderRadius: 14,
    padding: "12px 16px",
    fontWeight: 1000,
    fontSize: 16,
    border: "2px solid #111827",
    boxShadow: "0 6px 14px rgba(0,0,0,0.15)",
    cursor: "pointer",
    width: "100%",
  };

  const stepBtnMinus: React.CSSProperties = {
    ...stepBtnBase,
    background: "#BBF7D0", // verde chiaro
    color: "#064E3B",
  };

  const stepBtnPlus: React.CSSProperties = {
    ...stepBtnBase,
    background: "#FED7AA", // arancio chiaro
    color: "#7C2D12",
  };

  function bumpStart(delta: number) {
    const nextStart = addMinutesToHHMM(startHHMM, delta);
    setStartHHMM(nextStart);

    // Regola: se Inizio supera/uguaglia Fine -> Fine = Inizio + 10
    if (hhmmToMinutes(nextStart) >= hhmmToMinutes(endHHMM)) {
      setEndHHMM(addMinutesToHHMM(nextStart, stepMin));
    }
  }

  function bumpEnd(delta: number) {
    const nextEnd = addMinutesToHHMM(endHHMM, delta);
    // Regola: se Fine scende sotto/uguaglia Inizio -> auto-corretta a Inizio + 10
    setEndHHMM(ensureEndAfterStartHHMM(startHHMM, nextEnd));
  }

  return (
    <div style={{ padding: isMobile ? 12 : 24, fontSize: baseFont, color: C.text, background: "#FFFFFF" }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 900, color: C.text }}>Planner</h2>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900, color: C.text }}>{day.format("DD/MM/YYYY")}</div>

              <input
                type="date"
                value={dateInputValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setDay(dayjs(v));
                }}
                style={inputStyle}
                aria-label="Seleziona data"
              />
            </div>

            <div style={{ fontWeight: 900, fontSize: isMobile ? 20 : 22, letterSpacing: "0.2px", whiteSpace: "nowrap", color: C.text }}>
              S.S. Stivo
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnStyleGhost} onClick={() => setDay(day.subtract(1, "day"))}>
            ◀
          </button>
          <button style={btnStyleGhost} onClick={() => setDay(dayjs())}>
            Oggi
          </button>
          <button style={btnStyleGhost} onClick={() => setDay(day.add(1, "day"))}>
            ▶
          </button>
          <button style={btnStylePrimary} onClick={logout}>
            Esci
          </button>
        </div>
      </div>

      {/* PLANNER */}
      {loading ? (
        <div style={{ fontWeight: 900, color: C.text }}>Caricamento…</div>
      ) : (
        <div style={{ border: "2px solid #111827", borderRadius: 14, overflow: "auto" }}>
          {/* HEADER COLONNE (sticky top) */}
          <div
            style={{
              display: "flex",
              minWidth: minWidthTotal,
              position: "sticky",
              top: 0,
              zIndex: 10,
              borderBottom: "2px solid #111827",
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
                background: C.timeBg,
                borderRight: "2px solid #111827",
                color: C.text,
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
                  borderRight: "1px solid rgba(0,0,0,0.15)",
                  textShadow: columnHeaderTextColor(r) === "#FFFFFF" ? "0 1px 1px rgba(0,0,0,0.35)" : "none",
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
                background: C.timeBg,
                borderRight: "2px solid #111827",
              }}
            >
              {slots.map((t, i) => (
                <div
                  key={i}
                  style={{
                    height: rowHeight,
                    fontSize: isMobile ? 12 : 12,
                    paddingLeft: isMobile ? 8 : 10,
                    fontWeight: 900,
                    display: "flex",
                    alignItems: "center",
                    background: C.timeBg,
                    color: C.text,
                    borderBottom: `1px solid ${C.timeLine}`, // ✅ righe 10 minuti ben visibili
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
                          border: "2px solid #111827",
                          borderRadius: 12,
                          padding: isMobile ? 6 : 6,
                          fontSize: isMobile ? 12 : 12,
                          boxShadow: "0 8px 18px rgba(0,0,0,0.22)",
                          overflow: "hidden",
                          color: "#111827",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <b style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {b.squad_name}
                          </b>
                          <span
                            style={{
                              background: pill.bg,
                              border: `2px solid ${pill.border}`,
                              color: pill.text,
                              padding: "2px 8px",
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
                        <div style={{ marginTop: 4, fontWeight: 900 }}>
                          {dayjs(b.start_at).format("HH:mm")}–{dayjs(b.end_at).format("HH:mm")}
                        </div>
                        <div style={{ fontSize: isMobile ? 11 : 11, opacity: 1, fontWeight: 900, color: "#111827" }}>
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
            background: C.overlay, // ✅ overlay più scuro
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
              background: C.cardBg,
              padding: isMobile ? 16 : 20,
              borderRadius: 16,
              width: 780,
              maxWidth: "95vw",
              maxHeight: "85vh",
              overflowY: "auto",
              border: `2px solid ${C.border}`,
              boxShadow: C.shadow,
              color: C.text,
            }}
          >
            <h3 style={{ marginTop: 0, fontWeight: 900, color: C.text }}>{openCreate ? "Nuova prenotazione" : "Dettagli prenotazione"}</h3>

            {/* FORM */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
              <div>
                <div style={hintStyle}>Risorsa</div>
                <div style={{ fontWeight: 900, fontSize: 16, color: C.text }}>{selectedResource?.name ?? "—"}</div>
              </div>

              <div>
                <div style={hintStyle}>Giorno</div>
                <div style={{ fontWeight: 900, fontSize: 16, color: C.text }}>{day.format("DD/MM/YYYY")}</div>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={labelStyle}>Squadra</span>
                <select
                  style={inputStyle}
                  value={squadId === "" ? "" : String(squadId)}
                  onChange={(e) => setSquadId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">— seleziona —</option>
                  {squads.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={labelStyle}>Tipo</span>
                <select style={inputStyle} value={bookingType} onChange={(e) => setBookingType(e.target.value as BookingType)}>
                  <option value="TRAINING">Allenamento</option>
                  <option value="MATCH">Partita</option>
                  <option value="MAINTENANCE">Manutenzione</option>
                </select>
              </label>

              {/* ✅ INIZIO - controlli a bottoni */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={labelStyle}>Inizio</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, alignItems: "stretch" }}>
                  <button type="button" style={stepBtnMinus} onClick={() => bumpStart(-stepMin)}>
                    −10
                  </button>
                  <div style={timeValueBox}>{startHHMM}</div>
                  <button type="button" style={stepBtnPlus} onClick={() => bumpStart(+stepMin)}>
                    +10
                  </button>
                </div>
                <div style={hintStyle}>Tap per correggere di 10 minuti</div>
              </div>

              {/* ✅ FINE - controlli a bottoni */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={labelStyle}>Fine</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, alignItems: "stretch" }}>
                  <button type="button" style={stepBtnMinus} onClick={() => bumpEnd(-stepMin)}>
                    −10
                  </button>
                  <div style={timeValueBox}>{endHHMM}</div>
                  <button type="button" style={stepBtnPlus} onClick={() => bumpEnd(+stepMin)}>
                    +10
                  </button>
                </div>
                <div style={hintStyle}>La fine viene auto-corretta se scende sotto l’inizio</div>
              </div>

              {!selectedResource || isLocker(selectedResource) || isMinibus(selectedResource) || isMiniField(selectedResource) ? null : (
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={labelStyle}>Campo</span>
                  <select style={inputStyle} value={fieldModeUI} onChange={(e) => setFieldModeUI(e.target.value as FieldModeUI)}>
                    <option value="FULL">Intero (A+B)</option>
                    <option value="HALF_A">Metà A</option>
                    <option value="HALF_B">Metà B</option>
                  </select>
                </label>
              )}

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={labelStyle}>Spogliatoio 1</span>
                <select
                  style={inputStyle}
                  value={locker1Id === "NONE" ? "NONE" : String(locker1Id)}
                  onChange={(e) => setLocker1Id(e.target.value === "NONE" ? "NONE" : Number(e.target.value))}
                >
                  <option value="NONE">— nessuno —</option>
                  {lockerResources.map((l) => (
                    <option key={l.id} value={String(l.id)}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={labelStyle}>Spogliatoio 2</span>
                <select
                  style={inputStyle}
                  value={locker2Id === "NONE" ? "NONE" : String(locker2Id)}
                  onChange={(e) => setLocker2Id(e.target.value === "NONE" ? "NONE" : Number(e.target.value))}
                >
                  <option value="NONE">— nessuno —</option>
                  {lockerResources.map((l) => (
                    <option key={l.id} value={String(l.id)}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={labelStyle}>Spogliatoi: minuti prima</span>
                <input style={inputStyle} type="number" value={lockerBeforeMin} onChange={(e) => setLockerBeforeMin(Number(e.target.value || 0))} />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={labelStyle}>Spogliatoi: minuti dopo</span>
                <input style={inputStyle} type="number" value={lockerAfterMin} onChange={(e) => setLockerAfterMin(Number(e.target.value || 0))} />
              </label>

              <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={labelStyle}>Note</span>
                <textarea
                  style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </label>

              {openCreate && (
                <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900, color: C.text }}>
                    <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} style={{ transform: "scale(1.2)" }} />
                    Ripeti ogni settimana
                  </label>

                  {isRecurring && (
                    <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900, color: C.text }}>
                      fino al:
                      <input style={inputStyle} type="date" value={recurringUntil} onChange={(e) => setRecurringUntil(e.target.value)} />
                    </label>
                  )}
                </div>
              )}
            </div>

            {submitErr && <div style={{ color: "#991B1B", marginTop: 12, fontWeight: 900 }}>{submitErr}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button style={btnStyleGhost} onClick={closeAllModals}>
                Chiudi
              </button>

              {openCreate && (
                <button style={btnStylePrimary} onClick={() => createOrUpdateBooking("create")} disabled={submitting}>
                  {submitting ? "Creo…" : "Crea"}
                </button>
              )}

              {openDetails && (
                <>
                  <button style={btnStyleGhost} onClick={deleteBooking} disabled={submitting}>
                    Elimina
                  </button>
                  <button style={btnStylePrimary} onClick={() => createOrUpdateBooking("update")} disabled={submitting}>
                    Salva
                  </button>
                </>
              )}
            </div>

            {openDetails && activeBookingId && (
              <div style={{ marginTop: 10, fontSize: 12, color: C.textMuted, fontWeight: 900 }}>
                Booking ID: <b style={{ color: C.text }}>{activeBookingId}</b>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
