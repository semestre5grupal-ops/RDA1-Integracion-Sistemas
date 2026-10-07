import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAlojamientos, searchAlojamientos } from '../services/alojamientosApi';
import { AlojamientoCard } from '../components/AlojamientoCard';
import { DestinoAutocomplete } from '../components/DestinoAutocomplete';
import { destinoExacto } from '../utils/destinos';
import { useCurrency } from '../hooks/CurrencyContext';
import {
  EcuadorFlagIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BedIcon,
  CalendarIcon,
  UsersIcon,
  ChildIcon,
  CloseIcon,
  LoadingSpinnerIcon,
  NoResultsIllustration,
  DocumentIcon,
  ThumbsUpIcon,
  GlobeIcon,
  HeadsetIcon,
  ChevronDownIcon,
} from '../components/BookingIcons';
import './AlojamientosPage.css';

// 1. Destinos de playa (Looking for a beach trip?)
const BEACH_TRIPS = [
  {
    id: 'med',
    title: 'Europa mediterránea',
    subtitle: 'Islas griegas • Mallorca • Sicilia y más',
    img: 'https://cf.bstatic.com/xdata/images/xphoto/max800/717598487.jpg?k=b2193d4e36c416ee8280939631748c0326fbbb4e167787c9a6d36b723600c8c7&o=',
    dest: 'Mallorca',
  },
  {
    id: 'atl',
    title: 'Islas y costa atlántica',
    subtitle: 'Tenerife • Archipiélago de Madeira • Cabo Verde y más',
    img: 'https://cf.bstatic.com/xdata/images/xphoto/max800/717608621.jpg?k=3e9c790827c57cb8221ef3e51602514a9c9ec46a1b1963428cb4f8d735e92cd9&o=',
    dest: 'Tenerife',
  },
  {
    id: 'sea',
    title: 'Sudeste asiático',
    subtitle: 'Bali • Provincia de Phuket • Isla de Borácay y más',
    img: 'https://cf.bstatic.com/xdata/images/xphoto/max800/717625541.jpg?k=64c9b7c953bacc18fcf193d0090f1983240e558a6a9c1375928d92a3da64a1c7&o=',
    dest: 'Bali',
  },
  {
    id: 'ind',
    title: 'Islas del océano Índico',
    subtitle: 'Maldivas • Mauricio • Seychelles y más',
    img: 'https://cf.bstatic.com/xdata/images/xphoto/max800/717626426.jpg?k=445d17b965cc7094e9bedab51451343842a11041685256691ae9a4e26c562a2c&o=',
    dest: 'Maldivas',
  },
  {
    id: 'car',
    title: 'Caribe',
    subtitle: 'Bahamas • Jamaica • Aruba y más',
    img: 'https://cf.bstatic.com/xdata/images/xphoto/max800/717669035.jpg?k=5431f0f539916cf886440f68019b498b2b8526df7121abfda43635625b786329&o=',
    dest: 'Aruba',
  },
  {
    id: 'cam',
    title: 'Centroamérica',
    subtitle: 'Costa Rica • Belice • México y más',
    img: 'https://cf.bstatic.com/xdata/images/xphoto/max800/717670223.jpg?k=1df38ac6e2bbe0c5a5d0f07d981366323089a1b9e2a925c8ca60be3fef2a3a2c&o=',
    dest: 'Costa Rica',
  },
  {
    id: 'oce',
    title: 'Oceanía e islas del Pacífico',
    subtitle: 'Bora Bora • Fiyi • Polinesia Francesa y más',
    img: 'https://cf.bstatic.com/xdata/images/xphoto/max800/717671075.jpg?k=57d68641e9d07a0c832ac368976738bbfb13c28fe7b042504d43f614f7e0205e&o=',
    dest: 'Bora Bora',
  },
];

// 2. Tipos de alojamiento únicos en Quito
const UNIQUE_QUITO_THEMES = [
  {
    id: 'col-houses',
    title: 'Casas coloniales',
    img: 'https://cf.bstatic.com/xdata/images/hotel/square600/186733572.jpg?k=c240c5ac288f94a220fdc29f7567ad64ca427373a4bf02a58645b69db3f37e75&o=',
  },
  {
    id: 'col-suites',
    title: 'Suites coloniales',
    img: 'https://cf.bstatic.com/xdata/images/hotel/square600/558875285.jpg?k=b9e05594cf19bafc6939fc13dd347039b5507b8f371b17e77dc5bf02a7fc097b&o=',
  },
  {
    id: 'old-town-inns',
    title: 'Posadas del centro histórico',
    img: 'https://cf.bstatic.com/xdata/images/hotel/square600/559687073.jpg?k=c992a897b9a2863f686245424cf09eb41e186e517ce9dfe6ee3c56b119bbd57c&o=',
  },
  {
    id: 'andean-lodges',
    title: 'Lodges andinos',
    img: 'https://cf.bstatic.com/xdata/images/hotel/square600/269057588.jpg?k=0a696e716f1eb781fa48703d7bf2c5179a52b4d3675e870a6526e6df1f28f61a&o=',
  },
  {
    id: 'rooftop-hostels',
    title: 'Hostales con azotea',
    img: 'https://cf.bstatic.com/xdata/images/hotel/square600/821906536.jpg?k=9b87bff5286022ea90521d1f8884a145819ead03e289deb2217ae3232ad1300f&o=',
  },
  {
    id: 'garden-houses',
    title: 'Casas con jardín',
    img: 'https://cf.bstatic.com/xdata/images/hotel/square600/534624293.jpg?k=fd08636d8dc69f71b40459c9e6c67a024f24f77f100f8817d01eb00e79bd1b58&o=',
  },
  {
    id: 'panoramic-hotels',
    title: 'Hoteles panorámicos',
    img: 'https://cf.bstatic.com/xdata/images/hotel/square600/906609338.jpg?k=b18a07a0c4572fd6bcb5762711bc90f1dc10ac8e75d06b526bcfaef04eabff80&o=',
  },
  {
    id: 'parkside-flats',
    title: 'Departamentos junto al parque',
    img: 'https://cf.bstatic.com/xdata/images/hotel/square600/535608843.jpg?k=613c1dcb9a470528411e68760b6788a4b1ffdacdb178cef90cc7401df54eab82&o=',
  },
  {
    id: 'serviced-suites',
    title: 'Suites con servicios',
    img: 'https://cf.bstatic.com/xdata/images/hotel/square600/644054322.jpg?k=f8de21f14ff3ffec2e66a03aaa4638ddaadf00e2f7dbe522a3a93eee9234935e&o=',
  },
  {
    id: 'business-hotels',
    title: 'Hoteles de negocios',
    img: 'https://cf.bstatic.com/xdata/images/hotel/square600/663911177.jpg?k=ec24b8e080342ade3fae6f266e5e4077f8ca87359d837496b6b1b0bf74ffaa95&o=',
  },
];

