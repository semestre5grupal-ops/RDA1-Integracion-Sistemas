import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/alojamiento.dart';
import '../../models/atraccion.dart';
import '../../providers/auth_provider.dart';
import '../../providers/currency_provider.dart';
import '../../services/booking_services.dart';
import '../../theme/booking_colors.dart';
import '../../utils/destinos_catalog.dart';
import '../../widgets/booking_footer.dart';
import '../../widgets/booking_nav_header.dart';
import '../../widgets/booking_rating_badge.dart';
import '../../widgets/occupancy_picker_sheet.dart';
import '../../widgets/vuelo_passengers_sheet.dart';
import '../auth/login_screen.dart';
import '../detalle/alojamiento_detail_screen.dart';
import '../detalle/atraccion_detail_screen.dart';
import '../search/alojamientos_search_screen.dart';
import '../search/atracciones_search_screen.dart';
import '../search/autos_search_screen.dart';
import '../search/vuelos_search_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  static const List<String> _autoTimeSlots = [
    '07:00',
    '08:00',
    '09:00',
    '10:00',
    '11:00',
    '12:00',
    '13:00',
    '14:00',
    '15:00',
    '16:00',
    '17:00',
    '18:00',
    '19:00',
    '20:00',
  ];

  MarketplaceCategory _currentCategory = MarketplaceCategory.alojamientos;

  // --- Estado búsqueda Alojamientos ---
  final TextEditingController _alojDestinoCtrl = TextEditingController(text: 'Quito');
  bool _showAlojSuggestions = false;
  DateTime _alojCheckIn = DateTime.now().add(const Duration(days: 3));
  DateTime _alojCheckOut = DateTime.now().add(const Duration(days: 5));
  OccupancySelection _occupancy = const OccupancySelection(adultos: 2, habitaciones: 1);
  String _tripPlannerTab = 'Playa';

  // --- Estado búsqueda Vuelos ---
  bool _isRoundTrip = true;
  String _vueloOrigin = 'UIO';
  String _vueloDest = 'GYE';
  DateTime _vueloDepDate = DateTime.now().add(const Duration(days: 5));
  DateTime _vueloRetDate = DateTime.now().add(const Duration(days: 9));
  VueloPassengersSelection _vueloPassengers = const VueloPassengersSelection(adults: 1);

  // --- Estado búsqueda Autos ---
  final TextEditingController _autoLocCtrl = TextEditingController(text: 'Quito');
  DateTime _autoPickupDate = DateTime.now().add(const Duration(days: 3));
  DateTime _autoDropoffDate = DateTime.now().add(const Duration(days: 6));
  String _autoPickupTime = '10:00';
  String _autoDropoffTime = '10:00';
  bool _driverAge30to65 = true;
  int _autoDriverAge = 30;

  // --- Estado búsqueda Atracciones ---
  final TextEditingController _atrQueryCtrl = TextEditingController();
  DateTime _atrDate = DateTime.now().add(const Duration(days: 4));
  String _atrTabActivo = 'Pichincha';
  String? _atrSearchError; // aviso flotante (símbolos, espacios dobles, 60 caracteres)
  String? _atrFormError; // "Por favor proporcione el destino o atracción."
  bool _atrFlashRed = false;
  bool _atrShowSuggestions = false;
  final FocusNode _atrFocus = FocusNode();
  Timer? _atrFlashTimer;

  /// Sugerencias del buscador (`destinos` en AtraccionesPage.jsx).
  static const List<String> _atrDestinosSugeridos = [
    'Quito',
    'Guayaquil',
    'Cuenca',
    'Baños',
    'Galápagos',
    'Mindo',
    'Mitad del Mundo',
    'Otavalo',
  ];

  // --- Datos Landing en Vivo ---
  bool _loadingCatalog = true;
  List<Alojamiento> _alojamientos = [];
  List<Atraccion> _atracciones = [];
  Timer? _catalogsPollTimer;
  Timer? _atrPollTimer;
  bool _fetchingAloj = false;
  bool _fetchingAtr = false;
  bool _isAppActive = true;
  String? _alojError;
  String? _atrError;
  final ScrollController _scrollCtrl = ScrollController();

  /// Destinos de la sección "Ofertas desde Quito" (DESTINOS_ECUADOR en
  /// VuelosPage.jsx y AutosPage.jsx: mismos datos en ambas verticales).
  static const List<Map<String, String>> _destinosEcuador = [
    {
      'codigo': 'GYE',
      'nombre': 'Guayaquil',
      'descripcion': 'La Perla del Pacífico',
      'imagen': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=240&fit=crop',
      'desde': '\$49',
    },
    {
      'codigo': 'CUE',
      'nombre': 'Cuenca',
      'descripcion': 'Ciudad Patrimonio de la Humanidad',
      'imagen': 'https://images.unsplash.com/photo-1519451241324-20b4ea2c4220?w=400&h=240&fit=crop',
      'desde': '\$59',
    },
    {
      'codigo': 'LOH',
      'nombre': 'Loja',
      'descripcion': 'La Capital Musical del Ecuador',
      'imagen': 'https://images.unsplash.com/photo-1465447142348-e9952c393450?w=400&h=240&fit=crop',
      'desde': '\$69',
    },
    {
      'codigo': 'GPS',
      'nombre': 'Galápagos',
      'descripcion': 'Paraíso natural único en el mundo',
      'imagen': 'https://cf.bstatic.com/xdata/images/city/600x600/789773.jpg?k=d69235159c2c6133ca29b3c7dfd4898da8521973758ff4e389458e17f9f9c0a4&o=',
      'desde': '\$119',
    },
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadInitialCatalogs();
    _atrFocus.addListener(() {
      if (!_atrFocus.hasFocus) {
        // handleSearchBlur(): oculta sugerencias y normaliza espacios.
        Future.delayed(const Duration(milliseconds: 200), () {
          if (!mounted) return;
          final norm = _atrQueryCtrl.text.trim().replaceAll(RegExp(r'\s{2,}'), ' ');
          setState(() {
            _atrShowSuggestions = false;
            if (norm != _atrQueryCtrl.text) _atrQueryCtrl.text = norm;
          });
        });
      } else {
        setState(() => _atrShowSuggestions = _atrQueryCtrl.text.trim().isNotEmpty);
      }
    });
    // Sondeo silencioso eficiente: solo consulta cuando la pestaña/app está activa
    // y con cadencia moderada para evitar consumo excesivo de cuota (egress).
    _catalogsPollTimer = Timer.periodic(const Duration(seconds: 15), (_) => _pollAlojamientos());
    _atrPollTimer = Timer.periodic(const Duration(seconds: 20), (_) => _pollAtracciones());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final active = state == AppLifecycleState.resumed;
    if (active && !_isAppActive) {
      _isAppActive = true;
      _pollAlojamientos();
      _pollAtracciones();
    } else if (!active) {
      _isAppActive = false;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _catalogsPollTimer?.cancel();
    _atrPollTimer?.cancel();
    _scrollCtrl.dispose();
    _alojDestinoCtrl.dispose();
    _autoLocCtrl.dispose();
    _atrQueryCtrl.dispose();
    _atrFocus.dispose();
    _atrFlashTimer?.cancel();
    super.dispose();
  }

  /// Carga los catálogos en vivo de la landing (alojamientos y atracciones,
  /// igual que AlojamientosPage.jsx y AtraccionesPage.jsx). Cada fuente es
  /// independiente: si una falla no borra la otra, y en el sondeo silencioso un
  /// error transitorio conserva lo último que se vio de los socios.
  Future<void> _loadInitialCatalogs({bool silent = false}) async {
    if (!silent && mounted) setState(() => _loadingCatalog = true);
    await Future.wait([_pollAlojamientos(), _pollAtracciones()]);
    if (mounted && !silent) setState(() => _loadingCatalog = false);
  }

  /// Cada fuente es independiente y no se encima (isFetchingRef de React):
  /// un error transitorio conserva lo último que se vio de los socios.
  Future<void> _pollAlojamientos() async {
    if (_fetchingAloj || !_isAppActive) return;
    _fetchingAloj = true;
    try {
      final data = await BookingServices.getAlojamientos(page: 1, limit: 15);
      if (mounted) {
        setState(() {
          _alojamientos = data;
          _alojError = null;
        });
      }
    } catch (_) {
      // Se conserva la lista previa: no se reemplaza por datos de ejemplo.
      // Igual que React, el aviso solo aparece si aún no hay datos en pantalla.
      if (mounted && _alojamientos.isEmpty) {
        setState(() => _alojError = 'No se pudieron cargar los alojamientos desde el servidor.');
      }
    } finally {
      _fetchingAloj = false;
    }
  }

  Future<void> _pollAtracciones() async {
    if (_fetchingAtr || !_isAppActive) return;
    _fetchingAtr = true;
    try {
      final data = await BookingServices.getAtracciones(page: 1, limit: 100);
      if (mounted) {
        setState(() {
          _atracciones = data;
          _atrError = null;
        });
      }
    } catch (_) {
      if (mounted && _atracciones.isEmpty) {
        setState(() => _atrError = 'No se pudo conectar con el servicio de Atracciones.');
      }
    } finally {
      _fetchingAtr = false;
    }
  }

  void _launchAlojamientosSearch({String? forcedDestino, String? propertyType}) {
    final dest = (forcedDestino ?? _alojDestinoCtrl.text).trim();
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => AlojamientosSearchScreen(
          initialDestino: dest.isNotEmpty ? dest : 'Quito',
          initialCheckIn: _alojCheckIn,
          initialCheckOut: _alojCheckOut,
          initialOccupancy: _occupancy,
          initialPropertyType: propertyType,
        ),
      ),
    );
  }

  void _launchVuelosSearch({String? orig, String? dest, bool? roundTrip}) {
    final o = orig ?? _vueloOrigin;
    final d = dest ?? _vueloDest;
    if (o == d) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('El aeropuerto de origen y destino no pueden ser iguales.'),
          backgroundColor: BookingColors.errorRed,
        ),
      );
      return;
    }
    final isRt = roundTrip ?? _isRoundTrip;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => VuelosSearchScreen(
          originIata: o,
          destinationIata: d,
          departureDate: _vueloDepDate,
          returnDate: isRt ? _vueloRetDate : null,
          isRoundTrip: isRt,
          initialPassengers: _vueloPassengers,
        ),
      ),
    );
  }

  void _launchAutosSearch({String? forcedLocation}) {
    final loc = (forcedLocation ?? _autoLocCtrl.text).trim();
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => AutosSearchScreen(
          initialLocation: loc.isNotEmpty ? loc : 'Quito',
          initialPickupDate: _autoPickupDate,
          initialDropoffDate: _autoDropoffDate,
          initialPickupTime: _autoPickupTime,
          initialDropoffTime: _autoDropoffTime,
          initialDriverAge: _driverAge30to65 ? 30 : _autoDriverAge,
        ),
      ),
    );
  }

  void _atrTriggerFlash(String msg) {
    _atrFlashTimer?.cancel();
    setState(() {
      _atrSearchError = msg;
      _atrFlashRed = true;
    });
    _atrFlashTimer = Timer(const Duration(milliseconds: 300), () {
      if (mounted) setState(() => _atrFlashRed = false);
    });
  }

  static final RegExp _atrInvalidChars = RegExp(r'[^a-zA-Z0-9\s,áéíóúÁÉÍÓÚñÑ\-_.]');

  /// handleSearchChange() de AtraccionesPage.jsx: corta a 60, elimina símbolos
  /// no permitidos y espacios consecutivos, y avisa con un destello rojo.
  void _onAtrQueryChanged(String raw0) {
    final raw = raw0.length > 60 ? raw0.substring(0, 60) : raw0;
    if (_atrInvalidChars.hasMatch(raw)) {
      _atrTriggerFlash('Solo se permiten letras, números y signos comunes');
    } else if (RegExp(r'\s{2,}').hasMatch(raw)) {
      _atrTriggerFlash('No se permiten espacios consecutivos');
    } else if (raw.length >= 60) {
      _atrTriggerFlash('Límite máximo de 60 caracteres alcanzado');
    } else if (_atrSearchError != null) {
      setState(() => _atrSearchError = null);
    }
    final clean = raw.replaceAll(_atrInvalidChars, '').replaceAll(RegExp(r'\s{2,}'), ' ');
    if (clean != raw0) {
      _atrQueryCtrl.value = TextEditingValue(
        text: clean,
        selection: TextSelection.collapsed(offset: clean.length),
      );
    }
    setState(() {
      _atrShowSuggestions = clean.trim().isNotEmpty;
      _atrFormError = null;
    });
  }

  void _launchAtraccionesSearch({String? forcedQuery}) {
    final q = (forcedQuery ?? _atrQueryCtrl.text).trim().replaceAll(RegExp(r'\s{2,}'), ' ');
    if (q.isEmpty) {
      const mensaje = 'Por favor proporcione el destino o atracción.';
      setState(() => _atrFormError = mensaje);
      _atrTriggerFlash(mensaje);
      return;
    }
    setState(() => _atrFormError = null);
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => AtraccionesSearchScreen(
          initialQuery: q,
          initialDate: _atrDate,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      body: RefreshIndicator(
        onRefresh: _loadInitialCatalogs,
        child: SingleChildScrollView(
          controller: _scrollCtrl,
          physics: const AlwaysScrollableScrollPhysics(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BookingNavHeader(
                currentCategory: _currentCategory,
                onCategoryChanged: (cat) => setState(() => _currentCategory = cat),
              ),
              Transform.translate(
                offset: const Offset(0, -24),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1140),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      child: _buildYellowSearchBox(),
                    ),
                  ),
                ),
              ),
              Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1140),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (_currentCategory == MarketplaceCategory.alojamientos) _buildAlojamientosLanding(),
                      if (_currentCategory == MarketplaceCategory.vuelos) _buildVuelosLanding(),
                      if (_currentCategory == MarketplaceCategory.autos) _buildAutosLanding(),
                      if (_currentCategory == MarketplaceCategory.atracciones) _buildAtraccionesLanding(),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 28),
              const BookingFooter(),
            ],
          ),
        ),
      ),
    );
  }

  // ===========================================================================
  // BUSCADOR AMARILLO OFICIAL BOOKING (4 VERTICALES — RESPONSIVO DESKTOP + MÓVIL)
  // ===========================================================================
  Widget _buildYellowSearchBox() {
    final isWide = MediaQuery.of(context).size.width >= 900;

    return Container(
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: BookingColors.accentYellow,
        borderRadius: BorderRadius.circular(10),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.14),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: isWide
          ? _buildDesktopSearchRow()
          : Column(
              children: [
                if (_currentCategory == MarketplaceCategory.alojamientos) ..._buildAlojSearchFields(),
                if (_currentCategory == MarketplaceCategory.vuelos) ..._buildVueloSearchFields(),
                if (_currentCategory == MarketplaceCategory.autos) ..._buildAutoSearchFields(),
                if (_currentCategory == MarketplaceCategory.atracciones) ..._buildAtrSearchFields(),
              ],
            ),
    );
  }

  Widget _buildDesktopSearchRow() {
    if (_currentCategory == MarketplaceCategory.alojamientos) {
      final cityExtras = _alojamientos.map((e) => e.ciudad).toList();
      final suggestions = DestinosCatalog.buscarDestinosAlojamientos(_alojDestinoCtrl.text, extraCatalogo: cityExtras);
      return Column(
        children: [
          Row(
            children: [
              Expanded(
                flex: 3,
                child: _whiteFieldBox(
                  child: Row(
                    children: [
                      const Icon(Icons.bed_outlined, color: BookingColors.textMuted, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _alojDestinoCtrl,
                          onTap: () => setState(() => _showAlojSuggestions = true),
                          onChanged: (_) => setState(() => _showAlojSuggestions = true),
                          decoration: const InputDecoration(
                            hintText: '¿Adónde vas? Ej. Quito, Galápagos, Cuenca',
                            border: InputBorder.none,
                            isDense: true,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 4),
              Expanded(
                flex: 2,
                child: _whiteTapBox(
                  icon: Icons.calendar_today_outlined,
                  text: '${DateFormat('dd MMM').format(_alojCheckIn)} - ${DateFormat('dd MMM').format(_alojCheckOut)}',
                  onTap: () async {
                    final cin = await showDatePicker(
                      context: context,
                      initialDate: _alojCheckIn,
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (cin != null) {
                      setState(() {
                        _alojCheckIn = cin;
                        if (!_alojCheckOut.isAfter(_alojCheckIn)) {
                          _alojCheckOut = _alojCheckIn.add(const Duration(days: 2));
                        }
                      });
                    }
                  },
                ),
              ),
              const SizedBox(width: 4),
              Expanded(
                flex: 3,
                child: _whiteTapBox(
                  icon: Icons.people_outline,
                  text: _occupancy.resumenTexto,
                  trailing: const Icon(Icons.keyboard_arrow_down, color: BookingColors.textMuted),
                  onTap: () async {
                    final res = await OccupancyPickerSheet.show(context, initial: _occupancy);
                    if (res != null) setState(() => _occupancy = res);
                  },
                ),
              ),
              const SizedBox(width: 4),
              SizedBox(
                width: 140,
                child: _searchButton('Buscar', () => _launchAlojamientosSearch()),
              ),
            ],
          ),
          if (_showAlojSuggestions && suggestions.isNotEmpty)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
              child: Wrap(
                spacing: 6,
                runSpacing: 4,
                children: [
                  ...suggestions.map((d) => ActionChip(
                        avatar: const Icon(Icons.location_on, size: 14, color: BookingColors.actionBlue),
                        label: Text('${d.nombre} (${d.region})', style: const TextStyle(fontSize: 11)),
                        onPressed: () => setState(() {
                          _alojDestinoCtrl.text = d.nombre;
                          _showAlojSuggestions = false;
                        }),
                      )),
                  ActionChip(
                    label: const Text('Cerrar', style: TextStyle(fontSize: 11)),
                    onPressed: () => setState(() => _showAlojSuggestions = false),
                  ),
                ],
              ),
            ),
        ],
      );
    }

    if (_currentCategory == MarketplaceCategory.vuelos) {
      final airports = DestinosCatalog.todosAeropuertos;
      return Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            margin: const EdgeInsets.only(bottom: 4),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
            child: Row(
              children: [
                ChoiceChip(
                  label: Text('Ida y vuelta', style: TextStyle(fontSize: 12, color: _isRoundTrip ? Colors.white : BookingColors.textDark)),
                  selected: _isRoundTrip,
                  selectedColor: BookingColors.actionBlue,
                  onSelected: (_) => setState(() => _isRoundTrip = true),
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: Text('Solo ida', style: TextStyle(fontSize: 12, color: !_isRoundTrip ? Colors.white : BookingColors.textDark)),
                  selected: !_isRoundTrip,
                  selectedColor: BookingColors.actionBlue,
                  onSelected: (_) => setState(() => _isRoundTrip = false),
                ),
                const Spacer(),
                TextButton.icon(
                  onPressed: () => setState(() {
                    final tmp = _vueloOrigin;
                    _vueloOrigin = _vueloDest;
                    _vueloDest = tmp;
                  }),
                  icon: const Icon(Icons.swap_horiz, size: 18),
                  label: const Text('Invertir ruta', style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
          ),
          Row(
            children: [
              Expanded(
                flex: 2,
                child: _whiteFieldBox(
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _vueloOrigin,
                      isExpanded: true,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: BookingColors.textDark),
                      items: airports.map((a) => DropdownMenuItem(value: a.codigo, child: Text('De: ${a.nombre}', overflow: TextOverflow.ellipsis))).toList(),
                      onChanged: (v) {
                        if (v != null) setState(() => _vueloOrigin = v);
                      },
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 4),
              Expanded(
                flex: 2,
                child: _whiteFieldBox(
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _vueloDest,
                      isExpanded: true,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: BookingColors.textDark),
                      items: airports.map((a) => DropdownMenuItem(value: a.codigo, child: Text('A: ${a.nombre}', overflow: TextOverflow.ellipsis))).toList(),
                      onChanged: (v) {
                        if (v != null) setState(() => _vueloDest = v);
                      },
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 4),
              Expanded(
                flex: 2,
                child: _whiteTapBox(
                  icon: Icons.flight_takeoff,
                  text: _isRoundTrip
                      ? '${DateFormat('dd MMM').format(_vueloDepDate)} - ${DateFormat('dd MMM').format(_vueloRetDate)}'
                      : 'Ida: ${DateFormat('dd MMM').format(_vueloDepDate)}',
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: _vueloDepDate,
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (picked != null) {
                      setState(() {
                        _vueloDepDate = picked;
                        if (!_vueloRetDate.isAfter(_vueloDepDate)) _vueloRetDate = _vueloDepDate.add(const Duration(days: 4));
                      });
                    }
                  },
                ),
              ),
              const SizedBox(width: 4),
              Expanded(
                flex: 2,
                child: _whiteTapBox(
                  icon: Icons.people_outline,
                  text: _vueloPassengers.resumenTexto,
                  onTap: () async {
                    final res = await VueloPassengersSheet.show(context, initial: _vueloPassengers);
                    if (res != null) setState(() => _vueloPassengers = res);
                  },
                ),
              ),
              const SizedBox(width: 4),
              SizedBox(width: 140, child: _searchButton('Buscar', () => _launchVuelosSearch())),
            ],
          ),
        ],
      );
    }

    if (_currentCategory == MarketplaceCategory.autos) {
      return Column(
        children: [
          Row(
            children: [
              Expanded(
                flex: 3,
                child: _whiteFieldBox(
                  child: Row(
                    children: [
                      const Icon(Icons.directions_car_outlined, color: BookingColors.textMuted, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _autoLocCtrl,
                          decoration: const InputDecoration(hintText: 'Lugar de recogida (Quito, UIO, GYE...)', border: InputBorder.none, isDense: true),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 4),
              Expanded(
                flex: 2,
                child: _whiteTapBox(
                  icon: Icons.calendar_today,
                  text: '${DateFormat('dd MMM').format(_autoPickupDate)} ($_autoPickupTime)',
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: _autoPickupDate,
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (picked != null) {
                      setState(() {
                        _autoPickupDate = picked;
                        if (!_autoDropoffDate.isAfter(_autoPickupDate)) _autoDropoffDate = _autoPickupDate.add(const Duration(days: 2));
                      });
                    }
                  },
                ),
              ),
              const SizedBox(width: 4),
              Expanded(
                flex: 2,
                child: _whiteTapBox(
                  icon: Icons.event,
                  text: '${DateFormat('dd MMM').format(_autoDropoffDate)} ($_autoDropoffTime)',
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: _autoDropoffDate,
                      firstDate: _autoPickupDate.add(const Duration(days: 1)),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (picked != null) setState(() => _autoDropoffDate = picked);
                  },
                ),
              ),
              const SizedBox(width: 4),
              SizedBox(width: 140, child: _searchButton('Buscar', () => _launchAutosSearch())),
            ],
          ),
          Container(
            margin: const EdgeInsets.only(top: 4),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
            child: Row(
              children: [
                Checkbox(
                  value: _driverAge30to65,
                  onChanged: (v) => setState(() {
                    _driverAge30to65 = v ?? true;
                    if (_driverAge30to65) _autoDriverAge = 30;
                  }),
                ),
                const Text('Conductor entre 30 y 65 años', style: TextStyle(fontSize: 12)),
                if (!_driverAge30to65) ...[
                  const SizedBox(width: 10),
                  IconButton(
                      icon: const Icon(Icons.remove_circle_outline, size: 18), onPressed: _autoDriverAge > 18 ? () => setState(() => _autoDriverAge--) : null),
                  Text('$_autoDriverAge años', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                  IconButton(
                      icon: const Icon(Icons.add_circle_outline, size: 18), onPressed: _autoDriverAge < 99 ? () => setState(() => _autoDriverAge++) : null),
                ],
                const Spacer(),
                ...DestinosCatalog.sugerenciasAutos.take(5).map((loc) => Padding(
                      padding: const EdgeInsets.only(left: 6),
                      child: ActionChip(
                        label: Text(loc, style: const TextStyle(fontSize: 11)),
                        onPressed: () => setState(() => _autoLocCtrl.text = loc),
                      ),
                    )),
              ],
            ),
          ),
        ],
      );
    }

    // Atracciones: un solo campo + "Buscar" (search-box de AtraccionesPage.jsx)
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: _atrSearchInput()),
            const SizedBox(width: 4),
            SizedBox(width: 140, child: _searchButton('Buscar', () => _launchAtraccionesSearch())),
          ],
        ),
        if (_atrFormError != null) _atrFormErrorBox(),
      ],
    );
  }

  List<Widget> _buildAlojSearchFields() {
    final cityExtras = _alojamientos.map((e) => e.ciudad).toList();
    final suggestions = DestinosCatalog.buscarDestinosAlojamientos(_alojDestinoCtrl.text, extraCatalogo: cityExtras);

    return [
      _whiteFieldBox(
        child: Row(
          children: [
            const Icon(Icons.bed_outlined, color: BookingColors.textMuted, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _alojDestinoCtrl,
                onTap: () => setState(() => _showAlojSuggestions = true),
                onChanged: (_) => setState(() => _showAlojSuggestions = true),
                decoration: const InputDecoration(
                  hintText: '¿Adónde vas? Ej. Quito, Galápagos, Cuenca',
                  border: InputBorder.none,
                  isDense: true,
                ),
              ),
            ),
            if (_alojDestinoCtrl.text.isNotEmpty)
              IconButton(
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
                icon: const Icon(Icons.close, size: 18, color: BookingColors.textMuted),
                onPressed: () {
                  _alojDestinoCtrl.clear();
                  setState(() => _showAlojSuggestions = true);
                },
              ),
          ],
        ),
      ),
      if (_showAlojSuggestions && suggestions.isNotEmpty)
        Container(
          margin: const EdgeInsets.only(top: 4),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
          child: Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              ...suggestions.map((d) => ActionChip(
                    avatar: const Icon(Icons.location_on, size: 14, color: BookingColors.actionBlue),
                    label: Text('${d.nombre} (${d.region})', style: const TextStyle(fontSize: 11)),
                    onPressed: () {
                      setState(() {
                        _alojDestinoCtrl.text = d.nombre;
                        _showAlojSuggestions = false;
                      });
                    },
                  )),
              ActionChip(
                label: const Text('Cerrar', style: TextStyle(fontSize: 11)),
                onPressed: () => setState(() => _showAlojSuggestions = false),
              ),
            ],
          ),
        ),
      const SizedBox(height: 4),
      Row(
        children: [
          Expanded(
            child: _whiteTapBox(
              icon: Icons.calendar_today_outlined,
              text: DateFormat('dd MMM yy').format(_alojCheckIn),
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _alojCheckIn,
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 365)),
                );
                if (picked != null) {
                  setState(() {
                    _alojCheckIn = picked;
                    if (!_alojCheckOut.isAfter(_alojCheckIn)) {
                      _alojCheckOut = _alojCheckIn.add(const Duration(days: 2));
                    }
                  });
                }
              },
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: _whiteTapBox(
              icon: Icons.event_outlined,
              text: DateFormat('dd MMM yy').format(_alojCheckOut),
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _alojCheckOut,
                  firstDate: _alojCheckIn.add(const Duration(days: 1)),
                  lastDate: DateTime.now().add(const Duration(days: 365)),
                );
                if (picked != null) setState(() => _alojCheckOut = picked);
              },
            ),
          ),
        ],
      ),
      const SizedBox(height: 4),
      _whiteTapBox(
        icon: Icons.people_outline,
        text: _occupancy.resumenTexto,
        trailing: const Icon(Icons.keyboard_arrow_down, color: BookingColors.textMuted),
        onTap: () async {
          final res = await OccupancyPickerSheet.show(context, initial: _occupancy);
          if (res != null) setState(() => _occupancy = res);
        },
      ),
      const SizedBox(height: 4),
      _searchButton('Buscar alojamientos', () => _launchAlojamientosSearch()),
    ];
  }

  List<Widget> _buildVueloSearchFields() {
    final airports = DestinosCatalog.todosAeropuertos;

    return [
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
        child: Row(
          children: [
            ChoiceChip(
              label: Text('Ida y vuelta', style: TextStyle(fontSize: 12, color: _isRoundTrip ? Colors.white : BookingColors.textDark)),
              selected: _isRoundTrip,
              selectedColor: BookingColors.actionBlue,
              onSelected: (_) => setState(() => _isRoundTrip = true),
            ),
            const SizedBox(width: 8),
            ChoiceChip(
              label: Text('Solo ida', style: TextStyle(fontSize: 12, color: !_isRoundTrip ? Colors.white : BookingColors.textDark)),
              selected: !_isRoundTrip,
              selectedColor: BookingColors.actionBlue,
              onSelected: (_) => setState(() => _isRoundTrip = false),
            ),
            const Spacer(),
            TextButton.icon(
              onPressed: () {
                setState(() {
                  final tmp = _vueloOrigin;
                  _vueloOrigin = _vueloDest;
                  _vueloDest = tmp;
                });
              },
              icon: const Icon(Icons.swap_horiz, size: 18),
              label: const Text('Invertir', style: TextStyle(fontSize: 12)),
            ),
          ],
        ),
      ),
      const SizedBox(height: 4),
      Row(
        children: [
          Expanded(
            child: _whiteFieldBox(
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _vueloOrigin,
                  isExpanded: true,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: BookingColors.textDark),
                  items: airports.map((a) => DropdownMenuItem(value: a.codigo, child: Text('De: ${a.nombre}', overflow: TextOverflow.ellipsis))).toList(),
                  onChanged: (v) {
                    if (v != null) setState(() => _vueloOrigin = v);
                  },
                ),
              ),
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: _whiteFieldBox(
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _vueloDest,
                  isExpanded: true,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: BookingColors.textDark),
                  items: airports.map((a) => DropdownMenuItem(value: a.codigo, child: Text('A: ${a.nombre}', overflow: TextOverflow.ellipsis))).toList(),
                  onChanged: (v) {
                    if (v != null) setState(() => _vueloDest = v);
                  },
                ),
              ),
            ),
          ),
        ],
      ),
      const SizedBox(height: 4),
      Row(
        children: [
          Expanded(
            child: _whiteTapBox(
              icon: Icons.flight_takeoff,
              text: 'Ida: ${DateFormat('dd MMM').format(_vueloDepDate)}',
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _vueloDepDate,
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 365)),
                );
                if (picked != null) {
                  setState(() {
                    _vueloDepDate = picked;
                    if (!_vueloRetDate.isAfter(_vueloDepDate)) {
                      _vueloRetDate = _vueloDepDate.add(const Duration(days: 4));
                    }
                  });
                }
              },
            ),
          ),
          if (_isRoundTrip) ...[
            const SizedBox(width: 4),
            Expanded(
              child: _whiteTapBox(
                icon: Icons.flight_land,
                text: 'Vuelta: ${DateFormat('dd MMM').format(_vueloRetDate)}',
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _vueloRetDate,
                    firstDate: _vueloDepDate.add(const Duration(days: 1)),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                  );
                  if (picked != null) setState(() => _vueloRetDate = picked);
                },
              ),
            ),
          ],
        ],
      ),
      const SizedBox(height: 4),
      _whiteTapBox(
        icon: Icons.people_outline,
        text: _vueloPassengers.resumenTexto,
        trailing: const Icon(Icons.keyboard_arrow_down, color: BookingColors.textMuted),
        onTap: () async {
          final res = await VueloPassengersSheet.show(context, initial: _vueloPassengers);
          if (res != null) setState(() => _vueloPassengers = res);
        },
      ),
      const SizedBox(height: 4),
      _searchButton('Buscar vuelos', () => _launchVuelosSearch()),
    ];
  }

  List<Widget> _buildAutoSearchFields() {
    return [
      _whiteFieldBox(
        child: Row(
          children: [
            const Icon(Icons.directions_car_outlined, color: BookingColors.textMuted, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _autoLocCtrl,
                decoration: const InputDecoration(
                  hintText: 'Ciudad o aeropuerto de recogida (ej. Quito, UIO)',
                  border: InputBorder.none,
                  isDense: true,
                ),
              ),
            ),
          ],
        ),
      ),
      Container(
        margin: const EdgeInsets.only(top: 4),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: DestinosCatalog.sugerenciasAutos.take(7).map((loc) {
              return Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ActionChip(
                  label: Text(loc, style: const TextStyle(fontSize: 11)),
                  onPressed: () => setState(() => _autoLocCtrl.text = loc),
                ),
              );
            }).toList(),
          ),
        ),
      ),
      const SizedBox(height: 4),
      Row(
        children: [
          Expanded(
            flex: 3,
            child: _whiteTapBox(
              icon: Icons.calendar_today,
              text: 'Recogida: ${DateFormat('dd MMM').format(_autoPickupDate)}',
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _autoPickupDate,
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 365)),
                );
                if (picked != null) {
                  setState(() {
                    _autoPickupDate = picked;
                    if (!_autoDropoffDate.isAfter(_autoPickupDate)) {
                      _autoDropoffDate = _autoPickupDate.add(const Duration(days: 2));
                    }
                  });
                }
              },
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            flex: 2,
            child: _whiteFieldBox(
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _autoPickupTime,
                  isExpanded: true,
                  items: _autoTimeSlots.map((t) => DropdownMenuItem(value: t, child: Text(t, style: const TextStyle(fontSize: 13)))).toList(),
                  onChanged: (v) {
                    if (v != null) setState(() => _autoPickupTime = v);
                  },
                ),
              ),
            ),
          ),
        ],
      ),
      const SizedBox(height: 4),
      Row(
        children: [
          Expanded(
            flex: 3,
            child: _whiteTapBox(
              icon: Icons.event,
              text: 'Entrega: ${DateFormat('dd MMM').format(_autoDropoffDate)}',
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _autoDropoffDate,
                  firstDate: _autoPickupDate.add(const Duration(days: 1)),
                  lastDate: DateTime.now().add(const Duration(days: 365)),
                );
                if (picked != null) setState(() => _autoDropoffDate = picked);
              },
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            flex: 2,
            child: _whiteFieldBox(
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _autoDropoffTime,
                  isExpanded: true,
                  items: _autoTimeSlots.map((t) => DropdownMenuItem(value: t, child: Text(t, style: const TextStyle(fontSize: 13)))).toList(),
                  onChanged: (v) {
                    if (v != null) setState(() => _autoDropoffTime = v);
                  },
                ),
              ),
            ),
          ),
        ],
      ),
      const SizedBox(height: 4),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
        child: Column(
          children: [
            Row(
              children: [
                Checkbox(
                  value: _driverAge30to65,
                  onChanged: (v) {
                    setState(() {
                      _driverAge30to65 = v ?? true;
                      if (_driverAge30to65) _autoDriverAge = 30;
                    });
                  },
                ),
                const Expanded(
                  child: Text('Conductor entre 30 y 65 años', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                ),
                if (!_driverAge30to65) ...[
                  IconButton(
                    icon: const Icon(Icons.remove_circle_outline, size: 20),
                    onPressed: _autoDriverAge > 18 ? () => setState(() => _autoDriverAge--) : null,
                  ),
                  Text('$_autoDriverAge años', style: const TextStyle(fontWeight: FontWeight.bold)),
                  IconButton(
                    icon: const Icon(Icons.add_circle_outline, size: 20),
                    onPressed: _autoDriverAge < 99 ? () => setState(() => _autoDriverAge++) : null,
                  ),
                ],
              ],
            ),
            if (!_driverAge30to65 && _autoDriverAge < 25)
              const Padding(
                padding: EdgeInsets.only(bottom: 6),
                child: Text(
                  'Nota: Menores de 25 años tienen recargo por conductor joven.',
                  style: TextStyle(fontSize: 11, color: Colors.deepOrange),
                ),
              ),
          ],
        ),
      ),
      const SizedBox(height: 4),
      _searchButton('Buscar autos', () => _launchAutosSearch()),
    ];
  }

  List<Widget> _buildAtrSearchFields() {
    return [
      _atrSearchInput(),
      const SizedBox(height: 2),
      _searchButton('Buscar', () => _launchAtraccionesSearch()),
      if (_atrFormError != null) _atrFormErrorBox(),
    ];
  }

  /// Campo de búsqueda de atracciones con aviso, contador y sugerencias.
  Widget _atrSearchInput() {
    final q = _atrQueryCtrl.text;
    final sugerencias = _atrDestinosSugeridos.where((d) => d.toLowerCase().contains(q.toLowerCase())).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // El aviso flota 32 px por encima del campo sin desplazarlo
        // (position: absolute; top: -32px en AtraccionesPage.jsx).
        Stack(
          clipBehavior: Clip.none,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: _atrFlashRed ? const Color(0xFFFCE8E6) : Colors.white,
                borderRadius: BorderRadius.circular(2),
                border: Border.all(color: _atrFlashRed ? const Color(0xFFD93025) : Colors.transparent, width: 3),
              ),
              child: Row(
                children: [
                  Icon(Icons.search, color: _atrFlashRed ? const Color(0xFFD93025) : BookingColors.textDark, size: 24),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _atrQueryCtrl,
                      focusNode: _atrFocus,
                      onChanged: _onAtrQueryChanged,
                      onSubmitted: (_) => _launchAtraccionesSearch(),
                      textInputAction: TextInputAction.search,
                      decoration: const InputDecoration(
                        hintText: 'Buscar por nombre de atracción o ciudad...',
                        border: InputBorder.none,
                        isDense: true,
                        contentPadding: EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  if (q.length > 30)
                    Text(
                      '${q.length}/60',
                      style: TextStyle(fontSize: 11.5, color: q.length >= 60 ? const Color(0xFFD93025) : const Color(0xFF9CA3AF)),
                    ),
                ],
              ),
            ),
            if (_atrSearchError != null)
              Positioned(
                top: -32,
                left: 0,
                child: IgnorePointer(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEE2E2),
                      border: Border.all(color: const Color(0xFFEF4444)),
                      borderRadius: BorderRadius.circular(6),
                      boxShadow: const [BoxShadow(color: Color(0x26000000), blurRadius: 8, offset: Offset(0, 2))],
                    ),
                    child: Semantics(
                      liveRegion: true,
                      child: Text(
                        '⚠️ ${_atrSearchError!}',
                        style: const TextStyle(color: Color(0xFF991B1B), fontSize: 13, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        if (_atrShowSuggestions && q.isNotEmpty)
          Material(
            elevation: 4,
            color: Colors.white,
            borderRadius: BorderRadius.circular(4),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 200),
              child: ListView(
                shrinkWrap: true,
                padding: EdgeInsets.zero,
                children: sugerencias.isEmpty
                    ? const [
                        Padding(
                          padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          child: Text('No hay resultados', style: TextStyle(color: Color(0xFF666666), fontSize: 15)),
                        ),
                      ]
                    : sugerencias
                        .map((d) => InkWell(
                              onTap: () {
                                // handleSelectSuggestion()
                                _atrQueryCtrl.text = d;
                                setState(() {
                                  _atrShowSuggestions = false;
                                  _atrSearchError = null;
                                  _atrFormError = null;
                                });
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFE7E7E7)))),
                                child: Row(
                                  children: [
                                    const Text('📍', style: TextStyle(color: Color(0xFF666666))),
                                    const SizedBox(width: 10),
                                    Text(d, style: const TextStyle(fontSize: 15, color: Color(0xFF333333))),
                                  ],
                                ),
                              ),
                            ))
                        .toList(),
              ),
            ),
          ),
      ],
    );
  }

  Widget _atrFormErrorBox() {
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(color: const Color(0xFFFCE8E6), borderRadius: BorderRadius.circular(8)),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error, color: Color(0xFFD93025), size: 20),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              _atrFormError!,
              style: const TextStyle(color: Color(0xFFD93025), fontSize: 15, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  Widget _whiteFieldBox({required Widget child}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
      child: child,
    );
  }

  Widget _whiteTapBox({required IconData icon, required String text, Widget? trailing, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
        child: Row(
          children: [
            Icon(icon, color: BookingColors.textMuted, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                text,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: BookingColors.textDark),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (trailing != null) trailing,
          ],
        ),
      ),
    );
  }

  Widget _searchButton(String label, VoidCallback onPressed) {
    return SizedBox(
      width: double.infinity,
      height: 46,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: BookingColors.actionBlue,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
        ),
        child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
      ),
    );
  }

  // ===========================================================================
  // LANDING: ALOJAMIENTOS
  // ===========================================================================
  Widget _buildAlojamientosLanding() {
    const quickTypes = [
      {'type': 'Hotel', 'title': 'Hoteles', 'icon': Icons.hotel, 'sub': 'Comodidad y desayuno'},
      {'type': 'Departamento', 'title': 'Departamentos', 'icon': Icons.apartment, 'sub': 'Ideal para familias'},
      {'type': 'Hostal', 'title': 'Hostales', 'icon': Icons.night_shelter, 'sub': 'Económico y céntrico'},
      {'type': 'Casa', 'title': 'Cabañas y Casas', 'icon': Icons.cottage, 'sub': 'Naturaleza y privacidad'},
    ];

    const popularDestinos = [
      {
        'name': 'Quito',
        'sub': 'Centro Histórico & La Carolina',
        'img': 'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?auto=format&fit=crop&w=600&q=80'
      },
      {
        'name': 'Guayaquil',
        'sub': 'Malecón 2000 & Las Peñas',
        'img': 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=600&q=80'
      },
      {'name': 'Cuenca', 'sub': 'Río Tomebamba & Cajas', 'img': 'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?auto=format&fit=crop&w=600&q=80'},
      {
        'name': 'Baños de Agua Santa',
        'sub': 'Aventura & Termas',
        'img': 'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?auto=format&fit=crop&w=600&q=80'
      },
      {
        'name': 'Islas Galápagos',
        'sub': 'Santa Cruz & San Cristóbal',
        'img': 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=600&q=80'
      },
    ];

    const plannerSpots = {
      'Playa': ['Montañita', 'Salinas', 'Manta', 'Puerto López'],
      'Montaña': ['Baños de Agua Santa', 'Cotopaxi', 'Riobamba'],
      'Ciudad': ['Quito', 'Guayaquil', 'Cuenca', 'Loja'],
      'Bienestar': ['Baños de Agua Santa', 'Otavalo', 'Mindo'],
    };

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Beneficios Booking
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _benefitCard(Icons.event_available, 'Reserva ahora, paga después', 'Cancelación gratis en la mayoría de habitaciones'),
                _benefitCard(Icons.verified_outlined, 'Tarifas claras SRI', 'Desglose transparente +15% IVA incluido en checkout'),
                _benefitCard(Icons.support_agent, 'Asistencia 24/7', 'Acompañamiento antes, durante y después de tu viaje'),
              ],
            ),
          ),
          const SizedBox(height: 18),

          const Text('Destinos de tendencia en Ecuador', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
          const Text('Opciones populares elegidas por viajeros ecuatorianos', style: TextStyle(fontSize: 12, color: BookingColors.textMuted)),
          const SizedBox(height: 10),
          SizedBox(
            height: 155,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: popularDestinos.length,
              itemBuilder: (_, i) {
                final d = popularDestinos[i];
                return InkWell(
                  onTap: () => _launchAlojamientosSearch(forcedDestino: d['name']),
                  child: Container(
                    width: 210,
                    margin: const EdgeInsets.only(right: 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      image: DecorationImage(image: NetworkImage(d['img']!), fit: BoxFit.cover),
                    ),
                    child: Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(10),
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Colors.transparent, Colors.black.withValues(alpha: 0.72)],
                        ),
                      ),
                      padding: const EdgeInsets.all(12),
                      alignment: Alignment.bottomLeft,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(d['name']!, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                          Text(d['sub']!, style: const TextStyle(color: Colors.white70, fontSize: 11)),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 20),

          const Text('Busca por tipo de alojamiento', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
          const SizedBox(height: 10),
          SizedBox(
            height: 104,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: quickTypes.length,
              itemBuilder: (_, i) {
                final item = quickTypes[i];
                return InkWell(
                  onTap: () => _launchAlojamientosSearch(propertyType: item['type'] as String),
                  child: Container(
                    width: 145,
                    margin: const EdgeInsets.only(right: 10),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(item['icon'] as IconData, color: BookingColors.actionBlue, size: 26),
                        const SizedBox(height: 6),
                        Text(item['title'] as String, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        Text(item['sub'] as String, style: const TextStyle(fontSize: 10, color: BookingColors.textMuted), overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 20),

          const Text('Planifica un viaje fácil y rápido', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: plannerSpots.keys.map((tab) {
              final sel = _tripPlannerTab == tab;
              return ChoiceChip(
                label: Text(tab, style: TextStyle(color: sel ? Colors.white : BookingColors.textDark, fontSize: 12)),
                selected: sel,
                selectedColor: BookingColors.actionBlue,
                onSelected: (_) => setState(() => _tripPlannerTab = tab),
              );
            }).toList(),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: (plannerSpots[_tripPlannerTab] ?? []).map((city) {
              return ActionChip(
                avatar: const Icon(Icons.explore, size: 15, color: BookingColors.primaryBlue),
                label: Text(city),
                onPressed: () => _launchAlojamientosSearch(forcedDestino: city),
              );
            }).toList(),
          ),
          const SizedBox(height: 22),

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Alojamientos destacados', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
              TextButton(onPressed: () => _launchAlojamientosSearch(), child: const Text('Ver todos >')),
            ],
          ),
          if (_loadingCatalog)
            const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
          else if (_alojamientos.isEmpty && _alojError != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(_alojError!, style: const TextStyle(color: Color(0xFFD32F2F))),
            )
          else
            ..._alojamientos.take(6).map((prop) => _buildAlojamientoHomeCard(prop)),
        ],
      ),
    );
  }

  Widget _buildAlojamientoHomeCard(Alojamiento prop) {
    final cur = Provider.of<CurrencyProvider>(context);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 1.5,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => AlojamientoDetailScreen(
                alojamiento: prop,
                initialCheckIn: _alojCheckIn,
                initialCheckOut: _alojCheckOut,
                initialOccupancy: _occupancy,
              ),
            ),
          );
        },
        child: Row(
          children: [
            SizedBox(
              width: 112,
              height: 120,
              child: Image.network(
                prop.imagenUrl ?? '',
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  color: Colors.grey.shade200,
                  child: const Icon(Icons.hotel, color: BookingColors.textMuted),
                ),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            prop.nombre,
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: BookingColors.actionBlue),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        BookingRatingBadge(rating: prop.rating),
                      ],
                    ),
                    Text('${prop.ciudad} · ${prop.tipoPropiedad}', style: const TextStyle(fontSize: 11, color: BookingColors.textMuted)),
                    const SizedBox(height: 4),
                    Text(
                      prop.regimen,
                      style: const TextStyle(fontSize: 11, color: BookingColors.successGreen, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '${cur.formatPrice(prop.precioPorNoche, forceDecimals: false)} / noche',
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: BookingColors.textDark),
                        ),
                        const Text('Ver disponibilidad >', style: TextStyle(fontSize: 11, color: BookingColors.actionBlue, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ===========================================================================
  // LANDING: VUELOS
  // ===========================================================================
  Widget _buildVuelosLanding() {
    // Paridad 1:1 con la vista sin búsqueda de VuelosPage.jsx:
    // Hero "Hay un Ecuador esperándote" → "Ofertas desde Quito" → "Prepárate para viajar".
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _ecuadorHeroBanner(
          imageUrl: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200&h=400&fit=crop',
          texto: 'Te llevamos a los mejores destinos dentro del país para que encuentres los lugares que te muevan. Reserva hoy tu próximo vuelo nacional.',
        ),
        _ofertasDesdeQuito(
          badge: 'Acumula millas',
          semanticPrefix: 'Buscar vuelos a',
          onTap: (dest) {
            // seleccionarDestino(): precarga UIO → destino y lleva al buscador.
            setState(() {
              _vueloOrigin = 'UIO';
              _vueloDest = dest['codigo']!;
            });
            _scrollToSearchBox();
          },
        ),
        Container(
          width: double.infinity,
          margin: const EdgeInsets.only(top: 8),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          decoration: const BoxDecoration(
            color: Color(0xFFF8F8F8),
            border: Border(top: BorderSide(color: Color(0xFFE7E7E7))),
          ),
          child: Column(
            children: [
              const Text(
                'Prepárate para viajar',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 20.8, fontWeight: FontWeight.w700, color: Color(0xFF1A1A1A)),
              ),
              const SizedBox(height: 24),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 340),
                child: Material(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => Navigator.pushNamed(context, '/reservas'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFFE7E7E7)),
                        boxShadow: const [BoxShadow(color: Color(0x12000000), blurRadius: 8, offset: Offset(0, 2))],
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 48,
                            height: 48,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: const Color(0xFFEBF3FF),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Text('🎫', style: TextStyle(fontSize: 24)),
                          ),
                          const SizedBox(width: 16),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Check-in online', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: Color(0xFF1A1A1A))),
                                SizedBox(height: 4),
                                Text(
                                  'Obtén tu pase de abordar y ahorra tiempo en el aeropuerto.',
                                  style: TextStyle(color: Color(0xFF0057B8), fontSize: 13.6, height: 1.4),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  void _scrollToSearchBox() {
    if (_scrollCtrl.hasClients) {
      _scrollCtrl.animateTo(0, duration: const Duration(milliseconds: 350), curve: Curves.easeOut);
    }
  }

  /// Banner "Hay un Ecuador esperándote" (VuelosPage.jsx / AutosPage.jsx).
  Widget _ecuadorHeroBanner({required String imageUrl, required String texto}) {
    final isWide = MediaQuery.of(context).size.width >= 700;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Container(
          width: double.infinity,
          color: const Color(0xFF003B95),
          constraints: const BoxConstraints(minHeight: 260),
          child: Stack(
            children: [
              Positioned.fill(
                child: Opacity(
                  opacity: 0.45,
                  child: Image.network(
                    imageUrl,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                  ),
                ),
              ),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: isWide ? 48 : 24, vertical: 40),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 520),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Hay un Ecuador esperándote',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: isWide ? 35.2 : 27,
                          fontWeight: FontWeight.w800,
                          height: 1.2,
                          shadows: const [Shadow(color: Color(0x66000000), blurRadius: 8, offset: Offset(0, 2))],
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        texto,
                        style: const TextStyle(
                          color: Color(0xE6FFFFFF),
                          fontSize: 16.8,
                          height: 1.6,
                          shadows: [Shadow(color: Color(0x4D000000), blurRadius: 4, offset: Offset(0, 1))],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Sección "Ofertas desde Quito ▾" con la cuadrícula DESTINOS_ECUADOR.
  Widget _ofertasDesdeQuito({
    required String badge,
    required String semanticPrefix,
    required ValueChanged<Map<String, String>> onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text.rich(
            TextSpan(
              text: 'Ofertas desde ',
              children: [TextSpan(text: 'Quito ▾', style: TextStyle(color: Color(0xFF0057B8)))],
            ),
            style: TextStyle(fontSize: 22.4, fontWeight: FontWeight.w700, color: Color(0xFF1A1A1A)),
          ),
          const SizedBox(height: 4),
          const Text(
            'Haz clic en un destino para iniciar tu búsqueda directamente.',
            style: TextStyle(color: Color(0xFF666666), fontSize: 14.4),
          ),
          const SizedBox(height: 20),
          LayoutBuilder(
            builder: (context, c) {
              // grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap 16px
              const gap = 16.0;
              final cols = ((c.maxWidth + gap) / (220 + gap)).floor().clamp(1, 4);
              final w = (c.maxWidth - gap * (cols - 1)) / cols;
              return Wrap(
                spacing: gap,
                runSpacing: gap,
                children: _destinosEcuador.map((d) {
                  return SizedBox(
                    width: w,
                    child: Semantics(
                      button: true,
                      label: '$semanticPrefix ${d['nombre']}',
                      child: _DestinoOfertaCard(destino: d, badge: badge, onTap: () => onTap(d)),
                    ),
                  );
                }).toList(),
              );
            },
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // LANDING: AUTOS
  // ===========================================================================
  Widget _buildAutosLanding() {
    // Paridad 1:1 con la vista sin búsqueda de AutosPage.jsx:
    // Hero "Hay un Ecuador esperándote" → "Ofertas desde Quito".
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _ecuadorHeroBanner(
          imageUrl: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1200&h=400&fit=crop',
          texto: 'Te llevamos a los mejores destinos dentro del país para que encuentres los lugares que te muevan. Reserva hoy tu próximo vehículo.',
        ),
        _ofertasDesdeQuito(
          badge: 'Oferta especial',
          semanticPrefix: 'Buscar coches en',
          onTap: (dest) {
            // handleDestinationCardClick(): fija el lugar de recogida y busca.
            _autoLocCtrl.text = dest['nombre']!;
            _launchAutosSearch(forcedLocation: dest['nombre']);
          },
        ),
      ],
    );
  }

  // ===========================================================================
  // LANDING: ATRACCIONES
  // ===========================================================================
  // Datos de AtraccionesPage.jsx (DESTINOS_TOP, EXPLORA_TABS, DESTINOS_POR_PROVINCIA).
  static const List<Map<String, String>> _destinosTop = [
    {
      'id': 'uio',
      'nombre': 'Quito',
      'cosas': '245 cosas que hacer',
      'img': 'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=800&auto=format&fit=crop'
    },
    {
      'id': 'gye',
      'nombre': 'Guayaquil',
      'cosas': '128 cosas que hacer',
      'img': 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&auto=format&fit=crop'
    },
    {
      'id': 'cue',
      'nombre': 'Cuenca',
      'cosas': '184 cosas que hacer',
      'img': 'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=800&auto=format&fit=crop'
    },
    {
      'id': 'ban',
      'nombre': 'Baños',
      'cosas': '312 cosas que hacer',
      'img': 'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?w=800&auto=format&fit=crop'
    },
    {
      'id': 'gal',
      'nombre': 'Galápagos',
      'cosas': '89 cosas que hacer',
      'img': 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&auto=format&fit=crop'
    },
  ];

  static const List<String> _exploraTabs = ['Pichincha', 'Guayas', 'Azuay', 'Tungurahua', 'Manabí', 'Imbabura', 'Galápagos'];

  static const Map<String, List<Map<String, String>>> _destinosPorProvincia = {
    'Pichincha': [
      {
        'nombre': 'Mitad del Mundo',
        'cosas': '45 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1598971861713-54ad16a7e72e?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Mindo Bosque Nublado',
        'cosas': '78 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Sangolquí & Valle',
        'cosas': '12 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Machachi & Volcanes',
        'cosas': '24 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop'
      },
    ],
    'Guayas': [
      {
        'nombre': 'Malecón 2000',
        'cosas': '52 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Barrio Las Peñas',
        'cosas': '34 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Parque de las Iguanas',
        'cosas': '18 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=800&auto=format&fit=crop'
      },
      {'nombre': 'Isla Santay', 'cosas': '22 cosas que hacer', 'img': 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&auto=format&fit=crop'},
    ],
    'Azuay': [
      {
        'nombre': 'Catedral Nueva de Cuenca',
        'cosas': '38 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Parque Nacional Cajas',
        'cosas': '65 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Mirador de Turi',
        'cosas': '19 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Barranco del Río Tomebamba',
        'cosas': '27 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&auto=format&fit=crop'
      },
    ],
    'Tungurahua': [
      {
        'nombre': 'Pailón del Diablo (Baños)',
        'cosas': '94 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Casa del Árbol & Columpio',
        'cosas': '41 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Cascada Manto de la Novia',
        'cosas': '32 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1533240332313-0db49b459ad6?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Ruta de las Cascadas en Chiva',
        'cosas': '56 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop'
      },
    ],
    'Manabí': [
      {
        'nombre': 'Playa Los Frailes',
        'cosas': '29 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Parque Nacional Machalilla',
        'cosas': '48 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Isla de la Plata',
        'cosas': '31 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Canoa & Clases de Surf',
        'cosas': '23 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=800&auto=format&fit=crop'
      },
    ],
    'Imbabura': [
      {
        'nombre': 'Laguna de Cuicocha',
        'cosas': '35 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Mercado de Ponchos Otavalo',
        'cosas': '60 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Cascada de Peguche',
        'cosas': '21 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Paseo en Lago San Pablo',
        'cosas': '26 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop'
      },
    ],
    'Galápagos': [
      {
        'nombre': 'Estación Charles Darwin',
        'cosas': '42 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Tortuga Bay (Santa Cruz)',
        'cosas': '39 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Túneles de Lava en Isabela',
        'cosas': '51 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&auto=format&fit=crop'
      },
      {
        'nombre': 'Snorkel en Kicker Rock',
        'cosas': '28 cosas que hacer',
        'img': 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&auto=format&fit=crop'
      },
    ],
  };

  static const TextStyle _sectionTitle = TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: BookingColors.textDark);
  static const TextStyle _sectionSubtitle = TextStyle(fontSize: 15.2, color: Color(0xFF474747));

  void _openAtraccionesSearch(String destino) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => AtraccionesSearchScreen(initialQuery: destino, initialDate: _atrDate)),
    );
  }

  /// Imagen con degradado inferior y texto blanco (asc-img / destino-top / explora).
  Widget _overlayImageCard({
    required String imageUrl,
    required double height,
    required double gradientFraction,
    required Widget overlay,
    Widget? badge,
    required VoidCallback onTap,
  }) {
    return _HoverZoomCard(
      onTap: onTap,
      height: height,
      imageUrl: imageUrl,
      gradientFraction: gradientFraction,
      overlay: overlay,
      badge: badge,
    );
  }

  Widget _buildAtraccionesLanding() {
    final auth = Provider.of<AuthProvider>(context);
    final width = MediaQuery.of(context).size.width;
    final isMobile = width <= 768;

    // atraccionesFiltradas: el texto del buscador filtra también la sección "Recomendado".
    final term = _atrQueryCtrl.text.toLowerCase().trim();
    final filtradas = term.isEmpty
        ? _atracciones
        : _atracciones.where((a) {
            return a.nombre.toLowerCase().contains(term) ||
                a.ciudad.toLowerCase().contains(term) ||
                a.descripcion.toLowerCase().contains(term) ||
                a.includes.join(' ').toLowerCase().contains(term);
          }).toList();

    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── RECOMENDADO EN QUITO (datos en vivo de los socios) ──
          const Text('Recomendado en Quito', style: _sectionTitle),
          const SizedBox(height: 4),
          const Text('Nuestra selección de las mejores atracciones basada en IA para ti', style: _sectionSubtitle),
          const SizedBox(height: 16),
          if (_atrError != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Text(_atrError!, style: const TextStyle(color: Color(0xFFD32F2F))),
            ),
          if (_loadingCatalog)
            const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
          else if (filtradas.isEmpty && _atrError != null)
            const SizedBox.shrink()
          else if (filtradas.isEmpty)
            const Padding(
              padding: EdgeInsets.only(bottom: 16),
              child: Text('No hay atracciones publicadas por los proveedores en este momento.', style: _sectionSubtitle),
            )
          else
            SizedBox(
              height: 336,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: filtradas.length > 8 ? 8 : filtradas.length,
                separatorBuilder: (_, __) => const SizedBox(width: 16),
                itemBuilder: (_, idx) {
                  final a = filtradas[idx];
                  return SizedBox(
                    width: 240,
                    child: _overlayImageCard(
                      imageUrl: a.imagenUrl ?? '',
                      height: 320,
                      gradientFraction: 0.5,
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => AtraccionDetailScreen(atraccion: a, initialDate: _atrDate)),
                      ),
                      badge: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(color: BookingColors.darkBlue, borderRadius: BorderRadius.circular(4)),
                        child: Text('#${idx + 1} Más vendido', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                      ),
                      overlay: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(a.nombre,
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700, height: 1.2)),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                                decoration: BoxDecoration(color: BookingColors.darkBlue, borderRadius: BorderRadius.circular(4)),
                                child:
                                    Text(a.rating.toStringAsFixed(1), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13.6)),
                              ),
                              const SizedBox(width: 8),
                              Flexible(
                                child: Text(
                                  '${BookingRatingBadge.textoPuntuacion(a.rating)} (${a.reviewsCount})',
                                  style: const TextStyle(color: Colors.white, fontSize: 12.8, fontWeight: FontWeight.w500),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          const SizedBox(height: 48),

          // ── DESTINOS TOP EN ECUADOR (2 grandes arriba, 3 abajo) ──
          const Text('Destinos top en Ecuador', style: _sectionTitle),
          const SizedBox(height: 16),
          LayoutBuilder(builder: (context, c) {
            const gap = 16.0;
            return Wrap(
              spacing: gap,
              runSpacing: gap,
              children: List.generate(_destinosTop.length, (idx) {
                final d = _destinosTop[idx];
                final w = isMobile ? c.maxWidth : (idx < 2 ? (c.maxWidth - gap) / 2 : (c.maxWidth - gap * 2) / 3);
                return SizedBox(
                  width: w,
                  child: _overlayImageCard(
                    imageUrl: d['img']!,
                    height: 240,
                    gradientFraction: 0.4,
                    onTap: () => _openAtraccionesSearch(d['nombre']!),
                    overlay: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(d['nombre']!,
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 24,
                                fontWeight: FontWeight.w700,
                                shadows: [Shadow(color: Color(0x80000000), blurRadius: 4, offset: Offset(0, 2))])),
                        Text(d['cosas']!, style: const TextStyle(color: Colors.white, fontSize: 14.4, fontWeight: FontWeight.w500)),
                      ],
                    ),
                  ),
                );
              }),
            );
          }),
          const SizedBox(height: 48),

          // ── TU CUENTA, TUS VIAJES (solo sin sesión) ──
          if (!auth.isAuthenticated) ...[
            const Text('Tu cuenta, tus viajes', style: _sectionTitle),
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: BookingColors.borderLight),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: isMobile ? CrossAxisAlignment.center : CrossAxisAlignment.start,
                      children: [
                        Text('Todos los detalles de tus viajes en un mismo lugar',
                            textAlign: isMobile ? TextAlign.center : TextAlign.start, style: const TextStyle(fontSize: 19.2, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 4),
                        Text('Inicia sesión para reservar más rápido y administrar tus viajes fácilmente',
                            textAlign: isMobile ? TextAlign.center : TextAlign.start, style: _sectionSubtitle),
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 16,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            ElevatedButton(
                              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LoginScreen())),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF0071C2),
                                foregroundColor: Colors.white,
                                elevation: 0,
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                              ),
                              child: const Text('Iniciar sesión', style: TextStyle(fontWeight: FontWeight.w600)),
                            ),
                            TextButton(
                              onPressed: () => Navigator.pushNamed(context, '/register'),
                              style: TextButton.styleFrom(foregroundColor: const Color(0xFF0071C2)),
                              child: const Text('Regístrate', style: TextStyle(fontWeight: FontWeight.w600)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (!isMobile) const Text('🎁 Genius', style: TextStyle(fontSize: 48)),
                ],
              ),
            ),
            const SizedBox(height: 48),
          ],

          // ── CUENTA CON NOSOTROS ──
          const Text('Cuenta con nosotros', style: _sectionTitle),
          const SizedBox(height: 16),
          LayoutBuilder(builder: (context, c) {
            const features = [
              ['🎡', 'Descubre las principales atracciones', 'Conoce lo mejor del destino con atracciones, tours, actividades y mucho más'],
              ['⏱️', 'Rápido y flexible', 'Puedes reservar los boletos online en pocos minutos y hay cancelación gratis en muchas atracciones'],
              ['🎧', 'Asistencia cuando lo necesites', 'El equipo de Atención al cliente está a tu disposición para ayudarte las 24 horas, todos los días'],
            ];
            final w = isMobile ? c.maxWidth : (c.maxWidth - 48) / 3;
            return Wrap(
              spacing: 24,
              runSpacing: 24,
              children: features.map((f) {
                return SizedBox(
                  width: w,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(f[0], style: const TextStyle(fontSize: 32)),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(f[1], style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 4),
                            Text(f[2], style: const TextStyle(fontSize: 13.6, color: Color(0xFF474747), height: 1.4)),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            );
          }),
          const SizedBox(height: 48),

          // ── EXPLORA MÁS DESTINOS (pestañas por provincia) ──
          const Text('Explora más destinos', style: _sectionTitle),
          const SizedBox(height: 4),
          const Text('Encuentra cosas que hacer en ciudades de todo el Ecuador', style: _sectionSubtitle),
          const SizedBox(height: 16),
          Container(
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: BookingColors.borderLight))),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _exploraTabs.map((tab) {
                  final active = tab == _atrTabActivo;
                  return Padding(
                    padding: const EdgeInsets.only(right: 16),
                    child: InkWell(
                      onTap: () => setState(() => _atrTabActivo = tab),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          border: Border(bottom: BorderSide(color: active ? const Color(0xFF0071C2) : Colors.transparent, width: 2)),
                        ),
                        child: Text(tab, style: TextStyle(fontSize: 15.2, color: active ? const Color(0xFF0071C2) : const Color(0xFF474747))),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
          const SizedBox(height: 16),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            child: LayoutBuilder(
              key: ValueKey(_atrTabActivo),
              builder: (context, c) {
                const gap = 16.0;
                final cols = isMobile ? 2 : 4;
                final w = (c.maxWidth - gap * (cols - 1)) / cols;
                final lista = _destinosPorProvincia[_atrTabActivo] ?? _destinosPorProvincia['Pichincha']!;
                return Wrap(
                  spacing: gap,
                  runSpacing: gap,
                  children: lista.map((d) {
                    return SizedBox(
                      width: w,
                      child: _overlayImageCard(
                        imageUrl: d['img']!,
                        height: 160,
                        gradientFraction: 0.6,
                        // navigate(`/search?destino=${dest.nombre.split(' ')[0]}`)
                        onTap: () => _openAtraccionesSearch(d['nombre']!.split(' ').first),
                        overlay: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(d['nombre']!, style: const TextStyle(color: Colors.white, fontSize: 17.6, fontWeight: FontWeight.w700)),
                            Text(d['cosas']!, style: const TextStyle(color: Color(0xE6FFFFFF), fontSize: 12.8)),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                );
              },
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _benefitCard(IconData icon, String title, String sub) {
    return Container(
      width: 235,
      margin: const EdgeInsets.only(right: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: BookingColors.actionBlue, size: 24),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                const SizedBox(height: 2),
                Text(sub, style: const TextStyle(fontSize: 11, color: BookingColors.textMuted), maxLines: 2, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Tarjeta de destino de "Ofertas desde Quito" (imagen 150px, badge, nombre,
/// descripción y "Desde $X"), con la elevación al pasar el cursor del original.
class _DestinoOfertaCard extends StatefulWidget {
  final Map<String, String> destino;
  final String badge;
  final VoidCallback onTap;

  const _DestinoOfertaCard({required this.destino, required this.badge, required this.onTap});

  @override
  State<_DestinoOfertaCard> createState() => _DestinoOfertaCardState();
}

class _DestinoOfertaCardState extends State<_DestinoOfertaCard> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final d = widget.destino;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          transform: Matrix4.translationValues(0, _hover ? -4 : 0, 0),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: _hover ? const Color(0x2E000000) : const Color(0x1A000000),
                blurRadius: _hover ? 24 : 12,
                offset: Offset(0, _hover ? 8 : 2),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                height: 150,
                width: double.infinity,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.network(
                      d['imagen']!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Image.network(
                        'https://picsum.photos/seed/${d['codigo']}/400/240',
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(color: const Color(0xFFE7E7E7)),
                      ),
                    ),
                    Positioned(
                      top: 10,
                      left: 10,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xEBFFFFFF),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          widget.badge,
                          style: const TextStyle(color: Color(0xFF0057B8), fontSize: 11.5, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(d['nombre']!, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16.8, color: Color(0xFF1A1A1A))),
                    const SizedBox(height: 2),
                    Text(d['descripcion']!, style: const TextStyle(color: Color(0xFF666666), fontSize: 13.1)),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Text('Desde', style: TextStyle(color: Color(0xFF888888), fontSize: 12.8)),
                        const SizedBox(width: 6),
                        Text(d['desde']!, style: const TextStyle(color: Color(0xFF0057B8), fontWeight: FontWeight.w800, fontSize: 17.6)),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Tarjeta de imagen con zoom al pasar el cursor (`:hover img { scale(1.05) }`)
/// y degradado inferior `linear-gradient(to top, rgba(0,0,0,0.8), transparent)`.
class _HoverZoomCard extends StatefulWidget {
  final VoidCallback onTap;
  final double height;
  final String imageUrl;
  final double gradientFraction;
  final Widget overlay;
  final Widget? badge;

  const _HoverZoomCard({
    required this.onTap,
    required this.height,
    required this.imageUrl,
    required this.gradientFraction,
    required this.overlay,
    this.badge,
  });

  @override
  State<_HoverZoomCard> createState() => _HoverZoomCardState();
}

class _HoverZoomCardState extends State<_HoverZoomCard> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: SizedBox(
            height: widget.height,
            child: Stack(
              fit: StackFit.expand,
              children: [
                AnimatedScale(
                  scale: _hover ? 1.05 : 1.0,
                  duration: const Duration(milliseconds: 300),
                  child: Image.network(
                    widget.imageUrl,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      color: const Color(0xFFD9D9D9),
                      child: const Icon(Icons.image_not_supported_outlined, color: Colors.white),
                    ),
                  ),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: widget.height * widget.gradientFraction,
                  child: const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.bottomCenter,
                        end: Alignment.topCenter,
                        colors: [Color(0xCC000000), Color(0x00000000)],
                      ),
                    ),
                  ),
                ),
                if (widget.badge != null) Positioned(top: 12, left: 12, child: widget.badge!),
                Positioned(left: 12, right: 12, bottom: 12, child: widget.overlay),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
