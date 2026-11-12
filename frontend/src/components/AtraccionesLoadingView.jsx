import React from 'react';
import { AlojamientosLoadingView } from './AlojamientosLoadingView';

const FRASES_ATRACCIONES = [
  'Buscando las mejores ofertas entre cientos de experiencias...',
  'Verificando disponibilidad de turnos y cupos en tiempo real...',
  'Comparando tours, actividades y guías locales certificados...',
  'Casi listo, organizando tus experiencias...',
];

export function AtraccionesLoadingView({ titulo, subtitulo = 'Conectando con operadores turísticos verificados en Ecuador' }) {
  const frases = titulo ? [titulo, ...FRASES_ATRACCIONES] : FRASES_ATRACCIONES;
  return <AlojamientosLoadingView frases={frases} subtitulo={subtitulo} />;
}

export default AtraccionesLoadingView;