// 3. Buscar por tipo de alojamiento (Browse by property type)
const BROWSE_PROPERTY_TYPES = [
  {
    name: 'Hoteles',
    img: 'https://q-xx.bstatic.com/xdata/images/hotel/263x210/595550862.jpeg?k=3514aa4abb76a6d19df104cb307b78b841ac0676967f24f4b860d289d55d3964&o=',
    type: 'Hoteles',
  },
  {
    name: 'Departamentos',
    img: 'https://r-xx.bstatic.com/xdata/images/hotel/263x210/595548591.jpeg?k=01741bc3aef1a5233dd33794dda397083092c0215b153915f27ea489468e57a2&o=',
    type: 'Apartamentos',
  },
  {
    name: 'Resorts',
    img: 'https://r-xx.bstatic.com/xdata/images/hotel/263x210/595551044.jpeg?k=262826efe8e21a0868105c01bf7113ed94de28492ee370f4225f00d1de0c6c44&o=',
    type: 'Resorts',
  },
  {
    name: 'Villas',
    img: 'https://q-xx.bstatic.com/xdata/images/hotel/263x210/620168315.jpeg?k=300d8d8059c8c5426ea81f65a30a7f93af09d377d4d8570bda1bd1f0c8f0767f&o=',
    type: 'Villas',
  },
  {
    name: 'Cabañas',
    img: 'https://q-xx.bstatic.com/xdata/images/hotel/263x210/595549239.jpeg?k=ad5273675c516cc1efc6cba2039877297b7ad2b5b3f54002c55ea6ebfb8bf949&o=',
    type: 'Cabañas',
  },
  {
    name: 'Casas de campo',
    img: 'https://r-xx.bstatic.com/xdata/images/hotel/263x210/595550000.jpeg?k=71eeb3e0996d7f734e57a6fa426c718749a36df768ca5d2fb1dc65fcd7483c1d&o=',
    type: 'Casas de campo',
  },
  {
    name: 'Glamping',
    img: 'https://r-xx.bstatic.com/xdata/images/xphoto/263x210/45450090.jpeg?k=52f6b8190edb5a9c91528f8e0f875752ce55a6beb35dc62873601e57944990e4&o=',
    type: 'Glamping',
  },
  {
    name: 'Apartahoteles',
    img: 'https://r-xx.bstatic.com/xdata/images/hotel/263x210/595551195.jpeg?k=fe19403cca087623a33bf24c4154a636cd26d04c2aa948634fb05afa971e7767&o=',
    type: 'Aparthotels',
  },
  {
    name: 'Casas vacacionales',
    img: 'https://r-xx.bstatic.com/xdata/images/hotel/263x210/595550229.jpeg?k=2ae1f5975fa1f846ac707d3334eb604a7e8f817f640cbd790185b2691532476b&o=',
    type: 'Holiday homes',
  },
  {
    name: 'Casas de huéspedes',
    img: 'https://r-xx.bstatic.com/xdata/images/hotel/263x210/595550178.jpeg?k=1db9bffadd03a0f2a9f0a06ba6c7751b16465f2dd251738f229d7a57dca799ef&o=',
    type: 'Guest houses',
  },
  {
    name: 'Hostales',
    img: 'https://q-xx.bstatic.com/xdata/images/hotel/263x210/595550415.jpeg?k=8967853a074040381dfa25a568e6c780e309b529e0c144995c5bbc9644721eca&o=',
    type: 'Hostales',
  },
];

// 4. Destinos de moda (Trending destinations)
const TRENDING_DESTINATIONS_EC = [
  {
    id: 'quito',
    name: 'Quito',
    region: 'Pichincha',
    img: 'https://cf.bstatic.com/xdata/images/city/600x600/1012471.jpg?k=8e89f5b5f46ba6dbcd79ff3b00398949f8979e96d4bb848d93b822045581a981&o=',
    large: true,
  },
  {
    id: 'puerto-ayora',
    name: 'Puerto Ayora',
    region: 'Galápagos',
    img: 'https://cf.bstatic.com/xdata/images/city/600x600/789773.jpg?k=d69235159c2c6133ca29b3c7dfd4898da8521973758ff4e389458e17f9f9c0a4&o=',
    large: true,
  },
  {
    id: 'tababela',
    name: 'Tababela',
    region: 'Pichincha',
    img: 'https://cf.bstatic.com/xdata/images/city/600x600/832350.jpg?k=f0751a4094ca952926d35c341b85654b0f593cd3147039cfc52fca335833d0ef&o=',
    large: false,
  },
  {
    id: 'puerto-baquerizo',
    name: 'Puerto Baquerizo Moreno',
    region: 'Galápagos',
    img: 'https://cf.bstatic.com/xdata/images/city/600x600/860180.jpg?k=c07c2a1ab38ecd6fd2a5194a0b8a8b8aad42e301eca9f965b8c14cfcd645e81b&o=',
    large: false,
  },
  {
    id: 'puerto-villamil',
    name: 'Puerto Villamil',
    region: 'Galápagos',
    img: 'https://cf.bstatic.com/xdata/images/city/600x600/934806.jpg?k=656bbee067aa447a32cd577b8639b46d903dec06cd5b7c083e0ac46e6bf1e8a1&o=',
    large: false,
  },
];

