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
   Booking / Reservation colors (NEW)
   - Centralized palette for "a colpo d'occhio"
======================= */

export const bookingCategoryColors = {
  TRAINING: "#2563EB", // blu
  MATCH: "#DC2626", // rosso
  TOURNAMENT: "#7C3AED", // viola
  YOUTH: "#16A34A", // verde
  SERVICES: "#D97706", // ambra
  OTHER: "#334155", // slate
} as const;

export type BookingCategoryColorKey = keyof typeof bookingCategoryColors;

/**
 * Returns a strong border + readable text, given a category base color.
 * Does not assume any specific booking type shape: caller passes a key.
 */
export function bookingStyleFromCategory(
  category: BookingCategoryColorKey
): CSSProperties {
  const base = bookingCategoryColors[category];
  const border = darkenHex(base, 0.18);

  // Text on solid base color: pick white/near-black by luma
  const rgb = hexToRgb(base);
  const textColor = rgb && yiqLuma(rgb) >= 165 ? "#0B1220" : "#FFFFFF";

  return {
    background: base,
    color: textColor,
    border: `3px solid ${border}`, // <-- bordo più marcato
    boxShadow: "0 0 0 1px rgba(0,0,0,0.25), 0 6px 16px rgba(0,0,0,0.20)",
  };
}
