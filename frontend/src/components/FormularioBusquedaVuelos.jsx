import { useId, useState, useRef, useEffect } from 'react';
import { hoyEnIso } from '../services/formato';
import { SpinnerVuelos } from './SpinnerVuelos';
import { useTelemetry } from '../hooks/useTelemetry';

// Destinos que las aerolíneas socias responden en sus búsquedas (verificado el 10-11-2026).
// El contrato v2 no tiene un endpoint de destinos: si una aerolínea agrega una ruta
// nueva, el cliente puede escribir el código IATA en "Otro aeropuerto".
const AEROPUERTOS_ECUADOR = [
  { codigo: 'UIO', nombre: 'Quito (UIO)' },
  { codigo: 'GYE', nombre: 'Guayaquil (GYE)' },
  { codigo: 'CUE', nombre: 'Cuenca (CUE)' },
  { codigo: 'MEC', nombre: 'Manta (MEC)' },
  { codigo: 'OCC', nombre: 'Coca (OCC)' },
  { codigo: 'LOH', nombre: 'Loja (LOH)' },
  { codigo: 'ESM', nombre: 'Esmeraldas (ESM)' },
  { codigo: 'LTX', nombre: 'Latacunga (LTX)' },
  { codigo: 'MCH', nombre: 'Machala (MCH)' },
  { codigo: 'TPC', nombre: 'Tarapoa (TPC)' },
  { codigo: 'GPS', nombre: 'Galápagos - Baltra (GPS)' },
  { codigo: 'SCY', nombre: 'Galápagos - San Cristóbal (SCY)' },
];

const AEROPUERTOS_INTERNACIONALES = [
  { codigo: 'BOG', nombre: 'Bogotá, Colombia (BOG)' },
  { codigo: 'LIM', nombre: 'Lima, Perú (LIM)' },
  { codigo: 'MIA', nombre: 'Miami, EE. UU. (MIA)' },
  { codigo: 'MAD', nombre: 'Madrid, España (MAD)' },
];

const CODIGOS_CONOCIDOS = new Set([...AEROPUERTOS_ECUADOR, ...AEROPUERTOS_INTERNACIONALES].map((a) => a.codigo));
const OTRO = '__otro__';
const IATA = /^[A-Z]{3}$/;

/**
 * Lista de aeropuertos agrupada (Ecuador / Internacional) más la opción
 * "Otro aeropuerto", que muestra un campo para escribir cualquier código IATA.
 */
function SelectorAeropuerto({ id, etiqueta, valor, onCambiar }) {
  const esOtro = Boolean(valor) && !CODIGOS_CONOCIDOS.has(valor);
  const [escribiendo, setEscribiendo] = useState(esOtro);
  // Un código de la lista siempre se muestra en la lista (también después de invertir la ruta).
  const mostrarCampo = esOtro || (escribiendo && !CODIGOS_CONOCIDOS.has(valor));
  return (
    <>
      <label htmlFor={id}>{etiqueta}</label>
      <select
        id={id}
        value={mostrarCampo ? OTRO : valor}
        onChange={(e) => {
          if (e.target.value === OTRO) {
            setEscribiendo(true);
            onCambiar('');
          } else {
            setEscribiendo(false);
            onCambiar(e.target.value);
          }
        }}
      >
        <option value="" disabled>{`Selecciona ${etiqueta.toLowerCase()}`}</option>
        <optgroup label="Ecuador">
          {AEROPUERTOS_ECUADOR.map((a) => (
            <option key={a.codigo} value={a.codigo}>{a.nombre}</option>
          ))}
        </optgroup>
        <optgroup label="Internacional">
          {AEROPUERTOS_INTERNACIONALES.map((a) => (
            <option key={a.codigo} value={a.codigo}>{a.nombre}</option>
          ))}
        </optgroup>
        <option value={OTRO}>Otro aeropuerto (código IATA)…</option>
      </select>
      {mostrarCampo && (
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          maxLength={3}
          placeholder="Ej.: PTY"
          aria-label={`Código IATA de ${etiqueta.toLowerCase()}`}
          value={valor}
          onChange={(e) => onCambiar(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))}
          style={{ marginTop: 4, width: '6.5em', textTransform: 'uppercase', letterSpacing: '0.08em' }}
        />
      )}
    </>
  );
}