// 5. Descubre Ecuador (Explore Ecuador)
const EXPLORE_ECUADOR = [
  { name: 'Quito', count: '1.134', img: 'https://q-xx.bstatic.com/xdata/images/city/170x136/1012471.jpg?k=8e89f5b5f46ba6dbcd79ff3b00398949f8979e96d4bb848d93b822045581a981&o=' },
  { name: 'Galápagos', count: '455', img: 'https://q-xx.bstatic.com/xdata/images/region/170x136/76216.jpg?k=2bd5d6405c12d7942b0e752d31b941ac81f7daf7ab9ade47a45550286b012e5c&o=' },
  { name: 'Cumbayá', count: '3', img: 'https://q-xx.bstatic.com/xdata/images/city/170x136/959538.jpg?k=391e182760754e34800286b9ab34e31529e3629c96b243a3628f95d4e08149ab&o=' },
  { name: 'Cotopaxi', count: '93', img: 'https://q-xx.bstatic.com/xdata/images/region/170x136/58352.jpg?k=bc08ba2c9a115698e80e1dde072016909ef0d455c194331e9f9b65b8c5a56223&o=' },
  { name: 'Baños', count: '290', img: 'https://q-xx.bstatic.com/xdata/images/city/170x136/1012429.jpg?k=b85fce9101cefd4a55dbf7c8231cd3d65c0ab80b95f1df5338af3a8565e36423&o=' },
  { name: 'Mindo', count: '120', img: 'https://q-xx.bstatic.com/xdata/images/city/170x136/1012456.jpg?k=c5e1b2b69ce440ed16ab843cc77b00e628270901d1a9317b79cfa4b78d28d041&o=' },
  { name: 'Amazonas', count: '290', img: 'https://r-xx.bstatic.com/xdata/images/region/170x136/58793.jpg?k=4ec4d36d8cc4b8cf5083c74014f682b981c8dd241b4663ca07e01b8713b03fe9&o=' },
  { name: 'Loja', count: '144', img: 'https://q-xx.bstatic.com/xdata/images/city/170x136/991894.jpg?k=a9429c69f32ce6572f378775a103b337a7b042d1c1c4f7d408fd5014a2906ab0&o=' },
  { name: 'Sangolquí', count: '18', img: 'https://r-xx.bstatic.com/xdata/images/city/170x136/950627.jpg?k=2fe876b089772f8efaff9757d08fd26bcc5f31cd7866d1d12d5bfefb92af4b72&o=' },
];

// 6. Planificador de viajes con pestañas
const TRIP_PLANNER_TABS = [
  { id: 'tranquil', label: 'Escapadas tranquilas' },
  { id: 'coastal', label: 'Relax en la costa' },
  { id: 'romantic', label: 'Escapadas románticas' },
  { id: 'historical', label: 'Visitas históricas' },
  { id: 'food', label: 'Rutas gastronómicas' },
  { id: 'adventure', label: 'Aventura y naturaleza' },
];

