'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function SquadPickerOrLabel({ onSelect }) {
  const [squads, setSquads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('my_managed_squads')
      .select('id, name')
      .then(({ data }) => {
        setSquads(data || []);
        setLoading(false);
        if (data?.length === 1) {
          onSelect(data[0].id);
        }
      });
  }, [onSelect]);

  if (loading) return <div>Caricamento…</div>;

  if (squads.length === 0) {
    return <div>Non hai squadre assegnate</div>;
  }

  if (squads.length === 1) {
    return <div>Squadra: <strong>{squads[0].name}</strong></div>;
  }

  return (
    <select onChange={(e) => onSelect(Number(e.target.value))}>
      <option value="">Seleziona squadra</option>
      {squads.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
