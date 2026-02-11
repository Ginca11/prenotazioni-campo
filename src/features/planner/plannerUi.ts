// src/features/planner/plannerUi.ts

import type { CSSProperties } from "react";

/* =======================
   Internal helpers
======================= */

function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return { r, g, b };
}

function yiqLuma(rgb: { r: number; g: number; b: number }) {
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
}

function darkenHex(hex: string, amount: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const clamp = (n: number) => Math.max(0, Math.min(255, n));

  const r = clamp(Math.round(rgb.r * (1 - amount)));
  const g = clamp(Math.round(rgb.g * (1 - amount)));
  const b = clamp(Math.round(rgb.b * (1 - amount)));

  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/* =======================
   Resource display
======================= */

export function displayResourceName(r: { name: string; type: string }) {
  if (r.type === "LOCKER") {
    switch (r.name) {
      case "Spogliatoio 1":
        return "Spo - A";
      case "Spogliatoio 2":
        return "Spo - B";
      case "Spogliatoio 3":
        return "Spo - C";
      case "Spogliatoio 4":
        return "Spo - D";
      default:
        return r.name;
    }
  }
  return r.name;
}

/* =======================
   Column width
======================= */

export function colWidthFor(
  r: { type: string; name: string },
  fieldColWidth?: number
) {
  const SCALE = 1.15; // riduzione planner del 10%
  const base = Math.round(
    (Number.isFinite(fieldColWidth) ? fieldColWidth : 320) * SCALE
  );

  if (r.name === "SALA") return Math.round(base * 0.25);
  if (r.type === "LOCKER") return Math.round(base * 0.4);
  if (r.type === "MINIBUS") return Math.round(base * 0.4);

  return base;
}

/* =======================
   Column background
======================= */

export function columnBg(
  r: { type: string; name: string },
  opts?: {
    fieldBg?: string;
    miniFieldBg?: string;
    lockerBg?: string;
    minibusBg?: string;
    defaultBg?: string;
    salaBg?: string;
  }
) {
  const {
    fieldBg = "#4D7C0F", // Campo A / B
    miniFieldBg = "#65A30D", // Campetto
    minibusBg = "#E5E7EB",
    salaBg = "#BAE6FD",
    defaultBg = "#FFFFFF",
  } = opts ?? {};

  if (r.type === "FIELD_HALF") return fieldBg;
  if (r.type === "MINI_FIELD") return miniFieldBg;

  if (r.type === "LOCKER") {
    switch (r.name) {
      case "Spogliatoio 1":
        return "#FDE68A"; // giallo chiaro
      case "Spogliatoio 2":
        return "#F59E0B"; // arancio
      case "Spogliatoio 3":
        return "#FCD34D"; // giallo medio
      case "Spogliatoio 4":
        return "#D97706"; // arancio scuro
      default:
        return "#FDE68A";
    }
  }

  if (r.type === "MINIBUS") {
    if (r.name === "SALA") return salaBg;
    return minibusBg;
  }

  return defaultBg;
}

/* =======================
   Header readability
======================= */

function columnHeaderBg(r: { type: string; name: string }) {
  const bg = columnBg(r);
  if (!bg.startsWith("#")) return bg;
  return darkenHex(bg, 0.28);
}

export function columnHeaderTextColor(r: { type: string; name: string }) {
  const bg = columnHeaderBg(r);
  const rgb = bg.startsWith("#") ? hexToRgb(bg) : null;

  if (!rgb) return "#111827";
  return yiqLuma(rgb) >= 160 ? "#111827" : "#FFFFFF";
}

/* =======================
   Grid lines
======================= */

export function columnGridLine(r: { type: string; name: string }) {
  if (r.type === "FIELD_HALF") return "rgba(0,0,0,0.25)";
  if (r.type === "MINI_FIELD") return "rgba(0,0,0,0.22)";
  if (r.type === "LOCKER") return "rgba(0,0,0,0.18)";
  if (r.type === "MINIBUS") return "rgba(0,0,0,0.16)";
  return "rgba(0,0,0,0.14)";
}

/* =======================
   Column header style
======================= */

export function columnHeaderStyle(
  r: { type: string; name: string },
  fieldColWidth: number,
  headerPad: number | string
): CSSProperties {
  const textColor = columnHeaderTextColor(r);

  return {
    width: colWidthFor(r, fieldColWidth),
    padding: headerPad,
    fontWeight: 900,
    whiteSpace: "nowrap",
    background: columnHeaderBg(r),
    color: textColor,
    borderRight: "1px solid rgba(0,0,0,0.25)",
    borderBottom: "2px solid rgba(0,0,0,0.4)",
    letterSpacing: "0.3px",
    textShadow:
      textColor === "#FFFFFF"
        ? "0 2px 6px rgba(0,0,0,0.55)"
        : "none",
  };
}

/* =======================
   Booking / Reservation colors (UPDATED)
   - Same category => same color (robust)
======================= */

export const bookingCategoryColors = {
  // Settori / squadre (esempio)
  PULCINI: "#F9EB4D",
  PRIMI_CALCI: "#FBBF24",
  ESORDIENTI: "#60A5FA",
  GIOVANISSIMI: "#0C1EAC",
  ALLIEVI: "#7C3AED",
  JUNIORES: "#DC2626",
  SENIOR: "#16A34A",

  // Tipologie generiche
  TRAINING: "#60A5FA",
  MATCH: "#DC2626",
  TOURNAMENT: "#7C3AED",
  YOUTH: "#FBBF24",
  SERVICES: "#D97706",
  OTHER: "#334155",
} as const;

export type BookingCategoryColorKey = keyof typeof bookingCategoryColors;

/** Normalizza stringhe tipo "Pulcini 2016", "pulcini", "Pulcini (A)" -> "PULCINI" quando possibile */
function normalizeCategory(raw?: string | null): string {
  const s = (raw ?? "")
    .toString()
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // rimuove accenti
    .replace(/[^A-Z0-9 ]+/g, " ") // toglie simboli
    .replace(/\s+/g, " ")
    .trim();

  return s;
}

/** Mappa sinonimi/varianti comuni -> chiave canonica */
function categoryToKey(raw?: string | null): BookingCategoryColorKey | null {
  const s = normalizeCategory(raw);

  // match diretti (già chiave)
  if (s && (s as BookingCategoryColorKey) in bookingCategoryColors) {
    return s as BookingCategoryColorKey;
  }

  // sinonimi / contains
  const has = (needle: string) => s.includes(needle);

  if (has("PULCIN")) return "PULCINI";
  if (has("PRIMI CALCI") || has("PRIMI") || has("CALCI")) return "PRIMI_CALCI";
  if (has("ESORD")) return "ESORDIENTI";
  if (has("GIOVAN")) return "GIOVANISSIMI";
  if (has("ALLIEV")) return "ALLIEVI";
  if (has("JUNIOR") || has("JUNIORES")) return "JUNIORES";
  if (has("SENIOR") || has("PRIMA SQUADRA")) return "SENIOR";

  if (has("TRAIN") || has("ALLEN")) return "TRAINING";
  if (has("MATCH") || has("PARTITA") || has("GARA")) return "MATCH";
  if (has("TORNE") || has("EVENT")) return "TOURNAMENT";
  if (has("YOUTH") || has("GIOVANI") || has("SCUOLA")) return "YOUTH";
  if (has("SERVIZ") || has("SALA") || has("MINIBUS") || has("SPOGL")) return "SERVICES";

  return null;
}

/** Fallback deterministico: stessa stringa -> stesso colore, anche se non mappata */
function stableColorFromString(raw?: string | null): string {
  const s = normalizeCategory(raw) || "OTHER";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;

  const palette = Object.values(bookingCategoryColors);
  return palette[h % palette.length];
}

/**
 * Usa questa funzione passando la categoria "raw" che hai nel booking.
 * Se è Pulcini (anche con anno/varianti) -> sempre stesso colore.
 */
export function bookingStyleFromAnyCategory(rawCategory?: string | null): CSSProperties {
  const key = categoryToKey(rawCategory);
  const base = key ? bookingCategoryColors[key] : stableColorFromString(rawCategory);
  const border = darkenHex(base, 0.22);

  const rgb = hexToRgb(base);
  const textColor = rgb && yiqLuma(rgb) >= 175 ? "#0B1220" : "#FFFFFF";

  return {
    background: base,
    color: textColor,
    border: `3px solid ${border}`,
    boxShadow: "0 0 0 1px rgba(0,0,0,0.25), 0 6px 16px rgba(0,0,0,0.20)",
  };
}
/** Mantengo la vecchia API: accetta sia key canonica che stringa "raw" */
export function bookingStyleFromCategory(
  category: BookingCategoryColorKey
): CSSProperties;
export function bookingStyleFromCategory(category: string | null | undefined): CSSProperties;
export function bookingStyleFromCategory(category: any): CSSProperties {
  return bookingStyleFromAnyCategory(category);
}

