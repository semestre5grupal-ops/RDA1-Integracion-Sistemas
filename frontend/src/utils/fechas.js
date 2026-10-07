// Fecha local `YYYY-MM-DD` a `dias` días de hoy. Se usa para las fechas por defecto
// de la búsqueda: con fechas fijas ("2026-10-09") el formulario quedaba en el
// pasado al día siguiente y el backend rechaza llegadas pasadas.
export function fechaLocal(dias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
