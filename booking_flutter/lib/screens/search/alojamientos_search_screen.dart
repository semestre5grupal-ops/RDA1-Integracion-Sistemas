import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../models/alojamiento.dart';
import '../../services/booking_services.dart';
import '../../theme/booking_colors.dart';
import '../../widgets/booking_rating_badge.dart';
import '../../widgets/booking_search_loading_view.dart';
import '../../widgets/occupancy_picker_sheet.dart';
import '../../utils/destinos_catalog.dart';
import '../detalle/alojamiento_detail_screen.dart';

class AlojamientosSearchScreen extends StatefulWidget {
  final String initialDestino;
  final DateTime initialCheckIn;
  final DateTime initialCheckOut;
  final OccupancySelection initialOccupancy;
  final String? initialPropertyType;

  const AlojamientosSearchScreen({
    super.key,
    required this.initialDestino,
    required this.initialCheckIn,
    required this.initialCheckOut,
    this.initialOccupancy = const OccupancySelection(),
    this.initialPropertyType,
  });

  @override
  State<AlojamientosSearchScreen> createState() => _AlojamientosSearchScreenState();
}

class _AlojamientosSearchScreenState extends State<AlojamientosSearchScreen> {
  static const double _sinLimitePresupuesto = 250.0;

  late TextEditingController _destinoCtrl;
  late DateTime _checkIn;
  late DateTime _checkOut;
  late OccupancySelection _occupancy;

  bool _loading = true;
  String? _error;
  List<Alojamiento> _properties = [];
  final Set<String> _wishlist = {};

  // Ordenamiento y Filtros (idéntico a AlojamientosSearchPage.jsx)
  String _sortBy = 'popularity'; // popularity, price_asc, price_desc, rating, reviews
  double _maxBudget = _sinLimitePresupuesto;
  final Set<String> _selectedTypes = {};
  final Set<String> _selectedFacilities = {};
  final Set<int> _selectedStars = {};
  double? _minReviewScore;
  final Set<String> _selectedPolicies = {};
  int _minBedrooms = 0;

  int get _nightsCount {
    final d = _checkOut.difference(_checkIn).inDays;
    return d > 0 ? d : 1;
  }

  @override
  void initState() {
    super.initState();
    _destinoCtrl = TextEditingController(text: widget.initialDestino);
    _checkIn = widget.initialCheckIn;
    _checkOut = widget.initialCheckOut;
    _occupancy = widget.initialOccupancy;
    if (widget.initialPropertyType != null && widget.initialPropertyType!.isNotEmpty) {
      _selectedTypes.add(widget.initialPropertyType!);
    }
    _fetchResults();
  }

