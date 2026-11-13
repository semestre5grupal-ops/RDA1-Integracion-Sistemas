import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  OSM_TILES_URL,
  OSM_ATTRIBUTION,
  OSM_ATTRIBUTION_TEXT,
  loadLeaflet,
  crearIconoPrecio,
  crearIconoHotelPrincipal,
} from '../shared/mapa-ubicacion';
import {
  obtenerCoordenadasAlojamiento,
  buscarCoordenadasNominatim,
  DESTINOS_COORDENADAS_FALLBACK,
} from '../services/geocodificacionService';

/**
 * Componente interactivo de Mapa con Leaflet y teselas públicas de OpenStreetMap.
 * Compatible con:
 * - Modo detalle (un solo alojamiento centrado con pin destacado)
 * - Modo búsqueda (múltiples alojamientos con pines interactivos de precio y popups)
 * - Modo modal (lightbox emergente estilo Booking.com)
 * - Modo inline (embebido en la página)
 */
export function MapaAlojamientos({
  alojamiento,
  properties = [],
  destination = '',
  mode = 'inline', // 'inline' | 'modal'
  isOpen = false,
  onClose = () => {},
  height = '420px',
  selectedPropertyId = null,
  onSelectProperty = () => {},
  searchParamsString = '',
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadingMap, setLoadingMap] = useState(true);
  const [activeProperty, setActiveProperty] = useState(null);
  const navigate = useNavigate();

  // 1. Cargar la librería Leaflet dinámicamente
  useEffect(() => {
    let cancelado = false;
    loadLeaflet()
      .then(() => {
        if (!cancelado) {
          setMapReady(true);
          setLoadingMap(false);
        }
      })
      .catch((err) => {
        console.error('Error cargando Leaflet:', err);
        if (!cancelado) setLoadingMap(false);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  // 2. Inicializar o actualizar el mapa Leaflet
  useEffect(() => {
    if (!mapReady || !mapContainerRef.current) return;
    if (mode === 'modal' && !isOpen) return;

    const L = window.L;
    if (!L) return;

    // Limpiar id residual en el DOM si se perdió la instancia para evitar error de contenedor inicializado
    if (mapContainerRef.current && mapContainerRef.current._leaflet_id && !mapInstanceRef.current) {
      delete mapContainerRef.current._leaflet_id;
    }

    // Crear mapa si no existe
    if (!mapInstanceRef.current) {
      const defaultCenter = DESTINOS_COORDENADAS_FALLBACK.quito;
      const map = L.map(mapContainerRef.current, {
        center: [defaultCenter.lat, defaultCenter.lng],
        zoom: defaultCenter.zoom,
        zoomControl: true,
      });

      // Teselas públicas de OpenStreetMap
      L.tileLayer(OSM_TILES_URL, {
        maxZoom: 19,
        attribution: OSM_ATTRIBUTION,
      }).addTo(map);

      // Capa de marcadores
      markersLayerRef.current = L.featureGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    // Asegurar redimensionamiento de Leaflet tras apertura de modal
    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 200);

    // Caso A: Modo alojamiento individual (Ficha de detalle)
    if (alojamiento) {
      const coords = obtenerCoordenadasAlojamiento(alojamiento);
      const icon = crearIconoHotelPrincipal(L);
      const marker = L.marker([coords.lat, coords.lng], { icon });

      const popupContent = `
        <div style="font-family: inherit; font-size: 13px; max-width: 240px; padding: 4px;">
          <strong style="color: #003580; font-size: 14px; display: block; margin-bottom: 4px;">
            ${alojamiento.nombre || 'Alojamiento'}
          </strong>
          <div style="color: #555; margin-bottom: 6px; font-size: 12px;">
            ${alojamiento.ubicacion?.address || alojamiento.direccion || alojamiento.destino || 'Ecuador'}
          </div>
          <div style="color: #008009; font-weight: 600; font-size: 12px;">
            ★ ${alojamiento.puntuacion || alojamiento.ratings?.score || 8.8} / 10 · Excelente ubicación
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.addTo(markersGroup);
      map.setView([coords.lat, coords.lng], 15);
      return;
    }

    // Caso B: Modo múltiples alojamientos (Página de búsqueda)
    const listado = Array.isArray(properties) ? properties : [];

    if (listado.length > 0) {
      let selectedMarker = null;
      let selectedCoords = null;

      listado.forEach((prop) => {
        const coords = obtenerCoordenadasAlojamiento(prop);
        const precio = prop.disponibilidad?.price_per_night || prop.precioPorNoche || prop.precio_noche || 45;
        const esSeleccionado = String(selectedPropertyId) === String(prop.id);
        const icon = crearIconoPrecio(L, `$${Math.round(precio)}`, esSeleccionado);

        const marker = L.marker([coords.lat, coords.lng], { icon });

        // Foto para el popup
        const rawPhoto = prop.photos?.[0]?.url;
        const photoUrl = rawPhoto && !rawPhoto.includes('example.com')
          ? rawPhoto
          : 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=300&q=80';

        const score = Number(prop.ratings?.score ?? prop.puntuacion ?? prop.calificacion ?? 8.5);

        const popupDiv = document.createElement('div');
        popupDiv.style.fontFamily = 'inherit';
        popupDiv.style.fontSize = '12px';
        popupDiv.style.maxWidth = '220px';
        popupDiv.style.cursor = 'pointer';

        popupDiv.innerHTML = `
          <div style="border-radius: 6px; overflow: hidden; margin-bottom: 6px; box-shadow: 0 1px 4px rgba(0,0,0,0.15);">
            <img src="${photoUrl}" alt="${prop.nombre}" style="width: 100%; height: 110px; object-fit: cover; display: block;" />
          </div>
          <div style="font-weight: 700; color: #003580; font-size: 13px; line-height: 1.2; margin-bottom: 4px;">
            ${prop.nombre}
          </div>
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span style="background: #003580; color: #fff; padding: 2px 5px; border-radius: 4px; font-weight: 700; font-size: 11px;">
              ${score.toFixed(1)}
            </span>
            <span style="color: #555; font-size: 11px;">${prop.destino || destination}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid #eee; padding-top: 6px;">
            <span style="font-size: 11px; color: #666;">Precio/noche:</span>
            <strong style="color: #1a1a1a; font-size: 14px;">$${Math.round(precio)}</strong>
          </div>
          <button type="button" style="
            width: 100%;
            margin-top: 8px;
            background: #006ce4;
            color: #fff;
            border: none;
            padding: 6px 10px;
            border-radius: 4px;
            font-weight: 600;
            cursor: pointer;
            text-align: center;
          ">
            Ver disponibilidad
          </button>
        `;

        popupDiv.querySelector('button')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetUrl = `/alojamientos/${prop.id}${searchParamsString ? `?${searchParamsString}` : ''}`;
          navigate(targetUrl);
        });

        marker.bindPopup(popupDiv);
        marker.on('click', () => {
          setActiveProperty(prop);
          onSelectProperty(prop);
        });

        marker.addTo(markersGroup);

        if (esSeleccionado) {
          selectedMarker = marker;
          selectedCoords = coords;
        }
      });

      // Centrar en el alojamiento seleccionado o abarcar todos los pines
      if (selectedMarker && selectedCoords) {
        map.setView([selectedCoords.lat, selectedCoords.lng], 15);
        setTimeout(() => {
          try {
            selectedMarker.openPopup();
          } catch (e) {
            // ignore
          }
        }, 300);
      } else {
        try {
          const bounds = markersGroup.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
          }
        } catch (err) {
          console.warn('Error al ajustar límites de mapa:', err);
        }
      }
    } else if (destination) {
      // Buscar coordenadas con Nominatim si la lista está vacía
      buscarCoordenadasNominatim(destination).then((coords) => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([coords.lat, coords.lng], coords.zoom || 13);
        }
      });
    }
  }, [mapReady, alojamiento, properties, destination, isOpen, mode, selectedPropertyId]);

  // Limpieza al desmontar o al cerrar el modal
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          // ignore
        }
        mapInstanceRef.current = null;
        markersLayerRef.current = null;
      }
    };
  }, [isOpen, mode]);

  // Forzar redimensionamiento si cambia el tamaño
  const invalidateMap = () => {
    if (mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current.invalidateSize(), 150);
    }
  };

  if (mode === 'modal') {
    if (!isOpen) return null;

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mapa de alojamientos"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
        onClick={onClose}
      >
        <div
          style={{
            position: 'relative',
            background: '#ffffff',
            borderRadius: '12px',
            width: '94vw',
            maxWidth: '1240px',
            height: '88vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header del modal */}
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid #e7e7e7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#003580',
              color: '#ffffff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
                <line x1="8" y1="2" x2="8" y2="18"></line>
                <line x1="16" y1="6" x2="16" y2="22"></line>
              </svg>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                  {alojamiento ? alojamiento.nombre : `Alojamientos en ${destination || 'Ecuador'}`}
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#d0e2ff' }}>
                  {properties.length > 0 ? `${properties.length} alojamientos encontrados en el mapa` : 'Ubicación precisa'} · {OSM_ATTRIBUTION_TEXT}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar mapa"
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: '#ffffff',
                borderRadius: '50%',
                width: '34px',
                height: '34px',
                fontSize: '18px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.3)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            >
              ✕
            </button>
          </div>

          {/* Cuerpo del modal con el mapa interactivo Leaflet */}
          <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
            {loadingMap && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#f8fafc',
                  zIndex: 10,
                  fontSize: '0.9rem',
                  color: '#003580',
                  gap: '8px',
                }}
              >
                <span>Cargando mapa interactivo de OpenStreetMap...</span>
              </div>
            )}
            <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
          </div>

          {/* Footer de atribución y estado */}
          <div
            style={{
              padding: '8px 16px',
              background: '#f8f9fa',
              borderTop: '1px solid #e7e7e7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.75rem',
              color: '#595959',
            }}
          >
            <span>Teselas públicas de OpenStreetMap con Leaflet</span>
            <span>{OSM_ATTRIBUTION_TEXT}</span>
          </div>
        </div>
      </div>
    );
  }

  // Modo Inline
  return (
    <div
      style={{
        width: '100%',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid #e7e7e7',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        position: 'relative',
        background: '#f5f5f5',
      }}
    >
      {loadingMap && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(248, 250, 252, 0.8)',
            zIndex: 10,
            fontSize: '0.85rem',
            color: '#003580',
          }}
        >
          Cargando mapa de OpenStreetMap...
        </div>
      )}
      <div ref={mapContainerRef} style={{ width: '100%', height }} />
      <div
        style={{
          padding: '4px 8px',
          background: '#ffffff',
          borderTop: '1px solid #f0f0f0',
          fontSize: '0.7rem',
          color: '#777',
          textAlign: 'right',
        }}
      >
        Teselas públicas Leaflet · {OSM_ATTRIBUTION_TEXT}
      </div>
    </div>
  );
}

