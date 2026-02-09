// src/features/planner/uiTokens.ts
import type { CSSProperties } from "react";

/** Token UI (alto contrasto) condivisi tra daily e weekly */
export const C = {
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
} as const;

export const btnStylePrimary: CSSProperties = {
  background: C.buttonBg,
  color: C.buttonText,
  border: `2px solid ${C.buttonBorder}`,
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 900,
  cursor: "pointer",
};

export const btnStyleGhost: CSSProperties = {
  background: C.buttonGhostBg,
  color: C.buttonGhostText,
  border: `2px solid ${C.buttonBorder}`,
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 900,
  cursor: "pointer",
};