  @override
  void dispose() {
    _destinoCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchResults() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final cin = DateFormat('yyyy-MM-dd').format(_checkIn);
      final cout = DateFormat('yyyy-MM-dd').format(_checkOut);
      final list = await BookingServices.searchAlojamientos(
        destino: _destinoCtrl.text.trim().isNotEmpty ? _destinoCtrl.text.trim() : 'Quito',
        checkin: cin,
        checkout: cout,
        adultos: _occupancy.adultos,
        ninos: _occupancy.ninos,
        habitaciones: _occupancy.habitaciones,
      );
      if (mounted) {
        setState(() {
          _properties = list;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Error al conectar con el servidor de alojamientos.';
          _loading = false;
        });
      }
    }
  }

  void _resetAllFilters() {
    setState(() {
      _maxBudget = _sinLimitePresupuesto;
      _selectedTypes.clear();
      _selectedFacilities.clear();
      _selectedStars.clear();
      _minReviewScore = null;
      _selectedPolicies.clear();
      _minBedrooms = 0;
    });
  }

  bool get _hasActiveFilters =>
      _maxBudget < _sinLimitePresupuesto ||
      _selectedTypes.isNotEmpty ||
      _selectedFacilities.isNotEmpty ||
      _selectedStars.isNotEmpty ||
      _minReviewScore != null ||
      _selectedPolicies.isNotEmpty ||
      _minBedrooms > 0;

  List<Alojamiento> get _filteredProperties {
    var result = _properties.where((p) {
      if (_maxBudget < _sinLimitePresupuesto && p.precioPorNoche > _maxBudget) return false;

      if (_selectedTypes.isNotEmpty) {
        final type = p.tipoPropiedad.toLowerCase();
        final name = p.nombre.toLowerCase();
        final match = _selectedTypes.any((t) {
          final tl = t.toLowerCase();
          if (tl.contains('hotel') && !tl.contains('apart')) return type.contains('hotel') || name.contains('hotel');
          if (tl.contains('depart') || tl.contains('apartamento')) {
            return type.contains('depart') || type.contains('apart') || name.contains('depart');
          }
          if (tl.contains('hostal')) return type.contains('hostal') || name.contains('hostal') || type.contains('posada');
          if (tl.contains('casa') || tl.contains('villa') || tl.contains('cabañ')) {
            return type.contains('casa') || type.contains('villa') || type.contains('caba') || name.contains('casa');
          }
          return type.contains(tl) || name.contains(tl);
        });
        if (!match) return false;
      }

      if (_selectedFacilities.isNotEmpty) {
        final ams = p.amenidades.map((e) => e.toLowerCase()).toList();
        final match = _selectedFacilities.every((f) {
          if (f == 'pool') return p.tienePiscina || ams.any((a) => a.contains('piscina') || a.contains('pool'));
          if (f == 'parking') return p.tieneParqueadero || ams.any((a) => a.contains('parqueadero') || a.contains('parking'));
          if (f == 'wifi') return ams.isEmpty || ams.any((a) => a.contains('wifi') || a.contains('internet'));
          if (f == 'spa') return ams.any((a) => a.contains('spa') || a.contains('bienestar'));
          if (f == 'kitchen') return ams.any((a) => a.contains('cocina') || a.contains('kitchen'));
          if (f == 'gym') return ams.any((a) => a.contains('gimnasio') || a.contains('gym'));
          if (f == 'restaurant') return ams.any((a) => a.contains('restaurante') || a.contains('desayuno'));
          return true;
        });
        if (!match) return false;
      }

      if (_selectedStars.isNotEmpty && !_selectedStars.contains(p.estrellas)) return false;
      if (_minReviewScore != null && p.rating < _minReviewScore!) return false;

      if (_selectedPolicies.isNotEmpty) {
        if (_selectedPolicies.contains('freecancel') && !p.cancelacionGratis) return false;
        if (_selectedPolicies.contains('noprepay') && !p.pagoEnAlojamiento) return false;
      }

      if (_minBedrooms > 0 && p.numHabitaciones < _minBedrooms) return false;
      return true;
    }).toList();

    switch (_sortBy) {
      case 'price_asc':
        result.sort((a, b) => a.precioPorNoche.compareTo(b.precioPorNoche));
        break;
      case 'price_desc':
        result.sort((a, b) => b.precioPorNoche.compareTo(a.precioPorNoche));
        break;
      case 'rating':
        result.sort((a, b) => b.rating.compareTo(a.rating));
        break;
      case 'reviews':
        result.sort((a, b) => b.reviewsCount.compareTo(a.reviewsCount));
        break;
      default:
        break;
    }
    return result;
  }

  Future<void> _openFiltersSheet() async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setSheet) {
            void toggle(Set<String> set, String val) {
              setSheet(() {
                if (set.contains(val)) {
                  set.remove(val);
                } else {
                  set.add(val);
                }
              });
              setState(() {});
            }

            return Container(
              height: MediaQuery.of(context).size.height * 0.85,
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
              ),
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 14, 12, 8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Filtrar resultados', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                        Row(
                          children: [
                            TextButton(
                              onPressed: () {
                                _resetAllFilters();
                                setSheet(() {});
                              },
                              child: const Text('Limpiar todo'),
                            ),
                            IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(ctx)),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.all(20),
                      children: [
                        const Text('Tu presupuesto (por noche)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        const SizedBox(height: 6),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('US\$ 5', style: TextStyle(fontSize: 13, color: BookingColors.textMuted)),
                            Text(
                              _maxBudget >= _sinLimitePresupuesto ? 'US\$ 250+ (Sin límite)' : 'Hasta US\$ ${_maxBudget.round()} / noche',
                              style: const TextStyle(fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                            ),
                          ],
                        ),
                        Slider(
                          value: _maxBudget,
                          min: 20,
                          max: _sinLimitePresupuesto,
                          divisions: 23,
                          activeColor: BookingColors.actionBlue,
                          onChanged: (v) {
                            setSheet(() => _maxBudget = v);
                            setState(() {});
                          },
                        ),
                        const Divider(height: 24),

                        const Text('Tipo de alojamiento', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          children: ['Hoteles', 'Apartamentos', 'Hostales', 'Casas y Villas'].map((t) {
                            final sel = _selectedTypes.contains(t);
                            return FilterChip(
                              label: Text(t),
                              selected: sel,
                              selectedColor: BookingColors.primaryBlue,
                              labelStyle: TextStyle(color: sel ? Colors.white : BookingColors.textDark),
                              onSelected: (_) => toggle(_selectedTypes, t),
                            );
                          }).toList(),
                        ),
                        const Divider(height: 24),

                        const Text('Estrellas', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          children: [5, 4, 3, 2].map((s) {
                            final sel = _selectedStars.contains(s);
                            return FilterChip(
                              label: Text('$s ★'),
                              selected: sel,
                              selectedColor: BookingColors.accentYellow,
                              onSelected: (_) {
                                setSheet(() {
                                  if (sel) {
                                    _selectedStars.remove(s);
                                  } else {
                                    _selectedStars.add(s);
                                  }
                                });
                                setState(() {});
                              },
                            );
                          }).toList(),
                        ),
                        const Divider(height: 24),

                        const Text('Servicios e instalaciones', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        const SizedBox(height: 6),
                        ...[
                          ('pool', 'Piscina'),
                          ('wifi', 'WiFi gratis'),
                          ('parking', 'Estacionamiento'),
                          ('kitchen', 'Cocina / Kitchenette'),
                          ('spa', 'Spa y bienestar'),
                          ('gym', 'Gimnasio'),
                          ('restaurant', 'Restaurante / Desayuno'),
                        ].map((entry) {
                          final sel = _selectedFacilities.contains(entry.$1);
                          return CheckboxListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            title: Text(entry.$2),
                            value: sel,
                            activeColor: BookingColors.primaryBlue,
                            onChanged: (_) => toggle(_selectedFacilities, entry.$1),
                          );
                        }),
                        const Divider(height: 24),

                        const Text('Políticas de reserva', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        CheckboxListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Cancelación gratis (hasta 48h)'),
                          value: _selectedPolicies.contains('freecancel'),
                          activeColor: BookingColors.successGreen,
                          onChanged: (_) => toggle(_selectedPolicies, 'freecancel'),
                        ),
                        CheckboxListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Sin pago por adelantado'),
                          value: _selectedPolicies.contains('noprepay'),
                          activeColor: BookingColors.successGreen,
                          onChanged: (_) => toggle(_selectedPolicies, 'noprepay'),
                        ),
                        const Divider(height: 24),

                        const Text('Puntuación mínima de huéspedes', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          children: [9.0, 8.0, 7.0].map((sc) {
                            final sel = _minReviewScore == sc;
                            return ChoiceChip(
                              label: Text('${sc.toStringAsFixed(0)}+'),
                              selected: sel,
                              selectedColor: BookingColors.primaryBlue,
                              labelStyle: TextStyle(color: sel ? Colors.white : BookingColors.textDark),
                              onSelected: (v) {
                                setSheet(() => _minReviewScore = v ? sc : null);
                                setState(() {});
                              },
                            );
                          }).toList(),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: () => Navigator.pop(ctx),
                        style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                        child: Text('Ver ${_filteredProperties.length} alojamientos', style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _editSearchSheet() async {
    final destCtrl = TextEditingController(text: _destinoCtrl.text);
    DateTime cin = _checkIn;
    DateTime cout = _checkOut;
    OccupancySelection occ = _occupancy;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModal) {
            return Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
              ),
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 16,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Modificar búsqueda', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  TextField(
                    controller: destCtrl,
                    decoration: InputDecoration(
                      labelText: 'Destino',
                      prefixIcon: const Icon(Icons.location_on_outlined),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    children: DestinosCatalog.destinosAlojamientos.where((d) => d.popular).map((d) {
                      return ActionChip(
                        label: Text(d.nombre, style: const TextStyle(fontSize: 12)),
                        onPressed: () => destCtrl.text = d.nombre,
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.calendar_today, size: 16),
                          label: Text(DateFormat('dd MMM').format(cin)),
                          onPressed: () async {
                            final p = await showDatePicker(
                              context: context,
                              initialDate: cin,
                              firstDate: DateTime.now(),
                              lastDate: DateTime.now().add(const Duration(days: 365)),
                            );
                            if (p != null) {
                              setModal(() {
                                cin = p;
                                if (!cout.isAfter(cin)) cout = cin.add(const Duration(days: 2));
                              });
                            }
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.event, size: 16),
                          label: Text(DateFormat('dd MMM').format(cout)),
                          onPressed: () async {
                            final p = await showDatePicker(
                              context: context,
                              initialDate: cout,
                              firstDate: cin.add(const Duration(days: 1)),
                              lastDate: DateTime.now().add(const Duration(days: 365)),
                            );
                            if (p != null) setModal(() => cout = p);
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(minimumSize: const Size(double.infinity, 44)),
                    icon: const Icon(Icons.people_outline),
                    label: Text(occ.resumenTexto),
                    onPressed: () async {
                      final res = await OccupancyPickerSheet.show(context, initial: occ);
                      if (res != null) setModal(() => occ = res);
                    },
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.pop(ctx);
                        setState(() {
                          _destinoCtrl.text = destCtrl.text.trim();
                          _checkIn = cin;
                          _checkOut = cout;
                          _occupancy = occ;
                        });
                        _fetchResults();
                      },
                      style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                      child: const Text('Actualizar resultados', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredProperties;
    final isWide = MediaQuery.of(context).size.width >= 900;

    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
        title: InkWell(
          onTap: _editSearchSheet,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: BookingColors.accentYellow, width: 2),
            ),
            child: Row(
              children: [
                const Icon(Icons.search, color: BookingColors.primaryBlue, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _destinoCtrl.text.isNotEmpty ? _destinoCtrl.text : 'Ecuador',
                        style: const TextStyle(color: BookingColors.textDark, fontSize: 13, fontWeight: FontWeight.bold),
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        '${DateFormat('dd MMM').format(_checkIn)} - ${DateFormat('dd MMM').format(_checkOut)} · ${_occupancy.resumenTexto}',
                        style: const TextStyle(color: BookingColors.textMuted, fontSize: 10),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.edit, color: BookingColors.actionBlue, size: 16),
              ],
            ),
          ),
        ),
      ),
      body: _loading
          ? BookingSearchLoadingView(destino: _destinoCtrl.text.isNotEmpty ? _destinoCtrl.text : 'Ecuador')
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.error_outline, size: 48, color: BookingColors.errorRed),
                        const SizedBox(height: 12),
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        ElevatedButton(onPressed: _fetchResults, child: const Text('Reintentar')),
                      ],
                    ),
                  ),
                )
              : Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1140),
                    child: Column(
                      children: [
                        // Barra de acciones: Ordenar & Filtrar (Estilo Booking)
                        Container(
                          color: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          child: Row(
                            children: [
                              Expanded(
                                child: DropdownButtonHideUnderline(
                                  child: DropdownButton<String>(
                                    value: _sortBy,
                                    isExpanded: true,
                                    icon: const Icon(Icons.sort, size: 18, color: BookingColors.actionBlue),
                                    style: const TextStyle(fontSize: 13, color: BookingColors.textDark, fontWeight: FontWeight.w600),
                                    items: const [
                                      DropdownMenuItem(value: 'popularity', child: Text('Ordenar: Nuestros favoritos')),
                                      DropdownMenuItem(value: 'price_asc', child: Text('Precio (más bajo primero)')),
                                      DropdownMenuItem(value: 'price_desc', child: Text('Precio (más alto primero)')),
                                      DropdownMenuItem(value: 'rating', child: Text('Mejor puntuados')),
                                      DropdownMenuItem(value: 'reviews', child: Text('Más comentarios')),
                                    ],
                                    onChanged: (val) {
                                      if (val != null) setState(() => _sortBy = val);
                                    },
                                  ),
                                ),
                              ),
                              if (!isWide) ...[
                                const SizedBox(width: 8),
                                OutlinedButton.icon(
                                  onPressed: _openFiltersSheet,
                                  icon: Icon(Icons.tune, size: 16, color: _hasActiveFilters ? Colors.white : BookingColors.actionBlue),
                                  label: Text(
                                    _hasActiveFilters ? 'Filtros activos' : 'Filtrar',
                                    style: TextStyle(fontSize: 13, color: _hasActiveFilters ? Colors.white : BookingColors.actionBlue),
                                  ),
                                  style: OutlinedButton.styleFrom(
                                    backgroundColor: _hasActiveFilters ? BookingColors.actionBlue : Colors.white,
                                    side: const BorderSide(color: BookingColors.actionBlue),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          color: const Color(0xFFF0F4F8),
                          child: Text(
                            '${_destinoCtrl.text.isNotEmpty ? _destinoCtrl.text : "Ecuador"}: ${filtered.length} ${filtered.length == 1 ? "alojamiento encontrado" : "alojamientos encontrados"}',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: BookingColors.textDark),
                          ),
                        ),
                        Expanded(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (isWide)
                                Container(
                                  width: 268,
                                  margin: const EdgeInsets.fromLTRB(14, 14, 0, 14),
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(10),
                                    border: Border.all(color: Colors.grey.shade300),
                                  ),
                                  child: SingleChildScrollView(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                          children: [
                                            const Text('Filtrar por:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                                            if (_hasActiveFilters)
                                              TextButton(onPressed: _resetAllFilters, child: const Text('Limpiar', style: TextStyle(fontSize: 12))),
                                          ],
                                        ),
                                        const Divider(),
                                        const Text('Presupuesto/noche', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                        Text(
                                          _maxBudget >= _sinLimitePresupuesto ? 'Sin límite (\$250+)' : 'Hasta US\$ ${_maxBudget.round()}',
                                          style: const TextStyle(fontSize: 12, color: BookingColors.actionBlue),
                                        ),
                                        Slider(
                                          value: _maxBudget,
                                          min: 20,
                                          max: _sinLimitePresupuesto,
                                          divisions: 23,
                                          onChanged: (v) => setState(() => _maxBudget = v),
                                        ),
                                        const Divider(),
                                        const Text('Tipo de alojamiento', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                        ...['Hoteles', 'Apartamentos', 'Hostales', 'Casas y Villas'].map((t) => CheckboxListTile(
                                              dense: true,
                                              contentPadding: EdgeInsets.zero,
                                              value: _selectedTypes.contains(t),
                                              title: Text(t, style: const TextStyle(fontSize: 12.5)),
                                              onChanged: (v) => setState(() => v == true ? _selectedTypes.add(t) : _selectedTypes.remove(t)),
                                            )),
                                        const Divider(),
                                        const Text('Categoría (estrellas)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                        Wrap(
                                          spacing: 4,
                                          children: [5, 4, 3].map((st) {
                                            final sel = _selectedStars.contains(st);
                                            return FilterChip(
                                              label: Text('$st ★', style: TextStyle(fontSize: 11, color: sel ? Colors.white : BookingColors.textDark)),
                                              selected: sel,
                                              selectedColor: BookingColors.actionBlue,
                                              onSelected: (_) => setState(() => sel ? _selectedStars.remove(st) : _selectedStars.add(st)),
                                            );
                                          }).toList(),
                                        ),
                                        const Divider(),
                                        const Text('Servicios y políticas', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                        ...[
                                          {'k': 'pool', 'l': 'Piscina'},
                                          {'k': 'parking', 'l': 'Parqueadero'},
                                          {'k': 'wifi', 'l': 'Wi-Fi gratis'},
                                          {'k': 'kitchen', 'l': 'Cocina'},
                                        ].map((f) => CheckboxListTile(
                                              dense: true,
                                              contentPadding: EdgeInsets.zero,
                                              value: _selectedFacilities.contains(f['k']),
                                              title: Text(f['l']!, style: const TextStyle(fontSize: 12.5)),
                                              onChanged: (v) => setState(() => v == true ? _selectedFacilities.add(f['k']!) : _selectedFacilities.remove(f['k']!)),
                                            )),
                                        CheckboxListTile(
                                          dense: true,
                                          contentPadding: EdgeInsets.zero,
                                          value: _selectedPolicies.contains('freecancel'),
                                          title: const Text('Cancelación gratis (48h)', style: TextStyle(fontSize: 12.5)),
                                          onChanged: (v) => setState(() => v == true ? _selectedPolicies.add('freecancel') : _selectedPolicies.remove('freecancel')),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              Expanded(
                                child: filtered.isEmpty
                                    ? Center(
                                        child: Padding(
                                          padding: const EdgeInsets.all(24),
                                          child: Column(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              const Icon(Icons.hotel_outlined, size: 54, color: BookingColors.textMuted),
                                              const SizedBox(height: 12),
                                              const Text(
                                                'No se encontraron alojamientos con tus filtros',
                                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                                                textAlign: TextAlign.center,
                                              ),
                                              const SizedBox(height: 8),
                                              if (_hasActiveFilters)
                                                ElevatedButton(
                                                  onPressed: _resetAllFilters,
                                                  child: const Text('Restablecer todos los filtros'),
                                                ),
                                            ],
                                          ),
                                        ),
                                      )
                                    : ListView.builder(
                                        padding: const EdgeInsets.all(14),
                                        itemCount: filtered.length,
                                        itemBuilder: (context, i) => _buildSearchCard(filtered[i]),
                                      ),
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

  Widget _buildSearchCard(Alojamiento prop) {
    final isSaved = _wishlist.contains(prop.id);
    final noches = prop.nochesCotizadas ?? _nightsCount;
    final rooms = _occupancy.habitaciones;
    final totalPrice = (prop.precioTotalCotizado != null)
        ? (prop.precioTotalCotizado! * rooms)
        : (prop.precioPorNoche * noches * rooms);
    final originalPrice = (totalPrice * 1.15).round();
    final taxes = (totalPrice * 0.15).round();
    final libres = prop.habitacionesDisponibles;

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 2,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: BookingColors.borderLight),
      ),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => AlojamientoDetailScreen(
                alojamiento: prop,
                initialCheckIn: _checkIn,
                initialCheckOut: _checkOut,
                initialOccupancy: _occupancy,
              ),
            ),
          );
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Image.network(
                    prop.imagenUrl ?? '',
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      color: Colors.blueGrey.shade100,
                      child: const Center(child: Icon(Icons.hotel, size: 48, color: BookingColors.textMuted)),
                    ),
                  ),
                ),
                Positioned(
                  top: 10,
                  right: 10,
                  child: InkWell(
                    onTap: () {
                      setState(() {
                        if (isSaved) {
                          _wishlist.remove(prop.id);
                        } else {
                          _wishlist.add(prop.id);
                        }
                      });
                    },
                    child: CircleAvatar(
                      radius: 17,
                      backgroundColor: Colors.white,
                      child: Icon(isSaved ? Icons.favorite : Icons.favorite_border, color: isSaved ? Colors.red : BookingColors.textDark, size: 19),
                    ),
                  ),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Flexible(
                                  child: Text(
                                    prop.nombre,
                                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: BookingColors.actionBlue),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Row(
                                  children: List.generate(
                                    prop.estrellas.clamp(1, 5),
                                    (_) => const Icon(Icons.star, size: 13, color: Color(0xFFFFB700)),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${prop.ciudad}${prop.distanciaCentroKm != null ? " · A ${prop.distanciaCentroKm} km del centro" : " · Cerca del centro"}',
                              style: const TextStyle(fontSize: 12, color: BookingColors.actionBlue, fontWeight: FontWeight.w500),
                            ),
                          ],
                        ),
                      ),
                      BookingRatingBadge(rating: prop.rating, reviewsCount: prop.reviewsCount > 0 ? prop.reviewsCount : null),
                    ],
                  ),
                  const SizedBox(height: 10),

                  // Resumen de habitaciones, camas y capacidad
                  Text(
                    prop.habitaciones.isNotEmpty
                        ? prop.habitaciones.first.nombre
                        : (prop.tipoAlojamiento ?? 'Habitación / Unidad disponible'),
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: BookingColors.textDark),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${prop.numHabitaciones} ${prop.numHabitaciones == 1 ? "habitación" : "habitaciones"} · ${prop.numCamas} ${prop.numCamas == 1 ? "cama" : "camas"} · Capacidad: ${prop.capacidadAdultos} adultos${prop.capacidadNinos > 0 ? ", ${prop.capacidadNinos} niños" : ""}',
                    style: const TextStyle(fontSize: 12, color: BookingColors.textMuted),
                  ),
                  const SizedBox(height: 8),

                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    children: [
                      _badgeGreen(prop.regimen),
                      if (prop.cancelacionGratis) _badgeGreen('Cancelación gratis (48h)'),
                      if (prop.pagoEnAlojamiento) _badgeGreen('Sin pago por adelantado'),
                    ],
                  ),

                  if (libres != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      libres <= 0
                          ? '¡Agotado para tus fechas!'
                          : (libres <= 3
                              ? '¡Solo queda(n) $libres habitación(es) disponible(s) para tus fechas!'
                              : '$libres habitaciones disponibles'),
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: libres <= 3 ? BookingColors.errorRed : BookingColors.successGreen,
                      ),
                    ),
                  ],

                  const Divider(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '$noches ${noches == 1 ? "noche" : "noches"}, ${_occupancy.resumenTexto}',
                            style: const TextStyle(fontSize: 11, color: BookingColors.textMuted),
                          ),
                          Row(
                            children: [
                              Text(
                                'US\$ $originalPrice',
                                style: const TextStyle(fontSize: 12, color: BookingColors.errorRed, decoration: TextDecoration.lineThrough),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                'US\$ ${totalPrice.toStringAsFixed(0)}',
                                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: BookingColors.textDark),
                              ),
                            ],
                          ),
                          Text(
                            '+ US\$ $taxes de impuestos y cargos (15% IVA)',
                            style: const TextStyle(fontSize: 11, color: BookingColors.textMuted),
                          ),
                        ],
                      ),
                      ElevatedButton(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => AlojamientoDetailScreen(
                                alojamiento: prop,
                                initialCheckIn: _checkIn,
                                initialCheckOut: _checkOut,
                                initialOccupancy: _occupancy,
                              ),
                            ),
                          );
                        },
                        style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                        child: const Text('Ver disponibilidad >', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
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

  Widget _badgeGreen(String text) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.check, size: 14, color: BookingColors.successGreen),
        const SizedBox(width: 3),
        Text(text, style: const TextStyle(fontSize: 11, color: BookingColors.successGreen, fontWeight: FontWeight.bold)),
      ],
    );
  }
}

