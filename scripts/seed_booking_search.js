const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL. Ejecuta: DATABASE_URL="postgresql://..." node <script>  (nunca la escribas en el código).');
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const quitoProperties = [
  {
    id: 'quito-terraza-01',
    nombre: 'Hostal La Terraza - Roof Terrace Overlooking The North and Historic Centre',
    descripcion: 'Hostal emblemático con terraza panorámica hacia el norte y centro histórico de Quito. Desayuno incluido con vistas espectaculares a las montañas.',
    tipo_propiedad: 'Hostales',
    tipo_alojamiento: 'Double Room',
    destino: 'Quito',
    precio_noche: 28.00,
    moneda: 'USD',
    capacidad_adultos: 2,
    capacidad_ninos: 0,
    habitaciones: 1,
    camas: 1,
    banos: 1.0,
    tiene_piscina: false,
    photos: JSON.stringify([
      { url: 'https://cf.bstatic.com/xdata/images/hotel/square240/562625095.webp?k=3f48ea0c382454958075b68bb79a66b0a70a6ca7c1ff35947552ff1eb9df4996&o=', caption: 'Terraza con vista al centro histórico' },
      { url: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800', caption: 'Habitación doble confortable' }
    ]),
    amenidades: JSON.stringify(['Desayuno buffet incluido', 'WiFi de alta velocidad', 'Terraza panorámica', 'Cancelación gratis', 'Sin pago por adelantado', 'Baño privado', 'Recepción 24 horas']),
    host: JSON.stringify({ nombre: 'Hostal La Terraza Team', es_superhost: true }),
    ratings: JSON.stringify({ score: 8.9, label: 'Fabulous', number_of_reviews: 459, comfort: 8.8, cleanliness: 9.0, location: 9.3 }),
    ubicacion: JSON.stringify({ address: 'Los Ríos y Chile, Centro', city: 'Quito', neighbourhood: 'Centro Histórico', distance_centre_km: 1.4 })
  },
  {
    id: 'quito-epiq-02',
    nombre: 'Top Rentals EpiQ',
    descripcion: 'Edificio de apartamentos contemporáneos de lujo con diseño de autor en La Carolina. Piscina climatizada, gimnasio y vistas panorámicas de la ciudad.',
    tipo_propiedad: 'Apartamentos',
    tipo_alojamiento: 'Two-Bedroom Apartment',
    destino: 'Quito',
    precio_noche: 91.00,
    moneda: 'USD',
    capacidad_adultos: 4,
    capacidad_ninos: 2,
    habitaciones: 2,
    camas: 3,
    banos: 2.0,
    tiene_piscina: true,
    photos: JSON.stringify([
      { url: 'https://cf.bstatic.com/xdata/images/hotel/square240/833148758.webp?k=c65fd2df00188facb538086ee3d0f8b3c0c95e98fecf8552a302a91ee9167cb0&o=', caption: 'Piscina panorámica con vista al parque La Carolina' },
      { url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800', caption: 'Sala de estar moderna' }
    ]),
    amenidades: JSON.stringify(['Piscina climatizada', 'WiFi de alta velocidad', 'Cocina equipada', 'Estacionamiento gratuito', 'Ascensor', 'Gimnasio']),
    host: JSON.stringify({ nombre: 'Top Rentals Luxury', es_superhost: true }),
    ratings: JSON.stringify({ score: 8.7, label: 'Fabulous', number_of_reviews: 24, comfort: 9.3, cleanliness: 9.4, location: 9.6 }),
    ubicacion: JSON.stringify({ address: 'Av. Eloy Alfaro y República', city: 'Quito', neighbourhood: 'La Carolina', distance_centre_km: 4.6 })
  },
  {
    id: 'quito-tobar-03',
    nombre: 'Casona Tobar Hotel',
    descripcion: 'Mansión colonial restaurada en el corazón del Centro Histórico de Quito. Elegancia atemporal, patio central con fuentes y atención de primer nivel.',
    tipo_propiedad: 'Hoteles',
    tipo_alojamiento: 'Twin Room',
    destino: 'Quito',
    precio_noche: 40.00,
    moneda: 'USD',
    capacidad_adultos: 2,
    capacidad_ninos: 0,
    habitaciones: 1,
    camas: 2,
    banos: 1.0,
    tiene_piscina: false,
    photos: JSON.stringify([
      { url: 'https://cf.bstatic.com/xdata/images/hotel/square240/476906233.webp?k=c64639e7264fc8c3d7bf4174363e72ec0b01b69116e0b7f6fa286e1074a386c9&o=', caption: 'Patio interior colonial iluminado' }
    ]),
    amenidades: JSON.stringify(['Desayuno buffet incluido', 'WiFi de alta velocidad', 'Cancelación gratis', 'Sin pago por adelantado', 'Baño privado', 'Restaurante']),
    host: JSON.stringify({ nombre: 'Casona Tobar Hospitality', es_superhost: true }),
    ratings: JSON.stringify({ score: 9.2, label: 'Superb', number_of_reviews: 337, comfort: 9.5, cleanliness: 9.6, location: 9.8 }),
    ubicacion: JSON.stringify({ address: 'García Moreno y Sucre', city: 'Quito', neighbourhood: 'Centro Histórico', distance_centre_km: 0.5 })
  },
  {
    id: 'quito-ejido-04',
    nombre: 'Hotel El Ejido',
    descripcion: 'Ubicación estratégica frente al parque El Ejido. Habitaciones cómodas, limpias y excelente conectividad para viajes de turismo y negocios.',
    tipo_propiedad: 'Hoteles',
    tipo_alojamiento: 'Triple Room',
    destino: 'Quito',
    precio_noche: 47.50,
    moneda: 'USD',
    capacidad_adultos: 3,
    capacidad_ninos: 1,
    habitaciones: 1,
    camas: 3,
    banos: 1.0,
    tiene_piscina: false,
    photos: JSON.stringify([
      { url: 'https://cf.bstatic.com/xdata/images/hotel/square240/256860088.webp?k=bdfcb9f64bf6cb512e022b7a4be463fc0fa6020df20c992c6e6cbdfbb7ef2b77&o=', caption: 'Fachada del hotel frente a El Ejido' }
    ]),
    amenidades: JSON.stringify(['WiFi de alta velocidad', 'Cancelación gratis', 'Sin pago por adelantado', 'Estacionamiento', 'Baño privado']),
    host: JSON.stringify({ nombre: 'Hotel El Ejido Admin', es_superhost: false }),
    ratings: JSON.stringify({ score: 8.9, label: 'Fabulous', number_of_reviews: 7, comfort: 8.1, cleanliness: 8.5, location: 9.0 }),
    ubicacion: JSON.stringify({ address: 'Av. 6 de Diciembre y Tarqui', city: 'Quito', neighbourhood: 'La Mariscal', distance_centre_km: 1.7 })
  },
  {
    id: 'quito-latitud-05',
    nombre: 'Hostal Latitud Ecuem',
    descripcion: 'Alojamiento céntrico en edificio de arquitectura clásica republicana. Excelente relación calidad-precio a pasos de plazas y museos.',
    tipo_propiedad: 'Hostales',
    tipo_alojamiento: 'Double Room',
    destino: 'Quito',
    precio_noche: 10.24,
    moneda: 'USD',
    capacidad_adultos: 2,
    capacidad_ninos: 0,
    habitaciones: 1,
    camas: 1,
    banos: 1.0,
    tiene_piscina: false,
    photos: JSON.stringify([
      { url: 'https://cf.bstatic.com/xdata/images/hotel/square240/394142468.webp?k=a9e332f14374b8ca30e15995aa421cfba18f0907a726715f5d6065538e1fe7ee&o=', caption: 'Edificio clásico en esquina del centro' }
    ]),
    amenidades: JSON.stringify(['WiFi gratis', 'Sin pago por adelantado', 'Baño privado', 'Recepción 24 horas']),
    host: JSON.stringify({ nombre: 'Latitud Ecuem Host', es_superhost: false }),
    ratings: JSON.stringify({ score: 8.2, label: 'Very good', number_of_reviews: 291, comfort: 8.1, cleanliness: 8.3, location: 9.1 }),
    ubicacion: JSON.stringify({ address: 'Flores y Mejía', city: 'Quito', neighbourhood: 'Centro Histórico', distance_centre_km: 0.9 })
  },
  {
    id: 'quito-artplaza-06',
    nombre: 'Art Plaza Boutique Hotel',
    descripcion: 'Encantador hotel boutique en la zona cultural de La Mariscal con obras de arte locales, ambiente acogedor y excelente gastronomía.',
    tipo_propiedad: 'Hoteles',
    tipo_alojamiento: 'Twin Room',
    destino: 'Quito',
    precio_noche: 40.00,
    moneda: 'USD',
    capacidad_adultos: 2,
    capacidad_ninos: 0,
    habitaciones: 1,
    camas: 2,
    banos: 1.0,
    tiene_piscina: false,
    photos: JSON.stringify([
      { url: 'https://cf.bstatic.com/xdata/images/hotel/square240/499692484.webp?k=424e75d5a7d65b757f1396b270732ca4a44f77c3e536bf30be08e33e9d89163b&o=', caption: 'Vista hacia la Basílica del Voto Nacional' }
    ]),
    amenidades: JSON.stringify(['WiFi de alta velocidad', 'Cancelación gratis', 'Sin pago por adelantado', 'Baño privado', 'Cafetería']),
    host: JSON.stringify({ nombre: 'Art Plaza Team', es_superhost: true }),
    ratings: JSON.stringify({ score: 9.0, label: 'Superb', number_of_reviews: 317, comfort: 9.1, cleanliness: 9.2, location: 9.4 }),
    ubicacion: JSON.stringify({ address: 'Foch y Juan León Mera', city: 'Quito', neighbourhood: 'La Mariscal', distance_centre_km: 2.9 })
  },
  {
    id: 'quito-rossamia-07',
    nombre: 'Rossa Mia Hotel Boutique',
    descripcion: 'Exclusiva casona patrimonial decorada con candelabros, pisos de madera noble y techos altos. Balcón privado hacia las calles adoquinadas del centro histórico.',
    tipo_propiedad: 'Hoteles',
    tipo_alojamiento: 'Family Room with Balcony',
    destino: 'Quito',
    precio_noche: 112.00,
    moneda: 'USD',
    capacidad_adultos: 4,
    capacidad_ninos: 2,
    habitaciones: 2,
    camas: 4,
    banos: 1.5,
    tiene_piscina: false,
    photos: JSON.stringify([
      { url: 'https://cf.bstatic.com/xdata/images/hotel/square240/505322967.webp?k=0ee9957d5904fc49377759b66236b2f768b556f8f53c153ea49bb652ec04ba2e&o=', caption: 'Habitación familiar colonial con balcón' }
    ]),
    amenidades: JSON.stringify(['Desayuno buffet incluido', 'WiFi de alta velocidad', 'Cancelación gratis', 'Balcón privado', 'Baño privado']),
    host: JSON.stringify({ nombre: 'Rossa Mia Boutique Admin', es_superhost: true }),
    ratings: JSON.stringify({ score: 8.9, label: 'Fabulous', number_of_reviews: 74, comfort: 9.2, cleanliness: 9.3, location: 9.7 }),
    ubicacion: JSON.stringify({ address: 'Junín y San Marcos', city: 'Quito', neighbourhood: 'Centro Histórico', distance_centre_km: 0.5 })
  }
];

async function run() {
  await client.connect();
  for (const p of quitoProperties) {
    await client.query(`
      INSERT INTO alojamientos (
        id, nombre, descripcion, tipo_propiedad, tipo_alojamiento, destino, precio_noche, moneda,
        capacidad_adultos, capacidad_ninos, habitaciones, camas, banos, tiene_piscina,
        photos, amenidades, host, ratings, ubicacion
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (id) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        descripcion = EXCLUDED.descripcion,
        tipo_propiedad = EXCLUDED.tipo_propiedad,
        tipo_alojamiento = EXCLUDED.tipo_alojamiento,
        precio_noche = EXCLUDED.precio_noche,
        photos = EXCLUDED.photos,
        amenidades = EXCLUDED.amenidades,
        ratings = EXCLUDED.ratings,
        ubicacion = EXCLUDED.ubicacion;
    `, [
      p.id, p.nombre, p.descripcion, p.tipo_propiedad, p.tipo_alojamiento, p.destino, p.precio_noche, p.moneda,
      p.capacidad_adultos, p.capacidad_ninos, p.habitaciones, p.camas, p.banos, p.tiene_piscina,
      p.photos, p.amenidades, p.host, p.ratings, p.ubicacion
    ]);
  }
  console.log('Seeded Quito properties successfully!');
  const res = await client.query("SELECT count(*) FROM alojamientos WHERE destino ILIKE '%quito%'");
  console.log('Total Quito properties:', res.rows[0].count);
  await client.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