export function FormularioBusquedaVuelos({ onBuscar, cargando, origenInicial = '', destinoInicial = '' }) {
  const idBase = useId();
  const { trackEvent } = useTelemetry();

  const [origen, setOrigen] = useState(origenInicial);
  const [destino, setDestino] = useState(destinoInicial);
  const [fecha, setFecha] = useState('');
  const [tipoViaje, setTipoViaje] = useState('ida');
  const [fechaRegreso, setFechaRegreso] = useState('');
  const [adultos, setAdultos] = useState(1);
  const [jovenes, setJovenes] = useState(0);
  const [ninos, setNinos] = useState(0);
  const [infantes, setInfantes] = useState(0);

  const [pasajerosAbierto, setPasajerosAbierto] = useState(false);
  const pasajerosRef = useRef(null);
  
  const [errorPasajeros, setErrorPasajeros] = useState('');

  const sumarPasajero = (tipo) => {
    setErrorPasajeros('');
    const totalAsientos = adultos + jovenes + ninos;

    if (tipo === 'Adultos') {
      if (totalAsientos >= 9) return setErrorPasajeros('Máximo 9 pasajeros por reserva.');
      setAdultos(adultos + 1);
    } else if (tipo === 'Jóvenes') {
      if (totalAsientos >= 9) return setErrorPasajeros('Máximo 9 pasajeros por reserva.');
      setJovenes(jovenes + 1);
    } else if (tipo === 'Niños') {
      if (totalAsientos >= 9) return setErrorPasajeros('Máximo 9 pasajeros por reserva.');
      setNinos(ninos + 1);
    } else if (tipo === 'Infantes') {
      if (infantes >= adultos) return setErrorPasajeros('Solo se permite 1 infante por cada adulto.');
      setInfantes(infantes + 1);
    }
  };

  const restarPasajero = (tipo) => {
    setErrorPasajeros('');
    if (tipo === 'Adultos') {
      if (adultos <= 1) return;
      const nuevosAdultos = adultos - 1;
      setAdultos(nuevosAdultos);
      if (infantes > nuevosAdultos) {
        setInfantes(nuevosAdultos);
        setErrorPasajeros('Se redujeron infantes (máx 1 por adulto).');
      }
    } else if (tipo === 'Jóvenes') {
      if (jovenes > 0) setJovenes(jovenes - 1);
    } else if (tipo === 'Niños') {
      if (ninos > 0) setNinos(ninos - 1);
    } else if (tipo === 'Infantes') {
      if (infantes > 0) setInfantes(infantes - 1);
    }
  };

  const [errores, setErrores] = useState({});

  useEffect(() => {
    function handleClickFuera(event) {
      if (pasajerosRef.current && !pasajerosRef.current.contains(event.target)) {
        setPasajerosAbierto(false);
      }
    }
    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, []);

  const ids = {
    origen: `${idBase}-origen`,
    destino: `${idBase}-destino`,
    fecha: `${idBase}-fecha`,
    fechaRegreso: `${idBase}-fecha-regreso`,
  };

  const esIdaVuelta = tipoViaje === 'idaVuelta';
  const ISO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

  function validar() {
    const nuevos = {};

    if (!origen) nuevos.origen = 'El origen es obligatorio.';
    else if (!IATA.test(origen)) nuevos.origen = 'El origen debe ser un código IATA de 3 letras (por ejemplo, PTY).';
    if (!destino) nuevos.destino = 'El destino es obligatorio.';
    else if (!IATA.test(destino)) nuevos.destino = 'El destino debe ser un código IATA de 3 letras (por ejemplo, PTY).';
    if (origen && destino && origen === destino) nuevos.destino = 'El destino debe ser distinto del origen.';
    
    if (!fecha) {
      nuevos.fecha = 'La fecha de salida es obligatoria.';
    } else if (!ISO_FECHA.test(fecha)) {
      nuevos.fecha = 'La fecha debe tener el formato YYYY-MM-DD.';
    } else if (fecha < hoyEnIso()) {
      nuevos.fecha = 'La fecha de salida no puede ser anterior a hoy.';
    }

    if (esIdaVuelta) {
      if (!fechaRegreso) {
        nuevos.fechaRegreso = 'La fecha de regreso es obligatoria.';
      } else if (!ISO_FECHA.test(fechaRegreso)) {
        nuevos.fechaRegreso = 'La fecha debe tener el formato YYYY-MM-DD.';
      } else if (fecha && fechaRegreso < fecha) {
        nuevos.fechaRegreso = 'La fecha de regreso no puede ser anterior a la de salida.';
      }
    }

    if (adultos < 1) nuevos.adultos = 'Debe haber al menos 1 adulto.';
    
    const totalPasajeros = adultos + jovenes + ninos + infantes;
    if (totalPasajeros > 9) nuevos.adultos = 'Maximo 9 pasajeros.';

    setErrores(nuevos);
    return nuevos;
  }

  function alEnviar(evento) {
    evento.preventDefault();
    if (cargando) return;

    const encontrados = validar();

    if (Object.keys(encontrados).length > 0) return;

    const itinerarios = [
      {
        origin: origen,
        destination: destino,
        departureDate: fecha,
      },
    ];

    if (esIdaVuelta) {
      itinerarios.push({
        origin: destino,
        destination: origen,
        departureDate: fechaRegreso,
      });
    }

    trackEvent('search_submitted', 'vuelos', { origen, destino, esIdaVuelta });

    onBuscar({
      itineraries: itinerarios,
      passengers: { adults: adultos, youths: jovenes, children: ninos, infants: infantes },
    });
  }

  function swapRutas() {
    const temp = origen;
    setOrigen(destino);
    setDestino(temp);
  }

  return (
    <form className="av-form-container" onSubmit={alEnviar} noValidate>
      {/* TIPO DE VIAJE */}
      <div className="av-header-row">
        <div className="av-trip-type-toggle">
          <button
            type="button"
            className={`av-trip-type-btn ${esIdaVuelta ? 'activo' : ''}`}
            onClick={() => setTipoViaje('idaVuelta')}
          >
            Ida y vuelta
          </button>
          <button
            type="button"
            className={`av-trip-type-btn ${!esIdaVuelta ? 'activo' : ''}`}
            onClick={() => setTipoViaje('ida')}
          >
            Solo ida
          </button>
        </div>
      </div>

      <div className="av-form-grid">
        {/* ORIGEN Y DESTINO (Grupo agrupado) */}
        <div className="av-input-group" style={errores.origen || errores.destino ? { borderColor: '#d32f2f' } : {}}>
          {/* Origen */}
          <div className="av-input-segment">
            <div className="av-input-icon">
              <svg viewBox="0 0 17 15">
                <path d="M1.57042 14.3877V13.1377H15.7371V14.3877H1.57042ZM2.8525 10.2531L0 5.49354L1.60729 5.06396L3.88458 6.99021L7.06563 6.15542L2.85729 0.525625L4.84125 0L10.9181 5.125L14.4679 4.17458C14.8482 4.07097 15.2095 4.11903 15.5519 4.31875C15.8944 4.51861 16.1174 4.80868 16.221 5.18896C16.3247 5.56938 16.2819 5.93076 16.0929 6.27312C15.9038 6.61549 15.619 6.83847 15.2388 6.94208L2.8525 10.2531Z" />
              </svg>
            </div>
            <div className="av-input-field">
              <SelectorAeropuerto id={ids.origen} etiqueta="Origen" valor={origen} onCambiar={setOrigen} />
            </div>
          </div>

          <div className="av-divider"></div>

          {/* Swap Button */}
          <button type="button" className="av-swap-btn" onClick={swapRutas} aria-label="Invertir ruta">
            <svg viewBox="0 0 24 24">
              <path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z" />
            </svg>
          </button>

          {/* Destino */}
          <div className="av-input-segment">
            <div className="av-input-icon">
              <svg viewBox="0 0 20 20">
                <path d="M2.9165 17.683V16.433H17.0832V17.683H2.9165ZM15.3219 13.5707L2.9165 10.0035V4.46199L4.5238 4.92033L5.49192 7.75199L8.6313 8.65262L7.92609 1.66699L9.89734 2.2472L12.4759 9.76637L16.0432 10.7953C16.3422 10.8903 16.5903 11.0637 16.7875 11.3153C16.9846 11.5669 17.0832 11.8534 17.0832 12.1749C17.0832 12.597 16.9119 12.9694 16.5694 13.292C16.2271 13.6146 15.8112 13.7075 15.3219 13.5707Z" />
              </svg>
            </div>
            <div className="av-input-field">
              <SelectorAeropuerto id={ids.destino} etiqueta="Destino" valor={destino} onCambiar={setDestino} />
            </div>
          </div>
        </div>

        {/* FECHAS (Salida y Regreso agrupado si es idaVuelta) */}
        <div className="av-input-group" style={errores.fecha || errores.fechaRegreso ? { borderColor: '#d32f2f' } : {}}>
          {/* Salida */}
          <div className="av-input-segment">
            <div className="av-input-icon">
              <svg viewBox="0 0 20 20">
                <path d="M6.66667 3.33366H13.3333V1.66699H15V3.33366H15.8333C16.2917 3.33366 16.6842 3.49691 17.0109 3.82357C17.337 4.14968 17.5 4.54199 17.5 5.00033V16.667C17.5 17.1253 17.337 17.5179 17.0109 17.8446C16.6842 18.1707 16.2917 18.3337 15.8333 18.3337H4.16667C3.70833 18.3337 3.31576 18.1707 2.9891 17.8446C2.66298 17.5179 2.5 17.1253 2.5 16.667V5.00033C2.5 4.54199 2.66298 4.14968 2.9891 3.82357C3.31576 3.49691 3.70834 3.33366 4.16667 3.33366H5V1.66699H6.66667V3.33366ZM4.16667 16.667H15.8333V8.33366H4.16667V16.667ZM6.66667 13.3337C7.125 13.3337 7.5 13.7087 7.5 14.167C7.5 14.6253 7.125 15.0003 6.66667 15.0003C6.20833 15.0003 5.83333 14.6253 5.83333 14.167C5.83333 13.7087 6.20833 13.3337 6.66667 13.3337ZM10 13.3337C10.4583 13.3337 10.8333 13.7087 10.8333 14.167C10.8333 14.6253 10.4583 15.0003 10 15.0003C9.54167 15.0003 9.16667 14.6253 9.16667 14.167C9.16667 13.7087 9.54167 13.3337 10 13.3337ZM13.3333 13.3337C13.7917 13.3337 14.1667 13.7087 14.1667 14.167C14.1667 14.6253 13.7917 15.0003 13.3333 15.0003C12.875 15.0003 12.5 14.6253 12.5 14.167C12.5 13.7087 12.875 13.3337 13.3333 13.3337ZM6.66667 10.0003C7.125 10.0003 7.5 10.3753 7.5 10.8337C7.5 11.292 7.125 11.667 6.66667 11.667C6.20833 11.667 5.83333 11.292 5.83333 10.8337C5.83333 10.3753 6.20833 10.0003 6.66667 10.0003ZM10 10.0003C10.4583 10.0003 10.8333 10.3753 10.8333 10.8337C10.8333 11.292 10.4583 11.667 10 11.667C9.54167 11.667 9.16667 11.292 9.16667 10.8337C9.16667 10.3753 9.54167 10.0003 10 10.0003ZM13.3333 10.0003C13.7917 10.0003 14.1667 10.3753 14.1667 10.8337C14.1667 11.292 13.7917 11.667 13.3333 11.667C12.875 11.667 12.5 11.292 12.5 10.8337C12.5 10.3753 12.875 10.0003 13.3333 10.0003Z" />
              </svg>
            </div>
            <div className="av-input-field">
              <label htmlFor={ids.fecha}>Salida</label>
              <input
                type="date"
                id={ids.fecha}
                min={hoyEnIso()}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
          </div>

          <div className="av-divider" style={{ display: esIdaVuelta ? 'block' : 'none' }}></div>

          {/* Regreso */}
          {esIdaVuelta && (
            <div className="av-input-segment">
              <div className="av-input-icon">
                <svg viewBox="0 0 20 20">
                  <path d="M6.66667 3.33366H13.3333V1.66699H15V3.33366H15.8333C16.2917 3.33366 16.6842 3.49691 17.0109 3.82357C17.337 4.14968 17.5 4.54199 17.5 5.00033V16.667C17.5 17.1253 17.337 17.5179 17.0109 17.8446C16.6842 18.1707 16.2917 18.3337 15.8333 18.3337H4.16667C3.70833 18.3337 3.31576 18.1707 2.9891 17.8446C2.66298 17.5179 2.5 17.1253 2.5 16.667V5.00033C2.5 4.54199 2.66298 4.14968 2.9891 3.82357C3.31576 3.49691 3.70834 3.33366 4.16667 3.33366H5V1.66699H6.66667V3.33366ZM4.16667 16.667H15.8333V8.33366H4.16667V16.667ZM6.66667 13.3337C7.125 13.3337 7.5 13.7087 7.5 14.167C7.5 14.6253 7.125 15.0003 6.66667 15.0003C6.20833 15.0003 5.83333 14.6253 5.83333 14.167C5.83333 13.7087 6.20833 13.3337 6.66667 13.3337ZM10 13.3337C10.4583 13.3337 10.8333 13.7087 10.8333 14.167C10.8333 14.6253 10.4583 15.0003 10 15.0003C9.54167 15.0003 9.16667 14.6253 9.16667 14.167C9.16667 13.7087 9.54167 13.3337 10 13.3337ZM13.3333 13.3337C13.7917 13.3337 14.1667 13.7087 14.1667 14.167C14.1667 14.6253 13.7917 15.0003 13.3333 15.0003C12.875 15.0003 12.5 14.6253 12.5 14.167C12.5 13.7087 12.875 13.3337 13.3333 13.3337ZM6.66667 10.0003C7.125 10.0003 7.5 10.3753 7.5 10.8337C7.5 11.292 7.125 11.667 6.66667 11.667C6.20833 11.667 5.83333 11.292 5.83333 10.8337C5.83333 10.3753 6.20833 10.0003 6.66667 10.0003ZM10 10.0003C10.4583 10.0003 10.8333 10.3753 10.8333 10.8337C10.8333 11.292 10.4583 11.667 10 11.667C9.54167 11.667 9.16667 11.292 9.16667 10.8337C9.16667 10.3753 9.54167 10.0003 10 10.0003ZM13.3333 10.0003C13.7917 10.0003 14.1667 10.3753 14.1667 10.8337C14.1667 11.292 13.7917 11.667 13.3333 11.667C12.875 11.667 12.5 11.292 12.5 10.8337C12.5 10.3753 12.875 10.0003 13.3333 10.0003Z" />
                </svg>
              </div>
              <div className="av-input-field">
                <label htmlFor={ids.fechaRegreso}>Regreso</label>
                <input
                  type="date"
                  id={ids.fechaRegreso}
                  min={fecha || hoyEnIso()}
                  value={fechaRegreso}
                  onChange={(e) => setFechaRegreso(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* PASAJEROS */}
        <div className="av-passengers-container" ref={pasajerosRef}>
          <div 
            className="av-passengers-toggle" 
            onClick={() => setPasajerosAbierto(!pasajerosAbierto)}
            style={errores.adultos ? { borderColor: '#d32f2f' } : {}}
          >
            <div className="av-input-icon">
              <svg viewBox="0 0 20 20">
                <path fillRule="evenodd" clipRule="evenodd" d="M7.50004 9.99967C5.65838 9.99967 4.16671 8.50801 4.16671 6.66634C4.16671 4.82467 5.65838 3.33301 7.50004 3.33301C9.34171 3.33301 10.8334 4.82467 10.8334 6.66634C10.8334 8.50801 9.34171 9.99967 7.50004 9.99967ZM15 8.33301V5.83301H16.6667V8.33301H19.1667V9.99967H16.6667V12.4997H15V9.99967H12.5V8.33301H15ZM7.50004 11.6663C9.72504 11.6663 14.1667 12.783 14.1667 14.9997V16.6663H0.833374V14.9997C0.833374 12.783 5.27504 11.6663 7.50004 11.6663Z" />
              </svg>
            </div>
            <div className="av-passengers-text">
              <span>Pasajeros</span>
              <span>{adultos + jovenes + ninos + infantes}</span>
            </div>
            <div className="av-caret">
              <svg viewBox="0 0 12 8">
                <path fillRule="evenodd" clipRule="evenodd" d="M10.59 0L6 4.58L1.41 0L0 1.41L6 7.41L12 1.41L10.59 0Z" />
              </svg>
            </div>
          </div>

          {pasajerosAbierto && (
            <div className="av-passengers-dropdown">
              <div className="av-dropdown-title">¿Quiénes vuelan?</div>
              {[
                { label: 'Adultos', subtitle: 'Desde 15 años', val: adultos },
                { label: 'Jóvenes', subtitle: 'De 12 a 14 años', val: jovenes },
                { label: 'Niños', subtitle: 'De 2 a 11 años', val: ninos },
                { label: 'Bebés', subtitle: 'Menores de 2 años (1 por adulto)', val: infantes },
              ].map((p) => (
                <div className="av-passenger-row" key={p.label}>
                  <div className="av-passenger-info">
                    <strong>{p.label}</strong>
                    <span>{p.subtitle}</span>
                  </div>
                  <div className="av-passenger-controls">
                    <button type="button" onClick={() => restarPasajero(p.label === 'Bebés' ? 'Infantes' : p.label)}>
                      <svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>
                    </button>
                    <span>{p.val}</span>
                    <button type="button" onClick={() => sumarPasajero(p.label === 'Bebés' ? 'Infantes' : p.label)}>
                      <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                    </button>
                  </div>
                </div>
              ))}
              {errorPasajeros && (
                <div className="av-error-box">
                  {errorPasajeros}
                </div>
              )}
            </div>
          )}
        </div>

        {/* BUSCAR */}
        <button className="av-btn-buscar" type="submit" disabled={cargando} aria-busy={cargando}>
          {cargando ? <><SpinnerVuelos />Buscando vuelos…</> : 'Buscar'}
        </button>
      </div>

      {Object.values(errores).length > 0 && (
        <div style={{ marginTop: '16px' }}>
          {Object.values(errores).map((err, i) => (
            <div key={i} className="av-error-box">{err}</div>
          ))}
        </div>
      )}
    </form>
  );
}