const TRIP_PLANNER_DATA = {
  tranquil: [
    { name: 'Mindo', distance: 'A 35 km de Quito', img: 'https://q-xx.bstatic.com/xdata/images/city/170x136/1012456.jpg?k=c5e1b2b69ce440ed16ab843cc77b00e628270901d1a9317b79cfa4b78d28d041&o=' },
    { name: 'Papallacta', distance: 'A 45 km de Quito', img: 'https://r-xx.bstatic.com/xdata/images/city/170x136/898619.jpg?k=08b308cfccd80a0ec069db71498ce38b2706936530e2b5127124017061519a8a&o=' },
    { name: 'Cotacachi', distance: 'A 64 km de Quito', img: 'https://r-xx.bstatic.com/xdata/images/city/170x136/936526.jpg?k=2a7579372b6cf6dbf4f11065f4356518500379ad2b5e616ab2d551e9ac9f23a3&o=' },
    { name: 'Tena', distance: 'A 116 km de Quito', img: 'https://q-xx.bstatic.com/xdata/images/city/170x136/649764.jpg?k=17e58a8556ee3e9300e13328635cc08a8521d30dcd215869b88b4188f0fc0750&o=' },
    { name: 'Baños', distance: 'A 131 km de Quito', img: 'https://q-xx.bstatic.com/xdata/images/city/170x136/1012429.jpg?k=b85fce9101cefd4a55dbf7c8231cd3d65c0ab80b95f1df5338af3a8565e36423&o=' },
    { name: 'Puyo', distance: 'A 152 km de Quito', img: 'https://r-xx.bstatic.com/xdata/images/city/170x136/995751.jpg?k=f9b39463b4600226cefbdd86805ea96da9f26398aceb0ddb9b195884773f2aae&o=' },
    { name: 'Cuenca', distance: 'A 303 km de Quito', img: 'https://r-xx.bstatic.com/xdata/images/city/170x136/1012435.jpg?k=77615a937398133aed64263aac5b35b2d6557334d11b932c0567b299bbf45e1b&o=' },
    { name: 'Vilcabamba', distance: 'A 456 km de Quito', img: 'https://r-xx.bstatic.com/xdata/images/city/170x136/624862.jpg?k=4e0b9ba846152537af2dd9ba00cf3a286add277f0bece83ac069a2291ae8a20d&o=' },
  ],
  coastal: [
    { name: 'Salinas', distance: 'A 140 km de Guayaquil', img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500' },
    { name: 'Montañita', distance: 'A 180 km de Guayaquil', img: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=500' },
    { name: 'Manta', distance: 'Costa central', img: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=500' },
    { name: 'Puerto López', distance: 'Parque Nacional Machalilla', img: 'https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?w=500' },
  ],
  romantic: [
    { name: 'Cuenca Colonial', distance: 'Centro Histórico', img: 'https://r-xx.bstatic.com/xdata/images/city/170x136/1012435.jpg?k=77615a937398133aed64263aac5b35b2d6557334d11b932c0567b299bbf45e1b&o=' },
    { name: 'Termas de Papallacta', distance: 'Resort de montaña', img: 'https://r-xx.bstatic.com/xdata/images/city/170x136/898619.jpg?k=08b308cfccd80a0ec069db71498ce38b2706936530e2b5127124017061519a8a&o=' },
    { name: 'Baños de Agua Santa', distance: 'Vistas al volcán', img: 'https://q-xx.bstatic.com/xdata/images/city/170x136/1012429.jpg?k=b85fce9101cefd4a55dbf7c8231cd3d65c0ab80b95f1df5338af3a8565e36423&o=' },
  ],
  historical: [
    { name: 'Quito Antiguo', distance: 'Patrimonio de la Humanidad', img: 'https://q-xx.bstatic.com/xdata/images/city/170x136/1012471.jpg?k=8e89f5b5f46ba6dbcd79ff3b00398949f8979e96d4bb848d93b822045581a981&o=' },
    { name: 'Cuenca', distance: 'Ruta de las iglesias', img: 'https://r-xx.bstatic.com/xdata/images/city/170x136/1012435.jpg?k=77615a937398133aed64263aac5b35b2d6557334d11b932c0567b299bbf45e1b&o=' },
  ],
  food: [
    { name: 'Guayaquil Gastronómico', distance: 'Gastronomía costeña', img: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500' },
    { name: 'Quito Vanguardia', distance: 'Alta cocina andina', img: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500' },
  ],
  adventure: [
    { name: 'Baños de Agua Santa', distance: 'Deportes extremos', img: 'https://q-xx.bstatic.com/xdata/images/city/170x136/1012429.jpg?k=b85fce9101cefd4a55dbf7c8231cd3d65c0ab80b95f1df5338af3a8565e36423&o=' },
    { name: 'Tena Amazonía', distance: 'Rafting y selva', img: 'https://q-xx.bstatic.com/xdata/images/city/170x136/649764.jpg?k=17e58a8556ee3e9300e13328635cc08a8521d30dcd215869b88b4188f0fc0750&o=' },
  ],
};

export function AlojamientosPage() {
  const navigate = useNavigate();
  const { currency } = useCurrency();

  // Estados de datos
  const [alojamientos, setAlojamientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Estados del SearchBox
  const [destination, setDestination] = useState('');
  const [destinationError, setDestinationError] = useState('');
  const [checkin, setCheckin] = useState('2026-10-09');
  const [checkout, setCheckout] = useState('2026-10-11');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState(1);
  const [showDatesPopover, setShowDatesPopover] = useState(false);
  const [showOccupancyPopover, setShowOccupancyPopover] = useState(false);
  const [workTravel, setWorkTravel] = useState(false);

  // Estado pestaña planificador
  const [activePlannerTab, setActivePlannerTab] = useState('tranquil');

  // Referencias para carruseles horizontales con flechas
  const beachTrackRef = useRef(null);
  const uniqueQuitoTrackRef = useRef(null);
  const dealsTrackRef = useRef(null);
  const browseTypesTrackRef = useRef(null);
  const exploreTrackRef = useRef(null);
  const plannerTrackRef = useRef(null);

  const scrollTrack = (ref, distance) => {
    if (ref.current) {
      ref.current.scrollBy({ left: distance, behavior: 'smooth' });
    }
  };

  const fetchData = useCallback(async (customDest) => {
    setLoading(true);
    setError(null);
    const destToSearch = customDest !== undefined ? customDest : destination;
    try {
      let result;
      if (destToSearch && destToSearch.trim()) {
        result = await searchAlojamientos({
          destino: destToSearch.trim(),
        });
      } else {
        result = await getAlojamientos();
      }
      const data = result.data || result;
      setAlojamientos(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error al cargar alojamientos:', err);
      setError('No se pudieron cargar los alojamientos desde el servidor.');
    } finally {
      setLoading(false);
    }
  }, [destination]);

  // Espera a que el usuario deje de escribir antes de consultar al servidor
  // (antes se hacía una petición por cada tecla).
  useEffect(() => {
    const timer = setTimeout(() => fetchData(), destination ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  // Accesibilidad WCAG 2.1: Cerrar popovers con tecla Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowDatesPopover(false);
        setShowOccupancyPopover(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    const typed = destination.trim();
    if (!typed) {
      setDestinationError('Introduce un destino para empezar a buscar.');
      document.getElementById('bk-destination-input')?.focus();
      return;
    }
    if (checkin && checkout && checkout <= checkin) {
      setShowDatesPopover(true);
      return;
    }
    // "quito" / "QUÍTO" se normaliza al nombre oficial del destino.
    const dest = destinoExacto(typed)?.nombre || typed;
    setDestinationError('');
    navigate(
      `/alojamientos/search?ss=${encodeURIComponent(dest)}&checkin=${checkin}&checkout=${checkout}&group_adults=${adults}&group_children=${children}&no_rooms=${rooms}`
    );
  };

  const handleDestinationClick = (destName) => {
    navigate(
      `/alojamientos/search?ss=${encodeURIComponent(destName)}&checkin=${checkin}&checkout=${checkout}&group_adults=${adults}&group_children=${children}&no_rooms=${rooms}`
    );
  };

  const handlePropertyTypeClick = (typeName) => {
    const dest = destination.trim() || 'Quito';
    navigate(
      `/alojamientos/search?ss=${encodeURIComponent(dest)}&type=${encodeURIComponent(typeName)}&checkin=${checkin}&checkout=${checkout}&group_adults=${adults}&group_children=${children}&no_rooms=${rooms}`
    );
  };

  // Helper for formatting Booking date ranges (e.g. vie. 9 oct. — dom. 11 oct.)
  const formatBookingDateRange = (startStr, endStr) => {
    if (!startStr || !endStr) return 'Selecciona las fechas';
    try {
      const [y1, m1, d1] = startStr.split('-').map(Number);
      const [y2, m2, d2] = endStr.split('-').map(Number);
      const dStart = new Date(y1, m1 - 1, d1);
      const dEnd = new Date(y2, m2 - 1, d2);
      const days = ['dom.', 'lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.'];
      const months = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
      return `${days[dStart.getDay()]} ${d1} ${months[dStart.getMonth()]} — ${days[dEnd.getDay()]} ${d2} ${months[dEnd.getMonth()]}`;
    } catch {
      return `${startStr} — ${endStr}`;
    }
  };

  return (
    <div className="bk-page-wrapper">
      {/* ======================================================================
          1. HERO BANNER DESKTOP
          ====================================================================== */}
      <section className="bk-hero-banner">
        <div className="bk-hero-inner">
          <h1 className="bk-hero-title">Encuentra tu próximo alojamiento</h1>
          <p className="bk-hero-subtitle">Busca ofertas en hoteles, casas y mucho más...</p>
        </div>
      </section>

      {/* ======================================================================
          2. FLOATING SEARCH BOX
          ====================================================================== */}
      {/* ======================================================================
          2. FLOATING SEARCH BOX (Mobile-First & WCAG AA)
          ====================================================================== */}
      <div className="bk-searchbox-wrapper">
        <form className="bk-searchbox-form" onSubmit={handleSearchSubmit} role="search" aria-label="Búsqueda de alojamientos">
          <div className="bk-searchbox-fields">
            {/* Destino */}
            <div className="bk-search-field">
              <span style={{ color: '#474747', display: 'flex' }} aria-hidden="true">
                <BedIcon size={22} color="#474747" />
              </span>
              <div className="bk-field-content">
                <label htmlFor="bk-destination-input" className="bk-field-label">
                  Indica el destino
                </label>
                <DestinoAutocomplete
                  id="bk-destination-input"
                  className="bk-field-input"
                  value={destination}
                  onChange={(val) => {
                    setDestination(val);
                    if (val.trim()) setDestinationError('');
                  }}
                  onSelect={() => {
                    setDestinationError('');
                    setShowOccupancyPopover(false);
                    setShowDatesPopover(true);
                  }}
                  onInvalidChars={() => setDestinationError('Solo se permiten letras, espacios y los signos , . - \' &')}
                  invalid={Boolean(destinationError)}
                  errorId="bk-destination-error"
                />
              </div>
              {destinationError && (
                <div id="bk-destination-error" role="alert" className="dest-ac-error">
                  {destinationError}
                </div>
              )}
              {destination && (
                <button
                  type="button"
                  onClick={() => {
                    setDestination('');
                    document.getElementById('bk-destination-input')?.focus();
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 36, minHeight: 36 }}
                  aria-label="Borrar destino escrito"
                >
                  <CloseIcon size={14} color="#595959" />
                </button>
              )}
            </div>

            {/* Fechas */}
            <div
              className="bk-search-field"
              onClick={() => {
                setShowDatesPopover(!showDatesPopover);
                setShowOccupancyPopover(false);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowDatesPopover(!showDatesPopover);
                  setShowOccupancyPopover(false);
                }
              }}
              aria-haspopup="dialog"
              aria-expanded={showDatesPopover}
              aria-label="Seleccionar fechas de check-in y check-out"
            >
              <span style={{ color: '#474747', display: 'flex' }} aria-hidden="true">
                <CalendarIcon size={22} color="#474747" />
              </span>
              <div className="bk-field-content">
                <span className="bk-field-label">Selecciona las fechas</span>
                <span className="bk-field-value">
                  {formatBookingDateRange(checkin, checkout)}
                </span>
              </div>

              {showDatesPopover && (
                <>
                  <div
                    className="bk-popover-backdrop"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDatesPopover(false);
                    }}
                    aria-hidden="true"
                  />
                  <div
                    className="bk-search-popover"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Selector de fechas"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <strong style={{ fontSize: '1rem', color: '#1a1a1a' }}>Fechas de estancia</strong>
                      <button
                        type="button"
                        onClick={() => setShowDatesPopover(false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                        aria-label="Cerrar selector de fechas"
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexDirection: 'column' }}>
                      <div>
                        <label htmlFor="bk-checkin-date" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                          Fecha de entrada (Check-in)
                        </label>
                        <input
                          id="bk-checkin-date"
                          type="date"
                          value={checkin}
                          onChange={(e) => setCheckin(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: '0.95rem' }}
                        />
                      </div>
                      <div>
                        <label htmlFor="bk-checkout-date" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                          Fecha de salida (Check-out)
                        </label>
                        <input
                          id="bk-checkout-date"
                          type="date"
                          value={checkout}
                          min={checkin || undefined}
                          onChange={(e) => setCheckout(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: '0.95rem' }}
                        />
                      </div>
                      {checkin && checkout && checkout <= checkin && (
                        <p role="alert" style={{ margin: 0, color: '#d4111e', fontSize: '0.85rem', fontWeight: 600 }}>
                          La fecha de salida debe ser posterior a la de entrada.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      style={{
                        marginTop: 16,
                        width: '100%',
                        background: '#006ce4',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '12px',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        minHeight: 44,
                      }}
                      onClick={() => setShowDatesPopover(false)}
                    >
                      Aplicar fechas
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Ocupación */}
            <div
              className="bk-search-field"
              onClick={() => {
                setShowOccupancyPopover(!showOccupancyPopover);
                setShowDatesPopover(false);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowOccupancyPopover(!showOccupancyPopover);
                  setShowDatesPopover(false);
                }
              }}
              aria-haspopup="dialog"
              aria-expanded={showOccupancyPopover}
              aria-label="Seleccionar personas y habitaciones"
            >
              <span style={{ color: '#474747', display: 'flex' }} aria-hidden="true">
                <UsersIcon size={22} color="#474747" />
              </span>
              <div className="bk-field-content">
                <span className="bk-field-label">Selecciona la ocupación</span>
                <span className="bk-field-value">
                  {adults} adultos · {children} niños · {rooms} hab.
                </span>
              </div>
              <span style={{ display: 'flex', alignItems: 'center' }} aria-hidden="true">
                <ChevronDownIcon size={16} color="#1a1a1a" />
              </span>

              {showOccupancyPopover && (
                <>
                  <div
                    className="bk-popover-backdrop"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowOccupancyPopover(false);
                    }}
                    aria-hidden="true"
                  />
                  <div
                    className="bk-search-popover right"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Selector de ocupación y habitaciones"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <strong style={{ fontSize: '1rem', color: '#1a1a1a' }}>Huéspedes y habitaciones</strong>
                      <button
                        type="button"
                        onClick={() => setShowOccupancyPopover(false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                        aria-label="Cerrar selector de ocupación"
                      >
                        ✕
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#1a1a1a' }}>Adultos</div>
                        <div style={{ fontSize: '0.8rem', color: '#595959' }}>18 años o más</div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="bk-stepper-btn"
                          disabled={adults <= 1}
                          onClick={() => setAdults((a) => Math.max(1, a - 1))}
                          aria-label="Reducir adultos"
                        >
                          −
                        </button>
                        <span style={{ fontWeight: 700, minWidth: 24, textAlign: 'center', fontSize: '1rem' }} aria-live="polite">
                          {adults}
                        </span>
                        <button
                          type="button"
                          className="bk-stepper-btn"
                          onClick={() => setAdults((a) => a + 1)}
                          aria-label="Aumentar adultos"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#1a1a1a' }}>Niños</div>
                        <div style={{ fontSize: '0.8rem', color: '#595959' }}>De 0 a 17 años</div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="bk-stepper-btn"
                          disabled={children <= 0}
                          onClick={() => setChildren((c) => Math.max(0, c - 1))}
                          aria-label="Reducir niños"
                        >
                          −
                        </button>
                        <span style={{ fontWeight: 700, minWidth: 24, textAlign: 'center', fontSize: '1rem' }} aria-live="polite">
                          {children}
                        </span>
                        <button
                          type="button"
                          className="bk-stepper-btn"
                          onClick={() => setChildren((c) => c + 1)}
                          aria-label="Aumentar niños"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#1a1a1a' }}>Habitaciones</div>
                        <div style={{ fontSize: '0.8rem', color: '#595959' }}>Total de cuartos</div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="bk-stepper-btn"
                          disabled={rooms <= 1}
                          onClick={() => setRooms((r) => Math.max(1, r - 1))}
                          aria-label="Reducir habitaciones"
                        >
                          −
                        </button>
                        <span style={{ fontWeight: 700, minWidth: 24, textAlign: 'center', fontSize: '1rem' }} aria-live="polite">
                          {rooms}
                        </span>
                        <button
                          type="button"
                          className="bk-stepper-btn"
                          onClick={() => setRooms((r) => r + 1)}
                          aria-label="Aumentar habitaciones"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      style={{
                        marginTop: 10,
                        width: '100%',
                        background: '#006ce4',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '12px',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        minHeight: 44,
                      }}
                      onClick={() => setShowOccupancyPopover(false)}
                    >
                      Listo
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Botón Buscar */}
            <button
              type="submit"
              className="bk-search-submit-btn"
              aria-label="Buscar alojamientos disponibles"
            >
              Buscar
            </button>
          </div>

          <div className="bk-work-travel-checkbox">
            <input
              type="checkbox"
              id="work-check"
              checked={workTravel}
              onChange={(e) => setWorkTravel(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#006ce4' }}
              aria-label="Viajo por trabajo"
            />
            <label htmlFor="work-check" style={{ cursor: 'pointer', fontSize: '14px', color: '#1a1a1a', fontWeight: 500 }}>
              Viajo por trabajo
            </label>
          </div>
        </form>
      </div>

      {/* ======================================================================
          MAIN CONTAINER
          ====================================================================== */}
      <main className="bk-main-container">
        {/* ======================================================================
            3. OFERTAS DE FIN DE AÑO
            ====================================================================== */}
        <section style={{ marginBottom: '48px' }}>
          <div className="bk-section-header">
            <h2 className="bk-section-title">Ofertas</h2>
            <p className="bk-section-subtitle">Promociones, descuentos y ofertas especiales para ti</p>
          </div>

          <div
            style={{
              border: '1px solid #e7e7e7',
              borderRadius: '8px',
              padding: '24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#ffffff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              gap: '24px',
            }}
          >
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#474747', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Oferta de fin de año
              </span>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1a1a1a', margin: '6px 0 8px 0' }}>
                15% o más de descuento en estancias
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#474747', marginBottom: '16px', lineHeight: 1.45 }}>
                Escápate por menos con nuestras ofertas de escapada. Reserva hasta el 7 de enero de 2027 para estancias entre el 1 de octubre de 2026 y el 7 de enero de 2027.
              </p>
              <button
                type="button"
                onClick={() => handleDestinationClick('Quito')}
                style={{
                  background: '#006ce4',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '10px 20px',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                }}
              >
                Buscar ofertas
              </button>
            </div>
            <div
              style={{
                width: '180px',
                height: '130px',
                borderRadius: '8px',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <img
                src="https://q-xx.bstatic.com/xdata/images/xphoto/248x248/724373946.jpeg?k=bbafa681a42077cba60100c332d198e01b810d69c85dae01e4812e8a58cfcd4c&o="
                alt="Oferta de escapada"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          </div>
        </section>

        {/* ======================================================================
            4. ¿BUSCAS UNA ESCAPADA A LA PLAYA? (Looking for a beach trip?)
            ====================================================================== */}
        <section className="bk-carousel-outer">
          <div className="bk-section-header">
            <h2 className="bk-section-title">¿Buscas una escapada a la playa?</h2>
            <p className="bk-section-subtitle">Descubre playas, vuelos y mucho más para empezar a planificar</p>
          </div>

          <button
            type="button"
            className="bk-carousel-nav-btn bk-carousel-nav-prev"
            onClick={() => scrollTrack(beachTrackRef, -320)}
            aria-label="Anterior"
          >
            <ChevronLeftIcon size={20} color="#1a1a1a" />
          </button>

          <div className="bk-carousel-track" ref={beachTrackRef}>
            {BEACH_TRIPS.map((item) => (
              <div
                key={item.id}
                className="bk-beach-card"
                onClick={() => handleDestinationClick(item.dest)}
              >
                <div className="bk-beach-img-box">
                  <img src={item.img} alt={item.title} loading="lazy" />
                </div>
                <h3 className="bk-beach-title">{item.title}</h3>
                <div className="bk-beach-subtitle">{item.subtitle}</div>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="bk-carousel-nav-btn bk-carousel-nav-next"
            onClick={() => scrollTrack(beachTrackRef, 320)}
            aria-label="Siguiente"
          >
            <ChevronRightIcon size={20} color="#1a1a1a" />
          </button>
        </section>

        {/* ======================================================================
            5. OFERTAS PARA EL FIN DE SEMANA (Deals for the weekend)
            ====================================================================== */}
        <section className="bk-carousel-outer">
          <div className="bk-section-header">
            <h2 className="bk-section-title">Ofertas para el fin de semana</h2>
            <p className="bk-section-subtitle">Ahorra en estancias del 9 al 11 de octubre</p>
          </div>

          <button
            type="button"
            className="bk-carousel-nav-btn bk-carousel-nav-prev"
            onClick={() => scrollTrack(dealsTrackRef, -300)}
            aria-label="Anterior"
          >
            <ChevronLeftIcon size={20} color="#1a1a1a" />
          </button>

          <div className="bk-carousel-track" ref={dealsTrackRef}>
            {alojamientos.slice(0, 10).map((alojamiento) => (
              <div key={alojamiento.id} className="bk-deal-card-slide">
                <AlojamientoCard
                  alojamiento={alojamiento}
                  nights={2}
                  showDealBadge={true}
                  isGenius={true}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            className="bk-carousel-nav-btn bk-carousel-nav-next"
            onClick={() => scrollTrack(dealsTrackRef, 300)}
            aria-label="Siguiente"
          >
            <ChevronRightIcon size={20} color="#1a1a1a" />
          </button>
        </section>

        {/* ======================================================================
            6. TIPOS DE ALOJAMIENTO ÚNICOS EN QUITO (Property types unique to Quito)
            ====================================================================== */}
        <section className="bk-carousel-outer">
          <div className="bk-section-header">
            <h2 className="bk-section-title">Tipos de alojamiento únicos en Quito</h2>
            <p className="bk-section-subtitle">Alójate con estilo en tu próximo viaje</p>
          </div>

          <button
            type="button"
            className="bk-carousel-nav-btn bk-carousel-nav-prev"
            onClick={() => scrollTrack(uniqueQuitoTrackRef, -280)}
            aria-label="Anterior"
          >
            <ChevronLeftIcon size={20} color="#1a1a1a" />
          </button>

          <div className="bk-carousel-track" ref={uniqueQuitoTrackRef}>
            {UNIQUE_QUITO_THEMES.map((theme) => (
              <div
                key={theme.id}
                className="bk-immersive-card"
                onClick={() => handleDestinationClick('Quito')}
              >
                <img src={theme.img} alt={theme.title} loading="lazy" />
                <div className="bk-immersive-scrim">
                  <h3 className="bk-immersive-title">{theme.title}</h3>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="bk-carousel-nav-btn bk-carousel-nav-next"
            onClick={() => scrollTrack(uniqueQuitoTrackRef, 280)}
            aria-label="Siguiente"
          >
            <ChevronRightIcon size={20} color="#1a1a1a" />
          </button>
        </section>

        {/* ======================================================================
            7. BUSCAR POR TIPO DE ALOJAMIENTO (Browse by property type)
            ====================================================================== */}
        <section className="bk-carousel-outer">
          <div className="bk-section-header">
            <h2 className="bk-section-title">Buscar por tipo de alojamiento</h2>
          </div>

          <button
            type="button"
            className="bk-carousel-nav-btn bk-carousel-nav-prev"
            onClick={() => scrollTrack(browseTypesTrackRef, -280)}
            aria-label="Anterior"
          >
            <ChevronLeftIcon size={20} color="#1a1a1a" />
          </button>

          <div className="bk-carousel-track" ref={browseTypesTrackRef}>
            {BROWSE_PROPERTY_TYPES.map((pt, idx) => (
              <div
                key={idx}
                className="bk-proptype-card"
                onClick={() => handlePropertyTypeClick(pt.type || pt.name)}
              >
                <div className="bk-proptype-img-box">
                  <img src={pt.img} alt={pt.name} loading="lazy" />
                </div>
                <h3 className="bk-proptype-title">{pt.name}</h3>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="bk-carousel-nav-btn bk-carousel-nav-next"
            onClick={() => scrollTrack(browseTypesTrackRef, 280)}
            aria-label="Siguiente"
          >
            <ChevronRightIcon size={20} color="#1a1a1a" />
          </button>
        </section>

        {/* ======================================================================
            8. DESTINOS DE MODA (Trending destinations)
            ====================================================================== */}
        <section style={{ marginBottom: '48px' }}>
          <div className="bk-section-header">
            <h2 className="bk-section-title">Destinos de moda</h2>
            <p className="bk-section-subtitle">Las personas que buscan Ecuador también reservaron aquí</p>
          </div>

          <div className="bk-postcards-grid">
            {/* Top row: 2 grandes */}
            <div className="bk-postcards-row-top">
              {TRENDING_DESTINATIONS_EC.slice(0, 2).map((dest) => (
                <div
                  key={dest.id}
                  className="bk-postcard large"
                  onClick={() => handleDestinationClick(dest.name)}
                >
                  <img src={dest.img} alt={dest.name} loading="lazy" />
                  <div className="bk-postcard-overlay">
                    <h3 className="bk-postcard-name">{dest.name}</h3>
                    <EcuadorFlagIcon size={24} />
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom row: 3 medianos */}
            <div className="bk-postcards-row-bottom">
              {TRENDING_DESTINATIONS_EC.slice(2).map((dest) => (
                <div
                  key={dest.id}
                  className="bk-postcard small"
                  onClick={() => handleDestinationClick(dest.name)}
                >
                  <img src={dest.img} alt={dest.name} loading="lazy" />
                  <div className="bk-postcard-overlay">
                    <h3 className="bk-postcard-name">{dest.name}</h3>
                    <EcuadorFlagIcon size={20} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ======================================================================
            9. DESCUBRE ECUADOR (Explore Ecuador)
            ====================================================================== */}
        <section className="bk-carousel-outer">
          <div className="bk-section-header">
            <h2 className="bk-section-title">Descubre Ecuador</h2>
            <p className="bk-section-subtitle">Estos destinos populares tienen mucho que ofrecer</p>
          </div>

          <button
            type="button"
            className="bk-carousel-nav-btn bk-carousel-nav-prev"
            onClick={() => scrollTrack(exploreTrackRef, -260)}
            aria-label="Anterior"
          >
            <ChevronLeftIcon size={20} color="#1a1a1a" />
          </button>

          <div className="bk-carousel-track" ref={exploreTrackRef}>
            {EXPLORE_ECUADOR.map((item, idx) => (
              <div
                key={idx}
                className="bk-beach-card"
                style={{ flex: '0 0 190px' }}
                onClick={() => handleDestinationClick(item.name)}
              >
                <div className="bk-beach-img-box" style={{ aspectRatio: '5 / 4' }}>
                  <img src={item.img} alt={item.name} loading="lazy" />
                </div>
                <h3 className="bk-beach-title">{item.name}</h3>
                <div className="bk-beach-subtitle">{item.count} alojamientos</div>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="bk-carousel-nav-btn bk-carousel-nav-next"
            onClick={() => scrollTrack(exploreTrackRef, 260)}
            aria-label="Siguiente"
          >
            <ChevronRightIcon size={20} color="#1a1a1a" />
          </button>
        </section>

        {/* ======================================================================
            10. PLANIFICADOR DE VIAJES FÁCIL Y RÁPIDO (Quick and easy trip planner)
            ====================================================================== */}
        <section className="bk-carousel-outer">
          <div className="bk-section-header">
            <h2 className="bk-section-title">Planificador de viajes fácil y rápido</h2>
            <p className="bk-section-subtitle">Elige un estilo y explora los mejores destinos de Ecuador</p>
          </div>

          {/* Tabs */}
          <div className="bk-tabs-nav">
            {TRIP_PLANNER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`bk-tab-item ${activePlannerTab === tab.id ? 'active' : ''}`}
                onClick={() => setActivePlannerTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="bk-carousel-nav-btn bk-carousel-nav-prev"
            onClick={() => scrollTrack(plannerTrackRef, -260)}
            aria-label="Anterior"
          >
            <ChevronLeftIcon size={20} color="#1a1a1a" />
          </button>

          <div className="bk-carousel-track" ref={plannerTrackRef}>
            {(TRIP_PLANNER_DATA[activePlannerTab] || TRIP_PLANNER_DATA.tranquil).map((item, idx) => (
              <div
                key={idx}
                className="bk-beach-card"
                style={{ flex: '0 0 200px' }}
                onClick={() => handleDestinationClick(item.name)}
              >
                <div className="bk-beach-img-box" style={{ aspectRatio: '5 / 4' }}>
                  <img src={item.img} alt={item.name} loading="lazy" />
                </div>
                <h3 className="bk-beach-title">{item.name}</h3>
                <div className="bk-beach-subtitle">{item.distance}</div>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="bk-carousel-nav-btn bk-carousel-nav-next"
            onClick={() => scrollTrack(plannerTrackRef, 260)}
            aria-label="Siguiente"
          >
            <ChevronRightIcon size={20} color="#1a1a1a" />
          </button>
        </section>

        {/* ======================================================================
            11. ¿POR QUÉ BOOKING.COM? (VENTAJAS COMPETITIVAS)
            ====================================================================== */}
        <section style={{ marginBottom: '48px' }}>
          <div className="bk-section-header">
            <h2 className="bk-section-title">¿Por qué Booking.com?</h2>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
            }}
          >
            <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #e7e7e7' }}>
              <div style={{ marginBottom: '12px' }}>
                <DocumentIcon size={28} color="#003580" />
              </div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '6px' }}>
                Reserva ahora, paga en el alojamiento
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#474747', lineHeight: 1.4 }}>
                Cancelación GRATIS en la mayoría de las habitaciones con política flexible.
              </p>
            </div>

            <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #e7e7e7' }}>
              <div style={{ marginBottom: '12px' }}>
                <ThumbsUpIcon size={28} color="#003580" />
              </div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '6px' }}>
                Más de 300M de comentarios reales
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#474747', lineHeight: 1.4 }}>
                Opiniones auténticas de huéspedes verificados en todo el mundo.
              </p>
            </div>

            <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #e7e7e7' }}>
              <div style={{ marginBottom: '12px' }}>
                <GlobeIcon size={28} color="#003580" />
              </div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '6px' }}>
                Más de 2 millones de alojamientos
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#474747', lineHeight: 1.4 }}>
                Hoteles, departamentos, villas, cabañas y mucho más.
              </p>
            </div>

            <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #e7e7e7' }}>
              <div style={{ marginBottom: '12px' }}>
                <HeadsetIcon size={28} color="#003580" />
              </div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '6px' }}>
                Atención al cliente 24/7 de confianza
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#474747', lineHeight: 1.4 }}>
                Nuestro equipo internacional está a tu disposición en cualquier momento.
              </p>
            </div>
          </div>
        </section>

        {/* ======================================================================
            12. TODOS LOS ALOJAMIENTOS DESTACADOS
            ====================================================================== */}
        <section id="results-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 className="bk-section-title">
                {destination ? `Alojamientos en ${destination}` : 'Alojamientos y hospedajes destacados'}
              </h2>
              <p className="bk-section-subtitle">
                {alojamientos.length} alojamientos disponibles según tu búsqueda
              </p>
            </div>
            {destination && (
              <button
                type="button"
                onClick={() => {
                  setDestination('');
                  fetchData('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#006ce4',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                Limpiar filtro de búsqueda
              </button>
            )}
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#003b95' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                <LoadingSpinnerIcon size={36} color="#003580" />
              </div>
              <p style={{ fontWeight: 600 }}>Cargando alojamientos disponibles...</p>
            </div>
          )}

          {error && (
            <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#b91c1c', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
              <strong>Aviso:</strong> {error}
            </div>
          )}

          {!loading && !error && alojamientos.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px solid #e7e7e7', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                <NoResultsIllustration size={96} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1a1a1a' }}>No se encontraron alojamientos</h3>
              <p style={{ color: '#474747', marginTop: '4px' }}>Prueba buscando otro destino o limpiando los filtros de búsqueda.</p>
            </div>
          )}

          {!loading && !error && alojamientos.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '20px',
              }}
            >
              {alojamientos.map((alojamiento) => (
                <AlojamientoCard
                  key={alojamiento.id}
                  alojamiento={alojamiento}
                  nights={2}
                  showDealBadge={true}
                  isGenius={true}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
