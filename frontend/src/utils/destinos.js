// Catálogo de destinos para el autocompletado de la barra de búsqueda de alojamientos.
// Incluye los destinos que existen en la base de datos (Quito, Cancún, Cartagena, Medellín,
// Punta Cana, Cusco) y los destinos de Ecuador que se muestran en la página de inicio.
export const DESTINOS = [
  { nombre: 'Quito', region: 'Pichincha', pais: 'Ecuador', popular: true },
  { nombre: 'Guayaquil', region: 'Guayas', pais: 'Ecuador', popular: true },
  { nombre: 'Cuenca', region: 'Azuay', pais: 'Ecuador', popular: true },
  { nombre: 'Baños de Agua Santa', region: 'Tungurahua', pais: 'Ecuador', popular: true },
  { nombre: 'Montañita', region: 'Santa Elena', pais: 'Ecuador', popular: true },
  { nombre: 'Islas Galápagos', region: 'Galápagos', pais: 'Ecuador' },
  { nombre: 'Puerto Ayora', region: 'Galápagos', pais: 'Ecuador' },
  { nombre: 'Salinas', region: 'Santa Elena', pais: 'Ecuador' },
  { nombre: 'Manta', region: 'Manabí', pais: 'Ecuador' },
  { nombre: 'Puerto López', region: 'Manabí', pais: 'Ecuador' },
  { nombre: 'Mindo', region: 'Pichincha', pais: 'Ecuador' },
  { nombre: 'Otavalo', region: 'Imbabura', pais: 'Ecuador' },
  { nombre: 'Tena', region: 'Napo', pais: 'Ecuador' },
  { nombre: 'Loja', region: 'Loja', pais: 'Ecuador' },
  { nombre: 'Ambato', region: 'Tungurahua', pais: 'Ecuador' },
  { nombre: 'Riobamba', region: 'Chimborazo', pais: 'Ecuador' },
  { nombre: 'Esmeraldas', region: 'Esmeraldas', pais: 'Ecuador' },
  { nombre: 'Cancún', region: 'Quintana Roo', pais: 'México', popular: true },
  { nombre: 'Cartagena', region: 'Bolívar', pais: 'Colombia' },
  { nombre: 'Medellín', region: 'Antioquia', pais: 'Colombia' },
  { nombre: 'Punta Cana', region: 'La Altagracia', pais: 'República Dominicana' },
  { nombre: 'Cusco', region: 'Cusco', pais: 'Perú' },
];

const MAX_SUGERENCIAS = 6;
const MAX_LONGITUD = 80;

// Minúsculas, sin tildes y con espacios colapsados: "  QUITO " y "quíto" -> "quito".
export function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Limpia lo que escribe el usuario: solo letras (con tildes/ñ), espacios y signos usados en
// nombres de lugares u hoteles. Devuelve también si se quitó algo para poder avisarle.
export function sanitizarDestino(raw) {
  const sinInvalidos = String(raw ?? '')
    .replace(/[^\p{L}\s,.'&-]/gu, '')
    .replace(/^\s+/, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, MAX_LONGITUD);
  return { valor: sinInvalidos, huboCambios: sinInvalidos !== raw };
}

// Prioridad de coincidencia (menor = mejor). null si no coincide.
function puntuar(destino, consulta) {
  const nombre = normalizarTexto(destino.nombre);
  if (nombre === consulta) return 0;
  if (nombre.startsWith(consulta)) return 1;
  if (nombre.split(' ').some((palabra) => palabra.startsWith(consulta))) return 2;
  if (normalizarTexto(destino.region).startsWith(consulta)) return 3;
  if (normalizarTexto(destino.pais).startsWith(consulta)) return 4;
  return null;
}

// Sugerencias para el texto escrito. Igual que Booking: al escribir "Quito" solo aparece Quito,
// no cualquier destino que contenga esas letras en medio de una palabra.
export function buscarDestinos(texto, catalogo = DESTINOS) {
  const consulta = normalizarTexto(texto);
  if (!consulta) return catalogo.filter((d) => d.popular).slice(0, MAX_SUGERENCIAS);

  return catalogo
    .map((destino) => ({ destino, puntaje: puntuar(destino, consulta) }))
    .filter((r) => r.puntaje !== null)
    .sort((a, b) => a.puntaje - b.puntaje || a.destino.nombre.localeCompare(b.destino.nombre, 'es'))
    .slice(0, MAX_SUGERENCIAS)
    .map((r) => r.destino);
}

// Devuelve el destino del catálogo que coincide exactamente (ignorando mayúsculas y tildes).
export function destinoExacto(texto, catalogo = DESTINOS) {
  const consulta = normalizarTexto(texto);
  if (!consulta) return null;
  return catalogo.find((d) => normalizarTexto(d.nombre) === consulta) || null;
}
