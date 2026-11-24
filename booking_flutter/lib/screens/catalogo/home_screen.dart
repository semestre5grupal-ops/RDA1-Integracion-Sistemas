import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../theme/booking_colors.dart';
import '../../widgets/booking_nav_header.dart';
import '../../widgets/yellow_search_box.dart';
import '../../widgets/booking_rating_badge.dart';
import '../../services/booking_services.dart';
import '../../models/alojamiento.dart';
import '../../models/vuelo.dart';
import '../../models/auto.dart';
import '../../models/atraccion.dart';
import '../detalle/alojamiento_detail_screen.dart';
import '../detalle/vuelo_detail_screen.dart';
import '../detalle/auto_detail_screen.dart';
import '../detalle/atraccion_detail_screen.dart';
import '../vuelos/estado_vuelo_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  MarketplaceCategory _activeCategory = MarketplaceCategory.alojamientos;

  // Alojamientos State
  final TextEditingController _hotelDestinoCtrl = TextEditingController();
  DateTime _hotelCheckIn = DateTime.now().add(const Duration(days: 2));
  DateTime _hotelCheckOut = DateTime.now().add(const Duration(days: 5));
  String _selectedHotelFilter = 'Todos';
  List<Alojamiento> _alojamientos = [];
  bool _loadingAlojamientos = true;

  // Vuelos State
  final TextEditingController _vueloOrigenCtrl = TextEditingController(text: 'UIO');
  final TextEditingController _vueloDestinoCtrl = TextEditingController(text: 'GYE');
  DateTime _vueloFecha = DateTime.now().add(const Duration(days: 3));
  String _selectedVueloFilter = 'Todos';
  List<Vuelo> _vuelos = [];
  bool _loadingVuelos = true;

  // Autos State
  final TextEditingController _autoLugarCtrl = TextEditingController(text: 'Aeropuerto Quito (UIO)');
  DateTime _autoFechaRecogida = DateTime.now().add(const Duration(days: 1));
  DateTime _autoFechaDevolucion = DateTime.now().add(const Duration(days: 4));
  String _selectedAutoFilter = 'Todos';
  List<Auto> _autos = [];
  bool _loadingAutos = true;

  // Atracciones State
  final TextEditingController _atraccionDestinoCtrl = TextEditingController();
  DateTime _atraccionFecha = DateTime.now().add(const Duration(days: 2));
  String _selectedAtraccionFilter = 'Todos';
  List<Atraccion> _atracciones = [];
  bool _loadingAtracciones = true;

  // Wishlist set
  final Set<String> _wishlist = {};

  @override
  void initState() {
    super.initState();
    _cargarTodosLosServicios();
  }

  @override
  void dispose() {
    _hotelDestinoCtrl.dispose();
    _vueloOrigenCtrl.dispose();
    _vueloDestinoCtrl.dispose();
    _autoLugarCtrl.dispose();
    _atraccionDestinoCtrl.dispose();
    super.dispose();
  }

  Future<void> _cargarTodosLosServicios() async {
    _cargarAlojamientos();
    _cargarVuelos();
    _cargarAutos();
    _cargarAtracciones();
  }

  Future<void> _cargarAlojamientos() async {
    setState(() => _loadingAlojamientos = true);
    final list = await BookingServices.getAlojamientos();
    if (mounted) {
      setState(() {
        _alojamientos = list;
        _loadingAlojamientos = false;
      });
    }
  }

  Future<void> _cargarVuelos() async {
    setState(() => _loadingVuelos = true);
    final list = await BookingServices.getVuelos();
    if (mounted) {
      setState(() {
        _vuelos = list;
        _loadingVuelos = false;
      });
    }
  }

  Future<void> _cargarAutos() async {
    setState(() => _loadingAutos = true);
    final list = await BookingServices.getAutos();
    if (mounted) {
      setState(() {
        _autos = list;
        _loadingAutos = false;
      });
    }
  }

  Future<void> _cargarAtracciones() async {
    setState(() => _loadingAtracciones = true);
    final list = await BookingServices.getAtracciones();
    if (mounted) {
      setState(() {
        _atracciones = list;
        _loadingAtracciones = false;
      });
    }
  }

  // --- Date Picker Helper ---
  Future<DateTime?> _pickDate(DateTime initial, {DateTime? first}) async {
    return await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: first ?? DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: BookingColors.primaryBlue,
              onPrimary: Colors.white,
              onSurface: BookingColors.textDark,
            ),
          ),
          child: child!,
        );
      },
    );
  }

  // --- FILTRADO DE ALOJAMIENTOS ---
  List<Alojamiento> get _filteredAlojamientos {
    var list = _alojamientos;
    final query = _hotelDestinoCtrl.text.trim().toLowerCase();
    if (query.isNotEmpty) {
      list = list.where((h) =>
        h.ciudad.toLowerCase().contains(query) ||
        h.nombre.toLowerCase().contains(query)
      ).toList();
    }
    if (_selectedHotelFilter != 'Todos') {
      list = list.where((h) =>
        h.ciudad.toLowerCase().contains(_selectedHotelFilter.toLowerCase())
      ).toList();
    }
    return list;
  }

  // --- FILTRADO DE VUELOS ---
  List<Vuelo> get _filteredVuelos {
    var list = _vuelos;
    final orig = _vueloOrigenCtrl.text.trim().toUpperCase();
    final dest = _vueloDestinoCtrl.text.trim().toUpperCase();
    if (orig.isNotEmpty) {
      list = list.where((v) => v.origen.toUpperCase().contains(orig)).toList();
    }
    if (dest.isNotEmpty) {
      list = list.where((v) => v.destino.toUpperCase().contains(dest)).toList();
    }
    if (_selectedVueloFilter != 'Todos') {
      list = list.where((v) =>
        v.aerolinea.toLowerCase().contains(_selectedVueloFilter.toLowerCase()) ||
        v.destino.toUpperCase().contains(_selectedVueloFilter.toUpperCase())
      ).toList();
    }
    return list;
  }

  // --- FILTRADO DE AUTOS ---
  List<Auto> get _filteredAutos {
    var list = _autos;
    final lugar = _autoLugarCtrl.text.trim().toLowerCase();
    if (lugar.isNotEmpty && !lugar.contains('aeropuerto')) {
      list = list.where((a) =>
        a.proveedor.toLowerCase().contains(lugar) ||
        a.marca.toLowerCase().contains(lugar) ||
        a.modelo.toLowerCase().contains(lugar)
      ).toList();
    }
    if (_selectedAutoFilter != 'Todos') {
      list = list.where((a) =>
        a.categoria.toLowerCase().contains(_selectedAutoFilter.toLowerCase())
      ).toList();
    }
    return list;
  }

  // --- FILTRADO DE ATRACCIONES ---
  List<Atraccion> get _filteredAtracciones {
    var list = _atracciones;
    final query = _atraccionDestinoCtrl.text.trim().toLowerCase();
    if (query.isNotEmpty) {
      list = list.where((a) =>
        a.ciudad.toLowerCase().contains(query) ||
        a.nombre.toLowerCase().contains(query) ||
        a.proveedor.toLowerCase().contains(query)
      ).toList();
    }
    if (_selectedAtraccionFilter != 'Todos') {
      list = list.where((a) =>
        a.ciudad.toLowerCase().contains(_selectedAtraccionFilter.toLowerCase())
      ).toList();
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      body: RefreshIndicator(
        onRefresh: _cargarTodosLosServicios,
        color: BookingColors.primaryBlue,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 1. Authentic Booking Hero Header
              BookingNavHeader(
                currentCategory: _activeCategory,
                onCategoryChanged: (cat) {
                  setState(() => _activeCategory = cat);
                },
              ),

              // 2. Booking Yellow Search Box
              Transform.translate(
                offset: const Offset(0, -22),
                child: _buildSearchBoxForCategory(),
              ),

              // 3. Category Body Content
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: _buildCategoryContent(),
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }

  // ==========================================
  // BUSCADOR AMARILLO DINÁMICO POR CATEGORÍA
  // ==========================================
  Widget _buildSearchBoxForCategory() {
    switch (_activeCategory) {
      case MarketplaceCategory.alojamientos:
        return YellowSearchBox(
          buttonText: 'Buscar alojamientos',
          onSearch: () => setState(() {}),
          children: [
            // Destino
            TextField(
              controller: _hotelDestinoCtrl,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.bed_outlined, color: BookingColors.primaryBlue),
                hintText: '¿A dónde vas? (ej. Quito, Cuenca, Galápagos)',
                border: InputBorder.none,
                contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              ),
              onChanged: (_) => setState(() {}),
            ),
            const Divider(height: 1, thickness: 1, color: BookingColors.borderLight),
            // Fechas
            Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: () async {
                      final picked = await _pickDate(_hotelCheckIn);
                      if (picked != null) {
                        setState(() {
                          _hotelCheckIn = picked;
                          if (_hotelCheckOut.isBefore(_hotelCheckIn)) {
                            _hotelCheckOut = _hotelCheckIn.add(const Duration(days: 2));
                          }
                        });
                      }
                    },
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                      child: Row(
                        children: [
                          const Icon(Icons.calendar_today_outlined, color: BookingColors.primaryBlue, size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Entrada: ${DateFormat('dd MMM').format(_hotelCheckIn)}',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Container(height: 24, width: 1, color: BookingColors.borderLight),
                Expanded(
                  child: InkWell(
                    onTap: () async {
                      final picked = await _pickDate(_hotelCheckOut, first: _hotelCheckIn.add(const Duration(days: 1)));
                      if (picked != null) {
                        setState(() => _hotelCheckOut = picked);
                      }
                    },
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                      child: Row(
                        children: [
                          const Icon(Icons.event_outlined, color: BookingColors.primaryBlue, size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Salida: ${DateFormat('dd MMM').format(_hotelCheckOut)}',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const Divider(height: 1, thickness: 1, color: BookingColors.borderLight),
            // Huéspedes
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              child: Row(
                children: [
                  Icon(Icons.person_outline, color: BookingColors.primaryBlue, size: 20),
                  SizedBox(width: 8),
                  Text(
                    '2 adultos · 0 niños · 1 habitación',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),
          ],
        );

      case MarketplaceCategory.vuelos:
        return YellowSearchBox(
          buttonText: 'Buscar vuelos',
          onSearch: () => setState(() {}),
          children: [
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _vueloOrigenCtrl,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.flight_takeoff, color: BookingColors.primaryBlue),
                      hintText: 'Origen: UIO',
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const Icon(Icons.arrow_forward, color: BookingColors.textMuted, size: 18),
                Expanded(
                  child: TextField(
                    controller: _vueloDestinoCtrl,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.flight_land, color: BookingColors.primaryBlue),
                      hintText: 'Destino: GYE',
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
              ],
            ),
            const Divider(height: 1, thickness: 1, color: BookingColors.borderLight),
            InkWell(
              onTap: () async {
                final picked = await _pickDate(_vueloFecha);
                if (picked != null) setState(() => _vueloFecha = picked);
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                child: Row(
                  children: [
                    const Icon(Icons.calendar_month_outlined, color: BookingColors.primaryBlue, size: 20),
                    const SizedBox(width: 8),
                    Text(
                      'Fecha de salida: ${DateFormat('EEE, dd MMM yyyy').format(_vueloFecha)} · 1 Pasajero',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );

      case MarketplaceCategory.autos:
        return YellowSearchBox(
          buttonText: 'Buscar autos de alquiler',
          onSearch: () => setState(() {}),
          children: [
            TextField(
              controller: _autoLugarCtrl,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.directions_car_outlined, color: BookingColors.primaryBlue),
                hintText: 'Lugar de recogida (ej. Aeropuerto UIO)',
                border: InputBorder.none,
                contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              ),
              onChanged: (_) => setState(() {}),
            ),
            const Divider(height: 1, thickness: 1, color: BookingColors.borderLight),
            Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: () async {
                      final picked = await _pickDate(_autoFechaRecogida);
                      if (picked != null) {
                        setState(() {
                          _autoFechaRecogida = picked;
                          if (_autoFechaDevolucion.isBefore(_autoFechaRecogida)) {
                            _autoFechaDevolucion = _autoFechaRecogida.add(const Duration(days: 2));
                          }
                        });
                      }
                    },
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                      child: Row(
                        children: [
                          const Icon(Icons.calendar_today_outlined, color: BookingColors.primaryBlue, size: 20),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              'Recogida: ${DateFormat('dd/MM').format(_autoFechaRecogida)}',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Container(height: 24, width: 1, color: BookingColors.borderLight),
                Expanded(
                  child: InkWell(
                    onTap: () async {
                      final picked = await _pickDate(_autoFechaDevolucion, first: _autoFechaRecogida.add(const Duration(days: 1)));
                      if (picked != null) setState(() => _autoFechaDevolucion = picked);
                    },
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                      child: Row(
                        children: [
                          const Icon(Icons.event_outlined, color: BookingColors.primaryBlue, size: 20),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              'Devolución: ${DateFormat('dd/MM').format(_autoFechaDevolucion)}',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        );

      case MarketplaceCategory.atracciones:
        return YellowSearchBox(
          buttonText: 'Buscar actividades',
          onSearch: () => setState(() {}),
          children: [
            TextField(
              controller: _atraccionDestinoCtrl,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.attractions_outlined, color: BookingColors.primaryBlue),
                hintText: '¿Qué quieres hacer? (ej. Galápagos, Teleférico, Baños)',
                border: InputBorder.none,
                contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              ),
              onChanged: (_) => setState(() {}),
            ),
            const Divider(height: 1, thickness: 1, color: BookingColors.borderLight),
            InkWell(
              onTap: () async {
                final picked = await _pickDate(_atraccionFecha);
                if (picked != null) setState(() => _atraccionFecha = picked);
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                child: Row(
                  children: [
                    const Icon(Icons.calendar_month_outlined, color: BookingColors.primaryBlue, size: 20),
                    const SizedBox(width: 8),
                    Text(
                      'Fecha de la actividad: ${DateFormat('EEEE, dd MMM yyyy').format(_atraccionFecha)}',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
    }
  }

  // ==========================================
  // CONTENIDO DINÁMICO POR CATEGORÍA
  // ==========================================
  Widget _buildCategoryContent() {
    switch (_activeCategory) {
      case MarketplaceCategory.alojamientos:
        return _buildAlojamientosSection();
      case MarketplaceCategory.vuelos:
        return _buildVuelosSection();
      case MarketplaceCategory.autos:
        return _buildAutosSection();
      case MarketplaceCategory.atracciones:
        return _buildAtraccionesSection();
    }
  }

  // ------------------------------------------
  // 1. SECCIÓN ALOJAMIENTOS (DEFAULT)
  // ------------------------------------------
  Widget _buildAlojamientosSection() {
    final destinos = ['Todos', 'Quito', 'Guayaquil', 'Cuenca', 'Galápagos', 'Baños', 'Mindo'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Alojamientos destacados en Ecuador',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: BookingColors.textDark,
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Hoteles, cabañas y departamentos verificados con cancelación flexible',
          style: TextStyle(fontSize: 13, color: BookingColors.textMuted),
        ),
        const SizedBox(height: 12),

        // Filtro de chips
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: destinos.map((dest) {
              final isSel = _selectedHotelFilter == dest;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(dest),
                  selected: isSel,
                  selectedColor: BookingColors.primaryBlue,
                  labelStyle: TextStyle(
                    color: isSel ? Colors.white : BookingColors.textDark,
                    fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                    fontSize: 13,
                  ),
                  backgroundColor: Colors.white,
                  side: BorderSide(
                    color: isSel ? BookingColors.primaryBlue : BookingColors.borderLight,
                  ),
                  onSelected: (val) {
                    if (val) setState(() => _selectedHotelFilter = dest);
                  },
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 16),

        if (_loadingAlojamientos)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(40),
              child: CircularProgressIndicator(color: BookingColors.primaryBlue),
            ),
          )
        else if (_filteredAlojamientos.isEmpty)
          _buildEmptyState('No se encontraron alojamientos en este destino.', Icons.hotel_outlined)
        else
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _filteredAlojamientos.length,
            itemBuilder: (context, i) {
              final h = _filteredAlojamientos[i];
              return _buildAlojamientoCard(h);
            },
          ),
      ],
    );
  }

  Widget _buildAlojamientoCard(Alojamiento h) {
    final isSaved = _wishlist.contains(h.id);
    final diffDays = _hotelCheckOut.difference(_hotelCheckIn).inDays;
    final nights = diffDays > 0 ? diffDays : 2;
    final totalStay = (h.precioPorNoche * nights).round();
    final originalPrice = (totalStay * 1.18).round();

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 2,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: BookingColors.borderLight, width: 0.8),
      ),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => AlojamientoDetailScreen(alojamiento: h)),
          );
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Foto con relación de aspecto y botón de wishlist
            Stack(
              children: [
                AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Image.network(
                    h.imagenUrl ?? 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      color: Colors.blueGrey.shade100,
                      child: const Center(
                        child: Icon(Icons.hotel, size: 48, color: BookingColors.textMuted),
                      ),
                    ),
                  ),
                ),
                // Botón Wishlist
                Positioned(
                  top: 10,
                  right: 10,
                  child: InkWell(
                    onTap: () {
                      setState(() {
                        if (isSaved) {
                          _wishlist.remove(h.id);
                        } else {
                          _wishlist.add(h.id);
                        }
                      });
                    },
                    child: Container(
                      padding: const EdgeInsets.all(7),
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(color: Colors.black26, blurRadius: 6, offset: Offset(0, 2)),
                        ],
                      ),
                      child: Icon(
                        isSaved ? Icons.favorite : Icons.favorite_border,
                        color: isSaved ? Colors.red : BookingColors.textDark,
                        size: 20,
                      ),
                    ),
                  ),
                ),
                // Badge Genius / Oferta
                Positioned(
                  top: 10,
                  left: 10,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: BookingColors.primaryBlue,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text(
                      'Genius',
                      style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ],
            ),

            // Contenido y detalles
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              h.nombre,
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.bold,
                                color: BookingColors.textDark,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                const Icon(Icons.location_on_outlined, color: BookingColors.primaryBlue, size: 16),
                                const SizedBox(width: 4),
                                Text(
                                  '${h.ciudad}, Ecuador',
                                  style: const TextStyle(fontSize: 13, color: BookingColors.textMuted),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      BookingRatingBadge(rating: h.rating, reviewsCount: 124),
                    ],
                  ),
                  const SizedBox(height: 10),

                  // Tags de ventajas
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      _buildPillBadge('Cancelación GRATIS', BookingColors.successGreen),
                      _buildPillBadge('Sin pago por adelantado', BookingColors.primaryBlue),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const Divider(height: 1, thickness: 0.6, color: BookingColors.borderLight),
                  const SizedBox(height: 10),

                  // Precios y acción
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '$nights noches, 2 adultos',
                            style: const TextStyle(fontSize: 12, color: BookingColors.textMuted),
                          ),
                          Row(
                            children: [
                              Text(
                                'US\$ $originalPrice',
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: BookingColors.errorRed,
                                  decoration: TextDecoration.lineThrough,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                'US\$ $totalStay',
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                  color: BookingColors.textDark,
                                ),
                              ),
                            ],
                          ),
                          const Text(
                            '+ US\$ 0 en impuestos y cargos',
                            style: TextStyle(fontSize: 11, color: BookingColors.textMuted),
                          ),
                        ],
                      ),
                      ElevatedButton(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => AlojamientoDetailScreen(alojamiento: h)),
                          );
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: BookingColors.actionBlue,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                        ),
                        child: const Text('Ver disponibilidad', style: TextStyle(fontSize: 13, color: Colors.white)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ------------------------------------------
  // 2. SECCIÓN VUELOS
  // ------------------------------------------
  Widget _buildVuelosSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Banner de rastreador en vivo
        Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFFEAF2FD),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: BookingColors.actionBlue.withOpacity(0.3)),
          ),
          child: Row(
            children: [
              const Icon(Icons.flight_takeoff, color: BookingColors.primaryBlue, size: 28),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Rastreador de Vuelos en Tiempo Real',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: BookingColors.primaryBlue),
                    ),
                    Text(
                      'Monitorea el estado, demoras y puertas de embarque de aerolíneas aliadas.',
                      style: TextStyle(fontSize: 12, color: BookingColors.textDark),
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const EstadoVueloScreen()),
                  );
                },
                child: const Text('Consultar', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ),

        const Text(
          'Vuelos disponibles en Ecuador',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: BookingColors.textDark),
        ),
        const SizedBox(height: 4),
        const Text(
          'Rutas directas entre Quito, Guayaquil, Galápagos y Cuenca',
          style: TextStyle(fontSize: 13, color: BookingColors.textMuted),
        ),
        const SizedBox(height: 16),

        if (_loadingVuelos)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(40),
              child: CircularProgressIndicator(color: BookingColors.primaryBlue),
            ),
          )
        else if (_filteredVuelos.isEmpty)
          _buildEmptyState('No hay vuelos disponibles para el trayecto seleccionado.', Icons.flight_outlined)
        else
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _filteredVuelos.length,
            itemBuilder: (context, i) {
              final v = _filteredVuelos[i];
              return _buildVueloCard(v);
            },
          ),
      ],
    );
  }

  Widget _buildVueloCard(Vuelo v) {
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: BookingColors.borderLight, width: 0.8),
      ),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => VueloDetailScreen(vuelo: v)),
          );
        },
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              // Cabecera aerolínea y estado
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const CircleAvatar(
                        radius: 14,
                        backgroundColor: BookingColors.primaryBlue,
                        child: Icon(Icons.flight, color: Colors.white, size: 16),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '${v.aerolinea} · ${v.numeroVuelo}',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: BookingColors.successGreen.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      v.estado,
                      style: const TextStyle(
                        color: BookingColors.successGreen,
                        fontWeight: FontWeight.bold,
                        fontSize: 11,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Trayecto y horarios
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        v.horaSalida,
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                      Text(
                        v.origen,
                        style: const TextStyle(fontSize: 13, color: BookingColors.textMuted, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                  Expanded(
                    child: Column(
                      children: [
                        const Text('Directo', style: TextStyle(fontSize: 11, color: BookingColors.textMuted)),
                        const SizedBox(height: 2),
                        Stack(
                          alignment: Alignment.center,
                          children: [
                            const Divider(color: BookingColors.borderLight, thickness: 1.5),
                            Container(
                              padding: const EdgeInsets.all(4),
                              decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                              child: const Icon(Icons.flight_takeoff, color: BookingColors.actionBlue, size: 16),
                            ),
                          ],
                        ),
                        Text(
                          v.puertaEmbarque != null ? 'Puerta ${v.puertaEmbarque}' : 'Puerta A1',
                          style: const TextStyle(fontSize: 11, color: BookingColors.textMuted),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        v.horaLlegada,
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                      Text(
                        v.destino,
                        style: const TextStyle(fontSize: 13, color: BookingColors.textMuted, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 14),
              const Divider(height: 1, thickness: 0.6, color: BookingColors.borderLight),
              const SizedBox(height: 10),

              // Precios y acción
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.work_outline, size: 14, color: BookingColors.textMuted),
                      const SizedBox(width: 4),
                      const Text('Equipaje de mano incluido', style: TextStyle(fontSize: 11, color: BookingColors.textMuted)),
                    ],
                  ),
                  Row(
                    children: [
                      Text(
                        'US\$ ${v.precio.toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                      ),
                      const SizedBox(width: 10),
                      ElevatedButton(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => VueloDetailScreen(vuelo: v)),
                          );
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: BookingColors.actionBlue,
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                        ),
                        child: const Text('Ver vuelo', style: TextStyle(fontSize: 12, color: Colors.white)),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ------------------------------------------
  // 3. SECCIÓN AUTOS
  // ------------------------------------------
  Widget _buildAutosSection() {
    final categorias = ['Todos', 'Económico', 'Sedán', 'Compacto', 'SUV'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Alquiler de autos en Ecuador',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: BookingColors.textDark),
        ),
        const SizedBox(height: 4),
        const Text(
          'Vehículos inspeccionados con kilometraje ilimitado y política de cooldown garantizada',
          style: TextStyle(fontSize: 13, color: BookingColors.textMuted),
        ),
        const SizedBox(height: 12),

        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: categorias.map((cat) {
              final isSel = _selectedAutoFilter == cat;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(cat),
                  selected: isSel,
                  selectedColor: BookingColors.primaryBlue,
                  labelStyle: TextStyle(
                    color: isSel ? Colors.white : BookingColors.textDark,
                    fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                    fontSize: 13,
                  ),
                  backgroundColor: Colors.white,
                  side: BorderSide(
                    color: isSel ? BookingColors.primaryBlue : BookingColors.borderLight,
                  ),
                  onSelected: (val) {
                    if (val) setState(() => _selectedAutoFilter = cat);
                  },
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 16),

        if (_loadingAutos)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(40),
              child: CircularProgressIndicator(color: BookingColors.primaryBlue),
            ),
          )
        else if (_filteredAutos.isEmpty)
          _buildEmptyState('No hay vehículos disponibles con los criterios seleccionados.', Icons.directions_car_outlined)
        else
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _filteredAutos.length,
            itemBuilder: (context, i) {
              final a = _filteredAutos[i];
              return _buildAutoCard(a);
            },
          ),
      ],
    );
  }

  Widget _buildAutoCard(Auto a) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: BookingColors.borderLight, width: 0.8),
      ),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => AutoDetailScreen(auto: a)),
          );
        },
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Imagen del auto
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      width: 110,
                      height: 80,
                      color: Colors.grey.shade100,
                      child: Image.network(
                        a.imagenUrl ?? 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=500',
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Icon(Icons.directions_car, size: 40, color: BookingColors.textMuted),
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  // Datos del auto
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${a.marca} ${a.modelo}',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: BookingColors.textDark),
                        ),
                        Text(
                          '${a.categoria} · Proveedor: ${a.proveedor}',
                          style: const TextStyle(fontSize: 12, color: BookingColors.textMuted),
                        ),
                        const SizedBox(height: 6),
                        // Badge Cooldown
                        if (a.enCooldown)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.amber.shade100,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.schedule, size: 12, color: Colors.orange),
                                SizedBox(width: 4),
                                Text(
                                  'En descanso/limpieza (2h)',
                                  style: TextStyle(color: Colors.orange, fontSize: 11, fontWeight: FontWeight.bold),
                                ),
                              ],
                            ),
                          )
                        else
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: BookingColors.successGreen.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text(
                              'Disponible de inmediato',
                              style: TextStyle(color: BookingColors.successGreen, fontSize: 11, fontWeight: FontWeight.bold),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Fila de especificaciones
              Row(
                children: [
                  _buildSpecIcon(Icons.people_outline, '${a.capacidadPasajeros} asientos'),
                  const SizedBox(width: 12),
                  _buildSpecIcon(Icons.settings_outlined, a.transmision),
                  const SizedBox(width: 12),
                  _buildSpecIcon(Icons.ac_unit, 'A/C'),
                ],
              ),
              const SizedBox(height: 12),
              const Divider(height: 1, thickness: 0.6, color: BookingColors.borderLight),
              const SizedBox(height: 10),

              // Precio y botón
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Precio por día:', style: TextStyle(fontSize: 11, color: BookingColors.textMuted)),
                      Text(
                        'US\$ ${a.precioPorDia.toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                      ),
                    ],
                  ),
                  ElevatedButton(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => AutoDetailScreen(auto: a)),
                      );
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: BookingColors.actionBlue,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                    ),
                    child: const Text('Reservar auto', style: TextStyle(fontSize: 13, color: Colors.white)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSpecIcon(IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, size: 15, color: BookingColors.textMuted),
        const SizedBox(width: 4),
        Text(text, style: const TextStyle(fontSize: 12, color: BookingColors.textMuted)),
      ],
    );
  }

  // ------------------------------------------
  // 4. SECCIÓN ATRACCIONES
  // ------------------------------------------
  Widget _buildAtraccionesSection() {
    final ciudades = ['Todos', 'Quito', 'Galápagos', 'Baños', 'Cuenca', 'Mindo'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Atracciones y experiencias en Ecuador',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: BookingColors.textDark),
        ),
        const SizedBox(height: 4),
        const Text(
          'Tours guiados, entradas y actividades al aire libre con operadores locales certificados',
          style: TextStyle(fontSize: 13, color: BookingColors.textMuted),
        ),
        const SizedBox(height: 12),

        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: ciudades.map((c) {
              final isSel = _selectedAtraccionFilter == c;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(c),
                  selected: isSel,
                  selectedColor: BookingColors.primaryBlue,
                  labelStyle: TextStyle(
                    color: isSel ? Colors.white : BookingColors.textDark,
                    fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                    fontSize: 13,
                  ),
                  backgroundColor: Colors.white,
                  side: BorderSide(
                    color: isSel ? BookingColors.primaryBlue : BookingColors.borderLight,
                  ),
                  onSelected: (val) {
                    if (val) setState(() => _selectedAtraccionFilter = c);
                  },
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 16),

        if (_loadingAtracciones)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(40),
              child: CircularProgressIndicator(color: BookingColors.primaryBlue),
            ),
          )
        else if (_filteredAtracciones.isEmpty)
          _buildEmptyState('No hay actividades disponibles en la ciudad elegida.', Icons.attractions_outlined)
        else
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _filteredAtracciones.length,
            itemBuilder: (context, i) {
              final at = _filteredAtracciones[i];
              return _buildAtraccionCard(at);
            },
          ),
      ],
    );
  }

  Widget _buildAtraccionCard(Atraccion a) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 2,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: BookingColors.borderLight, width: 0.8),
      ),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => AtraccionDetailScreen(atraccion: a)),
          );
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Image.network(
                a.imagenUrl ?? 'https://images.unsplash.com/photo-1589394815804-964ed0be2eb5?w=800',
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  color: Colors.blueGrey.shade100,
                  child: const Center(
                    child: Icon(Icons.landscape, size: 48, color: BookingColors.textMuted),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: BookingColors.primaryBlue.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          a.proveedor,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: BookingColors.primaryBlue,
                          ),
                        ),
                      ),
                      BookingRatingBadge(rating: a.rating, reviewsCount: 88),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    a.nombre,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: BookingColors.textDark),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.location_on_outlined, size: 15, color: BookingColors.primaryBlue),
                      const SizedBox(width: 4),
                      Text('${a.ciudad}, Ecuador', style: const TextStyle(fontSize: 13, color: BookingColors.textMuted)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const Divider(height: 1, thickness: 0.6, color: BookingColors.borderLight),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Desde', style: TextStyle(fontSize: 11, color: BookingColors.textMuted)),
                          Text(
                            'US\$ ${a.precio.toStringAsFixed(2)}',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                          ),
                        ],
                      ),
                      ElevatedButton(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => AtraccionDetailScreen(atraccion: a)),
                          );
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: BookingColors.actionBlue,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                        ),
                        child: const Text('Ver detalles', style: TextStyle(fontSize: 13, color: Colors.white)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // --- Helper Widgets ---
  Widget _buildPillBadge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.bold),
      ),
    );
  }

  Widget _buildEmptyState(String message, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(32),
      margin: const EdgeInsets.symmetric(vertical: 24),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: BookingColors.borderLight),
      ),
      child: Column(
        children: [
          Icon(icon, size: 48, color: BookingColors.textMuted),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, color: BookingColors.textMuted),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: _cargarTodosLosServicios,
            child: const Text('Restablecer búsqueda'),
          ),
        ],
      ),
    );
  }
}
