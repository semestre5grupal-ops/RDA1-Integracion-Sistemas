import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/alojamiento.dart';
import '../../models/atraccion.dart';
import '../../models/auto.dart';
import '../../models/vuelo.dart';
import '../../providers/auth_provider.dart';
import '../../services/booking_services.dart';
import '../../theme/booking_colors.dart';
import '../../utils/destinos_catalog.dart';
import '../../widgets/booking_nav_header.dart';
import '../../widgets/booking_rating_badge.dart';
import '../../widgets/occupancy_picker_sheet.dart';
import '../../widgets/vuelo_passengers_sheet.dart';
import '../auth/login_screen.dart';
import '../detalle/alojamiento_detail_screen.dart';
import '../detalle/atraccion_detail_screen.dart';
import '../detalle/auto_detail_screen.dart';
import '../detalle/vuelo_detail_screen.dart';
import '../search/alojamientos_search_screen.dart';
import '../search/atracciones_search_screen.dart';
import '../search/autos_search_screen.dart';
import '../search/vuelos_search_screen.dart';
import '../vuelos/estado_vuelo_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const List<String> _autoTimeSlots = [
    '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
  ];

  MarketplaceCategory _currentCategory = MarketplaceCategory.alojamientos;

  // --- Estado búsqueda Alojamientos ---
  final TextEditingController _alojDestinoCtrl = TextEditingController(text: 'Quito');
  bool _showAlojSuggestions = false;
  DateTime _alojCheckIn = DateTime.now().add(const Duration(days: 3));
  DateTime _alojCheckOut = DateTime.now().add(const Duration(days: 5));
  OccupancySelection _occupancy = const OccupancySelection(adultos: 2, ninos: 0, habitaciones: 1);
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
  String _atrRegionTab = 'Sierra';

  // --- Datos Landing en Vivo ---
  bool _loadingCatalog = true;
  List<Alojamiento> _alojamientos = [];
  List<Atraccion> _atracciones = [];
  List<Auto> _autos = [];
  List<Vuelo> _vuelos = [];

  @override
  void initState() {
    super.initState();
    _loadInitialCatalogs();
  }

  @override
  void dispose() {
    _alojDestinoCtrl.dispose();
    _autoLocCtrl.dispose();
    _atrQueryCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadInitialCatalogs() async {
    setState(() => _loadingCatalog = true);
    try {
      final results = await Future.wait([
        BookingServices.getAlojamientos(page: 1, limit: 15),
        BookingServices.getAtracciones(page: 1, limit: 25),
        BookingServices.getAutos(location: 'Quito'),
        BookingServices.getVuelos(),
      ]);
      if (mounted) {
        setState(() {
          _alojamientos = results[0] as List<Alojamiento>;
          _atracciones = results[1] as List<Atraccion>;
          _autos = results[2] as List<Auto>;
          _vuelos = results[3] as List<Vuelo>;
          _loadingCatalog = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingCatalog = false);
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

  void _launchAtraccionesSearch({String? forcedQuery}) {
    final q = (forcedQuery ?? _atrQueryCtrl.text).trim();
    if (q.length > 60) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('El texto de búsqueda no puede superar 60 caracteres.')),
      );
      return;
    }
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
          physics: const AlwaysScrollableScrollPhysics(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BookingNavHeader(
                currentCategory: _currentCategory,
                onCategoryChanged: (cat) => setState(() => _currentCategory = cat),
              ),
              Transform.translate(
                offset: const Offset(0, -14),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: _buildYellowSearchBox(),
                ),
              ),
              if (_currentCategory == MarketplaceCategory.alojamientos) _buildAlojamientosLanding(),
              if (_currentCategory == MarketplaceCategory.vuelos) _buildVuelosLanding(),
              if (_currentCategory == MarketplaceCategory.autos) _buildAutosLanding(),
              if (_currentCategory == MarketplaceCategory.atracciones) _buildAtraccionesLanding(),
              const SizedBox(height: 36),
            ],
          ),
        ),
      ),
    );
  }

  // ===========================================================================
  // BUSCADOR AMARILLO OFICIAL BOOKING (4 VERTICALES)
  // ===========================================================================
  Widget _buildYellowSearchBox() {
    return Container(
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: BookingColors.accentYellow,
        borderRadius: BorderRadius.circular(10),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          if (_currentCategory == MarketplaceCategory.alojamientos) ..._buildAlojSearchFields(),
          if (_currentCategory == MarketplaceCategory.vuelos) ..._buildVueloSearchFields(),
          if (_currentCategory == MarketplaceCategory.autos) ..._buildAutoSearchFields(),
          if (_currentCategory == MarketplaceCategory.atracciones) ..._buildAtrSearchFields(),
        ],
      ),
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
                  items: airports
                      .map((a) => DropdownMenuItem(value: a.codigo, child: Text('De: ${a.nombre}', overflow: TextOverflow.ellipsis)))
                      .toList(),
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
                  items: airports
                      .map((a) => DropdownMenuItem(value: a.codigo, child: Text('A: ${a.nombre}', overflow: TextOverflow.ellipsis)))
                      .toList(),
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
      _whiteFieldBox(
        child: Row(
          children: [
            const Icon(Icons.attractions_outlined, color: BookingColors.textMuted, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _atrQueryCtrl,
                maxLength: 60,
                decoration: const InputDecoration(
                  hintText: '¿Adónde vas? Tours, museos, aventura...',
                  counterText: '',
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
            children: DestinosCatalog.sugerenciasAtracciones.map((dest) {
              return Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ActionChip(
                  label: Text(dest, style: const TextStyle(fontSize: 11)),
                  onPressed: () => setState(() => _atrQueryCtrl.text = dest),
                ),
              );
            }).toList(),
          ),
        ),
      ),
      const SizedBox(height: 4),
      _whiteTapBox(
        icon: Icons.calendar_today_outlined,
        text: 'Fecha de experiencia: ${DateFormat('EEE, dd MMM yyyy').format(_atrDate)}',
        onTap: () async {
          final picked = await showDatePicker(
            context: context,
            initialDate: _atrDate,
            firstDate: DateTime.now(),
            lastDate: DateTime.now().add(const Duration(days: 365)),
          );
          if (picked != null) setState(() => _atrDate = picked);
        },
      ),
      const SizedBox(height: 4),
      _searchButton('Buscar atracciones', () => _launchAtraccionesSearch()),
    ];
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
      {'name': 'Quito', 'sub': 'Centro Histórico & La Carolina', 'img': 'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?auto=format&fit=crop&w=600&q=80'},
      {'name': 'Guayaquil', 'sub': 'Malecón 2000 & Las Peñas', 'img': 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=600&q=80'},
      {'name': 'Cuenca', 'sub': 'Río Tomebamba & Cajas', 'img': 'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?auto=format&fit=crop&w=600&q=80'},
      {'name': 'Baños de Agua Santa', 'sub': 'Aventura & Termas', 'img': 'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?auto=format&fit=crop&w=600&q=80'},
      {'name': 'Islas Galápagos', 'sub': 'Santa Cruz & San Cristóbal', 'img': 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=600&q=80'},
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
          else
            ..._alojamientos.take(6).map((prop) => _buildAlojamientoHomeCard(prop)),
        ],
      ),
    );
  }

  Widget _buildAlojamientoHomeCard(Alojamiento prop) {
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
                          'US\$ ${prop.precioPorNoche.toStringAsFixed(0)} / noche',
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
    const popularRoutes = [
      {'orig': 'UIO', 'dest': 'GYE', 'title': 'Quito ➔ Guayaquil', 'sub': 'Vuelos frecuentes · ~50 min'},
      {'orig': 'UIO', 'dest': 'GPS', 'title': 'Quito ➔ Galápagos (Baltra)', 'sub': 'Tarifas ida y vuelta disponibles'},
      {'orig': 'GYE', 'dest': 'CUE', 'title': 'Guayaquil ➔ Cuenca', 'sub': 'Conexión rápida Austro'},
      {'orig': 'UIO', 'dest': 'BOG', 'title': 'Quito ➔ Bogotá', 'sub': 'Vuelos internacionales directos'},
      {'orig': 'GYE', 'dest': 'MIA', 'title': 'Guayaquil ➔ Miami', 'sub': 'Aerolíneas internacionales socias'},
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Card(
            color: const Color(0xFFEFF6FF),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            child: ListTile(
              leading: const CircleAvatar(
                backgroundColor: BookingColors.primaryBlue,
                child: Icon(Icons.radar, color: Colors.white),
              ),
              title: const Text('Estado de tu vuelo en tiempo real', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              subtitle: const Text('Consulta puerta de embarque, terminal y estado por número de vuelo', style: TextStyle(fontSize: 12)),
              trailing: const Icon(Icons.chevron_right, color: BookingColors.actionBlue),
              onTap: () {
                Navigator.push(context, MaterialPageRoute(builder: (_) => const EstadoVueloScreen()));
              },
            ),
          ),
          const SizedBox(height: 16),

          const Text('Rutas más populares', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
          const Text('Explora tarifas conectadas en vivo con 5 aerolíneas socias', style: TextStyle(fontSize: 12, color: BookingColors.textMuted)),
          const SizedBox(height: 10),
          SizedBox(
            height: 112,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: popularRoutes.length,
              itemBuilder: (_, i) {
                final r = popularRoutes[i];
                return InkWell(
                  onTap: () => _launchVuelosSearch(orig: r['orig'], dest: r['dest']),
                  child: Container(
                    width: 215,
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
                        Row(
                          children: [
                            const Icon(Icons.flight_takeoff, color: BookingColors.actionBlue, size: 18),
                            const SizedBox(width: 6),
                            Text('${r['orig']} → ${r['dest']}', style: const TextStyle(fontWeight: FontWeight.bold, color: BookingColors.primaryBlue)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(r['title']!, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        const SizedBox(height: 2),
                        Text(r['sub']!, style: const TextStyle(fontSize: 11, color: BookingColors.textMuted), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 18),

          const Text('Ofertas destacadas de vuelo', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
          const SizedBox(height: 8),
          if (_loadingCatalog)
            const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator()))
          else
            ..._vuelos.take(5).map((v) => Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: BookingColors.primaryBlue,
                      child: Text(v.airlineCode, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                    ),
                    title: Text('${v.origen} ➔ ${v.destino} · ${v.aerolinea}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    subtitle: Text('${v.horaSalida} - ${v.horaLlegada} · ${v.numeroVuelo} (${v.escalas == 0 ? "Directo" : "${v.escalas} escala(s)"})'),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('US\$ ${v.totalPrice.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: BookingColors.actionBlue)),
                        const Text('Ver >', style: TextStyle(fontSize: 11, color: BookingColors.textMuted)),
                      ],
                    ),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => VueloDetailScreen(oferta: v, pasajeros: _vueloPassengers),
                        ),
                      );
                    },
                  ),
                )),
        ],
      ),
    );
  }

  // ===========================================================================
  // LANDING: AUTOS
  // ===========================================================================
  Widget _buildAutosLanding() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _benefitCard(Icons.verified_user_outlined, 'Cobertura Total Opcional', 'Protección sin franquicia por solo +\$18/día'),
                _benefitCard(Icons.cleaning_services_outlined, 'Cooldown 2h verificado', 'Desinfección e inspección garantizada entre rentas'),
                _benefitCard(Icons.cancel_outlined, 'Cancelación flexible', 'Cambia o cancela hasta 24h antes de la recogida'),
              ],
            ),
          ),
          const SizedBox(height: 18),

          const Text('Puntos de recogida más populares', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: ['Quito', 'Aeropuerto Mariscal Sucre', 'Guayaquil', 'Cuenca', 'Manta'].map((loc) {
              return ActionChip(
                avatar: const Icon(Icons.location_on, size: 15, color: BookingColors.actionBlue),
                label: Text(loc),
                onPressed: () => _launchAutosSearch(forcedLocation: loc),
              );
            }).toList(),
          ),
          const SizedBox(height: 18),

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Vehículos disponibles en flota', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
              TextButton(onPressed: () => _launchAutosSearch(), child: const Text('Explorar todos >')),
            ],
          ),
          if (_loadingCatalog)
            const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator()))
          else
            ..._autos.take(5).map((auto) => Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    leading: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: Image.network(
                        auto.imagenUrl ?? '',
                        width: 64,
                        height: 48,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Icon(Icons.directions_car, size: 34),
                      ),
                    ),
                    title: Text('${auto.carDisplayName} · ${auto.proveedor}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    subtitle: Text(
                      '${auto.capacidadPasajeros} plazas · ${auto.transmision} · ${auto.maletasGrandes} maleta(s)',
                      style: const TextStyle(fontSize: 12),
                    ),
                    trailing: Text(
                      'US\$ ${auto.precioPorDia.toStringAsFixed(0)}/d',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: BookingColors.actionBlue),
                    ),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AutoDetailScreen(
                            auto: auto,
                            initialPickupDate: _autoPickupDate,
                            initialDropoffDate: _autoDropoffDate,
                            pickupTime: _autoPickupTime,
                            dropoffTime: _autoDropoffTime,
                            pickupLocation: _autoLocCtrl.text.trim(),
                            initialDriverAge: _driverAge30to65 ? 30 : _autoDriverAge,
                          ),
                        ),
                      );
                    },
                  ),
                )),
        ],
      ),
    );
  }

  // ===========================================================================
  // LANDING: ATRACCIONES
  // ===========================================================================
  Widget _buildAtraccionesLanding() {
    final auth = Provider.of<AuthProvider>(context);
    const regiones = ['Sierra', 'Costa', 'Galápagos', 'Amazonía'];

    final filteredByRegion = _atracciones.where((a) {
      final text = '${a.ciudad} ${a.nombre} ${a.descripcion}'.toLowerCase();
      if (_atrRegionTab == 'Galápagos') return text.contains('galápag') || text.contains('galapag') || text.contains('santa cruz');
      if (_atrRegionTab == 'Costa') return text.contains('guayaquil') || text.contains('manta') || text.contains('montañ') || text.contains('lópez');
      if (_atrRegionTab == 'Amazonía') return text.contains('tena') || text.contains('baños') || text.contains('cuyabeno') || text.contains('amazon');
      return text.contains('quito') || text.contains('cuenca') || text.contains('cotopaxi') || text.contains('otavalo') || text.contains('mindo') || text.contains('mitad');
    }).toList();

    final showcase = filteredByRegion.isNotEmpty ? filteredByRegion : _atracciones;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!auth.isAuthenticated)
            Card(
              color: Colors.white,
              margin: const EdgeInsets.only(bottom: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: Colors.grey.shade200)),
              child: ListTile(
                leading: const Icon(Icons.card_giftcard, color: BookingColors.actionBlue, size: 30),
                title: const Text('Inicia sesión para gestionar tus reservas Genius', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                subtitle: const Text('Obtén tus códigos QR de ingreso instantáneo y facturación SRI', style: TextStyle(fontSize: 11)),
                trailing: ElevatedButton(
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LoginScreen())),
                  style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                  child: const Text('Entrar', style: TextStyle(color: Colors.white, fontSize: 12)),
                ),
              ),
            ),

          const Text('Explora destinos de actividades', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: ['Quito', 'Galápagos', 'Baños', 'Cuenca', 'Mindo', 'Guayaquil'].map((q) {
              return ActionChip(
                avatar: const Icon(Icons.tour, size: 15, color: BookingColors.actionBlue),
                label: Text(q),
                onPressed: () => _launchAtraccionesSearch(forcedQuery: q),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),

          const Text('Descubre por regiones de Ecuador', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: regiones.map((reg) {
              final sel = _atrRegionTab == reg;
              return ChoiceChip(
                label: Text(reg, style: TextStyle(color: sel ? Colors.white : BookingColors.textDark, fontSize: 12)),
                selected: sel,
                selectedColor: BookingColors.actionBlue,
                onSelected: (_) => setState(() => _atrRegionTab = reg),
              );
            }).toList(),
          ),
          const SizedBox(height: 10),

          if (_loadingCatalog)
            const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator()))
          else
            ...showcase.take(6).map((a) => Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  clipBehavior: Clip.antiAlias,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  child: InkWell(
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AtraccionDetailScreen(atraccion: a, initialDate: _atrDate),
                        ),
                      );
                    },
                    child: Row(
                      children: [
                        SizedBox(
                          width: 112,
                          height: 112,
                          child: Image.network(
                            a.imagenUrl ?? '',
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => Container(
                              color: Colors.grey.shade200,
                              child: const Icon(Icons.attractions),
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
                                    Text(a.ciudad, style: const TextStyle(fontSize: 11, color: BookingColors.textMuted)),
                                    BookingRatingBadge(rating: a.rating),
                                  ],
                                ),
                                const SizedBox(height: 2),
                                Text(a.nombre, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14), maxLines: 2, overflow: TextOverflow.ellipsis),
                                const SizedBox(height: 4),
                                Text(
                                  a.freeCancellation ? 'Cancelación gratuita · ${a.duracion}' : a.duracion,
                                  style: const TextStyle(fontSize: 11, color: BookingColors.successGreen, fontWeight: FontWeight.w600),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Desde US\$ ${a.precioAdulto.toStringAsFixed(2)}',
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: BookingColors.actionBlue),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                )),
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
