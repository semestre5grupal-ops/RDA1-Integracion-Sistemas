/**
 * Normaliza y formatea el nombre del régimen de alojamiento
 * evitando códigos crudos como 'SOLO_HABITACION'.
 */
export function formatearRegimen(plan) {
  if (!plan) return 'Solo habitación';
  const raw = String(plan).trim();
  const map = {
    SOLO_HABITACION: 'Solo habitación',
    SOLO_ALOJAMIENTO: 'Solo alojamiento',
    ROOM_ONLY: 'Solo habitación',
    DESAYUNO: 'Desayuno incluido',
    DESAYUNO_INCLUIDO: 'Desayuno incluido',
    BED_AND_BREAKFAST: 'Desayuno incluido',
    MEDIA_PENSION: 'Media pensión',
    HALF_BOARD: 'Media pensión',
    PENSION_COMPLETA: 'Pensión completa',
    FULL_BOARD: 'Pensión completa',
    TODO_INCLUIDO: 'Todo incluido',
    ALL_INCLUSIVE: 'Todo incluido',
  };
  const upper = raw.toUpperCase();
  if (map[raw]) return map[raw];
  if (map[upper]) return map[upper];
  if (/^[A-Z0-9_]+$/.test(raw)) {
    return raw
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase());
  }
  return raw;
}
