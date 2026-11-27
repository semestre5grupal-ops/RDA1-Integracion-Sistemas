/**
 * Keep-Alive Script para Supabase (Proyecto Limpio: icpxceybcqkmkjuahkam)
 *
 * Propósito:
 * Supabase en su plan gratuito (Free Tier) pausa automáticamente los proyectos
 * que no registran actividad durante 7 días consecutivos.
 *
 * Este script realiza un ping liviano al endpoint de salud (/auth/v1/health) de GoTrue.
 * - Consume menos de 150 bytes de transferencia (cero impacto en la cuota de egress).
 * - Registra la actividad necesaria en Supabase para evitar el modo de suspensión ("sleep/pause").
 *
 * Uso manual:
 *   node scripts/keep_alive_supabase.js
 *
 * Uso continuo (cada 2 días):
 *   node scripts/keep_alive_supabase.js --daemon
 */

require('dotenv').config();
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://icpxceybcqkmkjuahkam.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SECRET_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljcHhjZXliY3FrbWtqdWFoa2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU3ODM2MDgsImV4cCI6MjExMTM1OTYwOH0.lGRzPGdpdxfdFwHv9Uz68HrWzx56T8fVvqcLZh7zrbw';

function pingSupabase() {
  const url = new URL('/auth/v1/health', SUPABASE_URL);

  const options = {
    method: 'GET',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'User-Agent': 'BookingCentral-KeepAlive/1.0',
    },
    timeout: 10000,
  };

  const req = https.request(url, options, (res) => {
    let raw = '';
    res.on('data', (chunk) => (raw += chunk));
    res.on('end', () => {
      const timestamp = new Date().toISOString();
      if (res.statusCode === 200) {
        console.log(`[${timestamp}] [OK] Supabase Keep-Alive exitoso: HTTP ${res.statusCode} (Proyecto activo en ${SUPABASE_URL})`);
      } else {
        console.warn(`[${timestamp}] [WARN] Supabase respondió con código ${res.statusCode}: ${raw}`);
      }
    });
  });

  req.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] [ERROR] No se pudo contactar a Supabase: ${err.message}`);
  });

  req.on('timeout', () => {
    req.destroy();
    console.error(`[${new Date().toISOString()}] [TIMEOUT] La conexión a Supabase superó los 10 segundos.`);
  });

  req.end();
}

// Ejecutar ping inmediato
pingSupabase();

// Si se pasa --daemon, programar ping recurrente cada 48 horas (172,800,000 ms)
if (process.argv.includes('--daemon')) {
  const DOS_DIAS_MS = 48 * 60 * 60 * 1000;
  console.log(`[*] Modo demonio activado: ejecutando ping cada 48 horas para prevenir suspensión.`);
  setInterval(pingSupabase, DOS_DIAS_MS);
}
