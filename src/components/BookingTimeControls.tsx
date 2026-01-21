import * as React from "react";

const STEP_MIN = 10;

function addMinutes(d: Date, mins: number) {
  return new Date(d.getTime() + mins * 60_000);
}

function ensureEndAfterStart(start: Date, end: Date) {
  if (end.getTime() <= start.getTime()) return addMinutes(start, STEP_MIN);
  return end;
}

function BigStepButton({
  label,
  variant,
  onClick,
}: {
  label: string;
  variant: "minus" | "plus";
  onClick: () => void;
}) {
  const base =
    "h-14 min-w-[96px] px-5 rounded-2xl text-base font-bold shadow-sm active:scale-[0.98] transition touch-manipulation";
  const minus = "bg-green-200 text-green-950 hover:bg-green-300";
  const plus = "bg-orange-200 text-orange-950 hover:bg-orange-300";

  return (
    <button
      type="button"
      className={`${base} ${variant === "minus" ? minus : plus}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function TimeRow({
  title,
  value,
  onMinus,
  onPlus,
}: {
  title: "Inizio" | "Fine";
  value: Date;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const fmt = (d: Date) =>
    d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="py-3">
      <div className="flex items-end justify-between gap-4">
        <div className="text-sm font-semibold opacity-80">{title}</div>
        <div className="text-3xl font-extrabold tabular-nums">{fmt(value)}</div>
      </div>

      <div className="mt-3 flex gap-3">
        <BigStepButton label="-10" variant="minus" onClick={onMinus} />
        <BigStepButton label="+10" variant="plus" onClick={onPlus} />
      </div>
    </div>
  );
}

export function BookingTimeControls({
  initialStart,
}: {
  initialStart: Date; // lo passi dal click sul planner
}) {
  const [start, setStart] = React.useState<Date>(initialStart);
  const [end, setEnd] = React.useState<Date>(addMinutes(initialStart, 120));

  const setStartSafe = (next: Date) => {
    setStart(next);
    setEnd((prevEnd) => {
      // Regola: se start supera/uguaglia end -> end = start + 10
      if (next.getTime() >= prevEnd.getTime()) return addMinutes(next, STEP_MIN);
      return prevEnd;
    });
  };

  const setEndSafe = (next: Date) => {
    // Regola: se end scende sotto/uguaglia start -> end = start + 10
    setEnd(ensureEndAfterStart(start, next));
  };

  const minusStart = () => setStartSafe(addMinutes(start, -STEP_MIN));
  const plusStart = () => setStartSafe(addMinutes(start, +STEP_MIN));
  const minusEnd = () => setEndSafe(addMinutes(end, -STEP_MIN));
  const plusEnd = () => setEndSafe(addMinutes(end, +STEP_MIN));

  const durationMin = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));

  return (
    <div className="rounded-3xl border bg-white p-4 sm:p-5">
      <TimeRow title="Inizio" value={start} onMinus={minusStart} onPlus={plusStart} />
      <div className="h-px bg-black/10" />
      <TimeRow title="Fine" value={end} onMinus={minusEnd} onPlus={plusEnd} />

      {/* Info opzionale (non è un controllo) */}
      <div className="mt-2 text-sm opacity-70">
        Durata: {Math.floor(durationMin / 60)}h {durationMin % 60}m
      </div>
    </div>
  );
}
