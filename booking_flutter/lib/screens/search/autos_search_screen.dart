import 'dart:async';
import 'package:flutter/material.dart';
import '../../utils/pantalla.dart';
import '../../widgets/fila_precio_accion.dart';
import 'package:intl/intl.dart';
import '../../models/auto.dart';
import '../../services/booking_services.dart';
import '../../theme/booking_colors.dart';
import '../../utils/destinos_catalog.dart';
import '../../widgets/booking_rating_badge.dart';
import '../../widgets/booking_search_loading_view.dart';
import '../detalle/auto_detail_screen.dart';

class AutosSearchScreen extends StatefulWidget {
  final String initialLocation;
  final DateTime initialPickupDate;
  final DateTime initialDropoffDate;
  final String initialPickupTime;
  final String initialDropoffTime;
  final int initialDriverAge;

  const AutosSearchScreen({
    super.key,
    required this.initialLocation,
    required this.initialPickupDate,
    required this.initialDropoffDate,
    this.initialPickupTime = '10:00',
    this.initialDropoffTime = '10:00',
    this.initialDriverAge = 30,
  });

  @override
  State<AutosSearchScreen> createState() => _AutosSearchScreenState();
}

class _AutosSearchScreenState extends State<AutosSearchScreen> {
  static const List<String> _timeSlots = [
    '00:00', '00:30', '01:00', '01:30', '02:00', '02:30', '03:00', '03:30',
    '04:00', '04:30', '05:00', '05:30', '06:00', '06:30', '07:00', '07:30',
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
    '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00', '23:30',
  ];

  static const List<String> _companyOptions = [
    'Europcar',
    'Alamo',
    'Keddy By Europcar',
    'Enterprise',
  ];

  static const List<String> _categoryOptions = [
    'Coche pequeño',
    'Coche mediano',
    'Coche grande',
    'SUV',
  ];

  late TextEditingController _locationCtrl;
  late DateTime _pickupDate;
  late DateTime _dropoffDate;
  late String _pickupTime;
  late String _dropoffTime;
  late int _driverAge;

  bool _loading = true;
  String? _error;
  List<Auto> _autos = [];
  AutosSearchMetadata _meta = AutosSearchMetadata();
  Timer? _pollTimer;

  String _sortBy = 'recommended'; // recommended, price_asc, price_desc, rating_desc
  String _activeCategoryChip = 'ALL';
  String _transmissionFilter = 'ALL'; // ALL, Automático, Manual

  final Set<String> _selectedCompanies = {};
  final Set<String> _selectedCategories = {};
  final Set<String> _selectedPriceBands = {}; // <50, 50-100, 100-150, 150+
  final Set<String> _selectedSeats = {}; // 4, 5, 7+

  int get _rentalDays {
    final diff = _dropoffDate.difference(_pickupDate).inDays;
    return diff > 0 ? diff : 1;
  }

  bool get _hasActiveFilters =>
      _activeCategoryChip != 'ALL' ||
      _transmissionFilter != 'ALL' ||
      _selectedCompanies.isNotEmpty ||
      _selectedCategories.isNotEmpty ||
      _selectedPriceBands.isNotEmpty ||
      _selectedSeats.isNotEmpty;

  @override
  void initState() {
    super.initState();
    _locationCtrl = TextEditingController(
      text: widget.initialLocation.trim().isNotEmpty ? widget.initialLocation.trim() : 'Quito',
    );
    _pickupDate = widget.initialPickupDate;
    _dropoffDate = widget.initialDropoffDate.isAfter(widget.initialPickupDate)
        ? widget.initialDropoffDate
        : widget.initialPickupDate.add(const Duration(days: 3));
    _pickupTime = _timeSlots.contains(widget.initialPickupTime) ? widget.initialPickupTime : '10:00';
    _dropoffTime = _timeSlots.contains(widget.initialDropoffTime) ? widget.initialDropoffTime : '10:00';
    _driverAge = widget.initialDriverAge.clamp(18, 99);
    _fetchAutos();
    _pollTimer = Timer.periodic(const Duration(seconds: 10), (_) => _fetchAutos(silent: true));
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _locationCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchAutos({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final res = await BookingServices.searchAutos(
        pickupLocation: _locationCtrl.text.trim(),
        pickupDate: DateFormat('yyyy-MM-dd').format(_pickupDate),
        pickupTime: _pickupTime,
        dropoffDate: DateFormat('yyyy-MM-dd').format(_dropoffDate),
        dropoffTime: _dropoffTime,
        driverAge: _driverAge,
        driverAgeBracket: _driverAge >= 30 && _driverAge <= 65,
        category: 'ALL',
        transmission: 'ALL',
      );
      final filtrados = _filtrarPorTexto(res.autos, _locationCtrl.text);
      if (mounted) {
        setState(() {
          _autos = filtrados;
          _meta = res.metadata;
          if (!silent) _loading = false;
        });
      }
    } catch (_) {
      if (mounted && !silent) {
        setState(() {
          _error = 'No se pudo cargar la flota disponible. Inténtalo nuevamente.';
          _loading = false;
        });
      }
    }
  }

  static const List<String> _ciudadesComunes = [
    'quito', 'guayaquil', 'cuenca', 'manta', 'loja', 'machala', 'galapagos', 'uio', 'gye', 'cue',
    'aeropuerto mariscal sucre', 'aeropuerto jose joaquin de olmedo', 'tababela', 'ecuador',
  ];

  static String _normalizar(String t) {
    const from = 'áàäâéèëêíìïîóòöôúùüûñ';
    const to = 'aaaaeeeeiiiioooouuuun';
    final lower = t.toLowerCase();
    final b = StringBuffer();
    for (final ch in lower.split('')) {
      final i = from.indexOf(ch);
      b.write(i >= 0 ? to[i] : ch);
    }
    return b.toString().replaceAll(RegExp(r'[^a-z0-9 ]'), ' ').replaceAll(RegExp(r'\s+'), ' ').trim();
  }

  /// Réplica del filtrado de AutosPage.jsx: si el texto de recogida no es solo
  /// una ciudad/aeropuerto, cada palabra restante debe aparecer en marca,
  /// modelo, categoría o proveedor (p. ej. "Quito Kia" → solo los Kia).
  static List<Auto> _filtrarPorTexto(List<Auto> autos, String texto) {
    final q = _normalizar(texto);
    if (q.isEmpty || _ciudadesComunes.contains(q)) return autos;
    final tokens = q.split(' ').where((t) => t.isNotEmpty && !_ciudadesComunes.contains(t)).toList();
    if (tokens.isEmpty) return autos;
    return autos.where((c) {
      final full = _normalizar('${c.marca} ${c.modelo} ${c.categoria} ${c.proveedor}');
      return tokens.every(full.contains);
    }).toList();
  }

  void _resetAllFilters() {
    setState(() {
      _activeCategoryChip = 'ALL';
      _transmissionFilter = 'ALL';
      _selectedCompanies.clear();
      _selectedCategories.clear();
      _selectedPriceBands.clear();
      _selectedSeats.clear();
    });
  }

  double _dailyEffectivePrice(Auto a) {
    final youngFee = (_driverAge < 25 && a.recargoConductorJoven == 0)
        ? (_meta.surchargeApplied ? _meta.surchargeAmount : 15.0)
        : a.recargoConductorJoven;
    return a.precioPorDia + youngFee;
  }

  List<Auto> get _filteredAutos {
    var list = _autos.where((a) {
      if (_activeCategoryChip != 'ALL' && !a.matchesVehicleCategory(_activeCategoryChip)) {
        return false;
      }

      if (_transmissionFilter != 'ALL') {
        final t = a.transmision.toLowerCase();
        if (_transmissionFilter == 'Automático' && !(t.contains('auto') || t.contains('at'))) {
          return false;
        }
        if (_transmissionFilter == 'Manual' && !(t.contains('man') || t.contains('mt') || t.contains('mec'))) {
          return false;
        }
      }

      if (_selectedCompanies.isNotEmpty) {
        if (!_selectedCompanies.any((c) => a.matchesCompany(c))) return false;
      }

      if (_selectedCategories.isNotEmpty) {
        if (!_selectedCategories.any((cat) => a.matchesVehicleCategory(cat))) return false;
      }

      if (_selectedPriceBands.isNotEmpty) {
        final p = a.precioPorDia;
        final matchesBand = _selectedPriceBands.any((band) {
          if (band == '<50') return p < 50;
          if (band == '50-100') return p >= 50 && p <= 100;
          if (band == '100-150') return p > 100 && p <= 150;
          if (band == '150+') return p > 150;
          return true;
        });
        if (!matchesBand) return false;
      }

      if (_selectedSeats.isNotEmpty) {
        final s = a.capacidadPasajeros;
        final matchesSeats = _selectedSeats.any((opt) {
          if (opt == '4') return s <= 4;
          if (opt == '5') return s == 5;
          if (opt == '7+') return s >= 6;
          return true;
        });
        if (!matchesSeats) return false;
      }

      return true;
    }).toList();

    switch (_sortBy) {
      case 'price_asc':
        list.sort((a, b) => _dailyEffectivePrice(a).compareTo(_dailyEffectivePrice(b)));
        break;
      case 'price_desc':
        list.sort((a, b) => _dailyEffectivePrice(b).compareTo(_dailyEffectivePrice(a)));
        break;
      case 'rating_desc':
        list.sort((a, b) => b.proveedorRating.compareTo(a.proveedorRating));
        break;
      default:
        list.sort((a, b) {
          if (a.enCooldown != b.enCooldown) return a.enCooldown ? 1 : -1;
          return b.proveedorRating.compareTo(a.proveedorRating);
        });
        break;
    }

    return list;
  }

  Future<void> _openEditSearchSheet() async {
    final locCtrl = TextEditingController(text: _locationCtrl.text);
    DateTime pDate = _pickupDate;
    DateTime dDate = _dropoffDate;
    String pTime = _pickupTime;
    String dTime = _dropoffTime;
    int age = _driverAge;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModal) {
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 18,
                bottom: MediaQuery.of(context).viewInsets.bottom + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Modificar búsqueda de autos',
                      style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: BookingColors.textDark),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: locCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Lugar de recogida (ciudad, aeropuerto o marca)',
                        prefixIcon: Icon(Icons.location_on_outlined),
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 34,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        children: DestinosCatalog.sugerenciasAutos.take(7).map((s) {
                          return Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: ActionChip(
                              label: Text(s, style: const TextStyle(fontSize: 11)),
                              onPressed: () => setModal(() => locCtrl.text = s),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.calendar_today, size: 15),
                            label: Text('Recogida: ${DateFormat('dd MMM').format(pDate)}', style: const TextStyle(fontSize: 12)),
                            onPressed: () async {
                              final picked = await showDatePicker(
                                context: context,
                                initialDate: pDate,
                                firstDate: DateTime.now(),
                                lastDate: DateTime.now().add(const Duration(days: 365)),
                              );
                              if (picked != null) {
                                setModal(() {
                                  pDate = picked;
                                  if (!dDate.isAfter(pDate)) dDate = pDate.add(const Duration(days: 2));
                                });
                              }
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        DropdownButton<String>(
                          value: pTime,
                          items: _timeSlots.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                          onChanged: (v) {
                            if (v != null) setModal(() => pTime = v);
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.event, size: 15),
                            label: Text('Devolución: ${DateFormat('dd MMM').format(dDate)}', style: const TextStyle(fontSize: 12)),
                            onPressed: () async {
                              final picked = await showDatePicker(
                                context: context,
                                initialDate: dDate,
                                firstDate: pDate.add(const Duration(days: 1)),
                                lastDate: DateTime.now().add(const Duration(days: 365)),
                              );
                              if (picked != null) setModal(() => dDate = picked);
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        DropdownButton<String>(
                          value: dTime,
                          items: _timeSlots.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                          onChanged: (v) {
                            if (v != null) setModal(() => dTime = v);
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Edad del conductor:', style: TextStyle(fontWeight: FontWeight.w600)),
                        Row(
                          children: [
                            IconButton(
                              onPressed: age > 18 ? () => setModal(() => age--) : null,
                              icon: const Icon(Icons.remove_circle_outline),
                            ),
                            Text('$age años', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                            IconButton(
                              onPressed: age < 99 ? () => setModal(() => age++) : null,
                              icon: const Icon(Icons.add_circle_outline),
                            ),
                          ],
                        ),
                      ],
                    ),
                    if (age < 25)
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFF8E1),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: BookingColors.accentYellow),
                        ),
                        child: const Text(
                          'Nota: Conductores menores de 25 años están sujetos a tarifa adicional de conductor joven.',
                          style: TextStyle(fontSize: 11, color: BookingColors.textDark),
                        ),
                      ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: () {
                          Navigator.pop(ctx);
                          setState(() {
                            _locationCtrl.text = locCtrl.text.trim().isNotEmpty ? locCtrl.text.trim() : 'Quito';
                            _pickupDate = pDate;
                            _dropoffDate = dDate;
                            _pickupTime = pTime;
                            _dropoffTime = dTime;
                            _driverAge = age;
                          });
                          _fetchAutos();
                        },
                        style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                        child: const Text('Buscar autos', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _openFiltersSheet() async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModal) {
            return DraggableScrollableSheet(
              expand: false,
              initialChildSize: 0.78,
              maxChildSize: 0.92,
              minChildSize: 0.5,
              builder: (_, ctrl) => Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Filtrar vehículos', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                        TextButton(
                          onPressed: () {
                            _resetAllFilters();
                            setModal(() {});
                          },
                          child: const Text('Limpiar todo'),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1),
                  Expanded(
                    child: ListView(
                      controller: ctrl,
                      padding: const EdgeInsets.all(16),
                      children: [
                        const Text('Proveedor / Arrendadora', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                        const SizedBox(height: 6),
                        ..._companyOptions.map((c) {
                          final count = _autos.where((a) => a.matchesCompany(c)).length;
                          final checked = _selectedCompanies.contains(c);
                          return CheckboxListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            value: checked,
                            title: Text('$c ($count)'),
                            onChanged: (v) {
                              setState(() {
                                if (v == true) {
                                  _selectedCompanies.add(c);
                                } else {
                                  _selectedCompanies.remove(c);
                                }
                              });
                              setModal(() {});
                            },
                          );
                        }),
                        const Divider(),
                        const Text('Categoría de vehículo', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                        const SizedBox(height: 6),
                        ..._categoryOptions.map((cat) {
                          final count = _autos.where((a) => a.matchesVehicleCategory(cat)).length;
                          final checked = _selectedCategories.contains(cat);
                          return CheckboxListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            value: checked,
                            title: Text('$cat ($count)'),
                            onChanged: (v) {
                              setState(() {
                                if (v == true) {
                                  _selectedCategories.add(cat);
                                } else {
                                  _selectedCategories.remove(cat);
                                }
                              });
                              setModal(() {});
                            },
                          );
                        }),
                        const Divider(),
                        const Text('Precio por día (US\$)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                        const SizedBox(height: 6),
                        ...[
                          {'key': '<50', 'label': 'Menos de US\$ 50'},
                          {'key': '50-100', 'label': 'US\$ 50 - US\$ 100'},
                          {'key': '100-150', 'label': 'US\$ 100 - US\$ 150'},
                          {'key': '150+', 'label': 'Más de US\$ 150'},
                        ].map((band) {
                          final k = band['key']!;
                          return CheckboxListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            value: _selectedPriceBands.contains(k),
                            title: Text(band['label']!),
                            onChanged: (v) {
                              setState(() {
                                if (v == true) {
                                  _selectedPriceBands.add(k);
                                } else {
                                  _selectedPriceBands.remove(k);
                                }
                              });
                              setModal(() {});
                            },
                          );
                        }),
                        const Divider(),
                        const Text('Número de asientos', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                        const SizedBox(height: 6),
                        ...[
                          {'key': '4', 'label': '4 asientos'},
                          {'key': '5', 'label': '5 asientos'},
                          {'key': '7+', 'label': '6 o más asientos (Familiar / SUV)'},
                        ].map((seat) {
                          final k = seat['key']!;
                          return CheckboxListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            value: _selectedSeats.contains(k),
                            title: Text(seat['label']!),
                            onChanged: (v) {
                              setState(() {
                                if (v == true) {
                                  _selectedSeats.add(k);
                                } else {
                                  _selectedSeats.remove(k);
                                }
                              });
                              setModal(() {});
                            },
                          );
                        }),
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
                        child: Text(
                          'Ver ${_filteredAutos.length} vehículos',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                        ),
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

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredAutos;
    final isWide = MediaQuery.of(context).size.width >= 900;

    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
        title: InkWell(
          onTap: _openEditSearchSheet,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: BookingColors.accentYellow, width: 2),
            ),
            child: Row(
              children: [
                const Icon(Icons.directions_car, color: BookingColors.primaryBlue, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${_locationCtrl.text} · $_driverAge años',
                        style: const TextStyle(color: BookingColors.textDark, fontSize: 13, fontWeight: FontWeight.bold),
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        '${DateFormat('dd MMM').format(_pickupDate)} ($_pickupTime) → ${DateFormat('dd MMM').format(_dropoffDate)} ($_dropoffTime)',
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
          ? BookingSearchLoadingView(
              destino: _locationCtrl.text.trim(),
              frases: const [
                'Buscando vehículos disponibles en tiempo real...',
                'Verificando flotas con Europcar, Alamo, Enterprise y Keddy...',
                'Calculando coberturas, kilometraje y fechas ocupadas...',
                'Comprobando reglas de conductor joven y disponibilidad...',
              ],
            )
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.car_crash_outlined, size: 48, color: BookingColors.errorRed),
                        const SizedBox(height: 12),
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        ElevatedButton(onPressed: _fetchAutos, child: const Text('Reintentar')),
                      ],
                    ),
                  ),
                )
              : Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1140),
                    child: Column(
                      children: [
                        // Chips de categoría + transmisión
                        Container(
                          color: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Row(
                              children: [
                                ...['ALL', ..._categoryOptions].map((cat) {
                                  final label = cat == 'ALL' ? 'Todos' : cat;
                                  final selected = _activeCategoryChip == cat;
                                  return Padding(
                                    padding: const EdgeInsets.only(right: 6),
                                    child: ChoiceChip(
                                      label: Text(label, style: TextStyle(fontSize: 12, color: selected ? Colors.white : BookingColors.textDark)),
                                      selected: selected,
                                      selectedColor: BookingColors.actionBlue,
                                      onSelected: (_) => setState(() => _activeCategoryChip = cat),
                                    ),
                                  );
                                }),
                                const VerticalDivider(width: 12),
                                ...['ALL', 'Automático', 'Manual'].map((tr) {
                                  final label = tr == 'ALL' ? 'Transmisión: Todas' : tr;
                                  final selected = _transmissionFilter == tr;
                                  return Padding(
                                    padding: const EdgeInsets.only(right: 6),
                                    child: ChoiceChip(
                                      label: Text(label, style: TextStyle(fontSize: 12, color: selected ? Colors.white : BookingColors.textDark)),
                                      selected: selected,
                                      selectedColor: BookingColors.primaryBlue,
                                      onSelected: (_) => setState(() => _transmissionFilter = tr),
                                    ),
                                  );
                                }),
                              ],
                            ),
                          ),
                        ),
                        // Sort + Filtros
                        Container(
                          color: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          child: Row(
                            children: [
                              Expanded(
                                child: DropdownButtonHideUnderline(
                                  child: DropdownButton<String>(
                                    value: _sortBy,
                                    isExpanded: true,
                                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: BookingColors.textDark),
                                    items: const [
                                      DropdownMenuItem(value: 'recommended', child: Text('Ordenar: Recomendados')),
                                      DropdownMenuItem(value: 'price_asc', child: Text('Precio: menor a mayor')),
                                      DropdownMenuItem(value: 'price_desc', child: Text('Precio: mayor a menor')),
                                      DropdownMenuItem(value: 'rating_desc', child: Text('Mejor puntuación proveedor')),
                                    ],
                                    onChanged: (v) {
                                      if (v != null) setState(() => _sortBy = v);
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
                                    style: TextStyle(fontSize: 12, color: _hasActiveFilters ? Colors.white : BookingColors.actionBlue),
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
                        // Alerta Conductor Joven (<25 años) o Cooldown
                        if (_driverAge < 25 || _meta.surchargeApplied)
                          Container(
                            width: double.infinity,
                            color: const Color(0xFFFFF3E0),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            child: Row(
                              children: [
                                const Icon(Icons.warning_amber_rounded, color: Colors.orange, size: 18),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'Conductor menor de 25 años: aplica recargo de +US\$ ${_meta.surchargeAmount.toStringAsFixed(2)}/día en el alquiler.',
                                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF7A4100)),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        Container(
                          width: double.infinity,
                          color: const Color(0xFFF0F4F8),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                '${filtered.length} ${filtered.length == 1 ? "vehículo disponible" : "vehículos disponibles"} ($_rentalDays ${_rentalDays == 1 ? "día" : "días"})',
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: BookingColors.textDark),
                              ),
                              const Row(
                                children: [
                                  Icon(Icons.shield_outlined, size: 14, color: BookingColors.successGreen),
                                  SizedBox(width: 4),
                                  Text('Cooldown 2h verificado', style: TextStyle(fontSize: 11, color: BookingColors.successGreen, fontWeight: FontWeight.w600)),
                                ],
                              ),
                            ],
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
                                            const Text('Filtrar vehículos', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                                            if (_hasActiveFilters)
                                              TextButton(onPressed: _resetAllFilters, child: const Text('Limpiar', style: TextStyle(fontSize: 12))),
                                          ],
                                        ),
                                        const Divider(),
                                        const Text('Proveedor / Arrendadora', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                        ..._companyOptions.map((c) {
                                          final count = _autos.where((a) => a.matchesCompany(c)).length;
                                          return CheckboxListTile(
                                            dense: true,
                                            contentPadding: EdgeInsets.zero,
                                            value: _selectedCompanies.contains(c),
                                            title: Text('$c ($count)', style: const TextStyle(fontSize: 12.5)),
                                            onChanged: (v) => setState(() => v == true ? _selectedCompanies.add(c) : _selectedCompanies.remove(c)),
                                          );
                                        }),
                                        const Divider(),
                                        const Text('Categoría', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                        ..._categoryOptions.map((cat) {
                                          final count = _autos.where((a) => a.matchesVehicleCategory(cat)).length;
                                          return CheckboxListTile(
                                            dense: true,
                                            contentPadding: EdgeInsets.zero,
                                            value: _selectedCategories.contains(cat),
                                            title: Text('$cat ($count)', style: const TextStyle(fontSize: 12.5)),
                                            onChanged: (v) => setState(() => v == true ? _selectedCategories.add(cat) : _selectedCategories.remove(cat)),
                                          );
                                        }),
                                        const Divider(),
                                        const Text('Asientos', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                        ...[
                                          {'key': '4', 'label': '4 asientos'},
                                          {'key': '5', 'label': '5 asientos'},
                                          {'key': '7+', 'label': '6+ asientos'},
                                        ].map((s) => CheckboxListTile(
                                              dense: true,
                                              contentPadding: EdgeInsets.zero,
                                              value: _selectedSeats.contains(s['key']),
                                              title: Text(s['label']!, style: const TextStyle(fontSize: 12.5)),
                                              onChanged: (v) => setState(() => v == true ? _selectedSeats.add(s['key']!) : _selectedSeats.remove(s['key']!)),
                                            )),
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
                                              const Icon(Icons.directions_car_outlined, size: 54, color: BookingColors.textMuted),
                                              const SizedBox(height: 12),
                                              const Text(
                                                'No hay autos que coincidan con tus filtros.',
                                                style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                                                textAlign: TextAlign.center,
                                              ),
                                              const SizedBox(height: 10),
                                              if (_hasActiveFilters)
                                                ElevatedButton(
                                                  onPressed: _resetAllFilters,
                                                  child: const Text('Limpiar filtros'),
                                                ),
                                            ],
                                          ),
                                        ),
                                      )
                                    : ListView.builder(
                                        padding: const EdgeInsets.all(14),
                                        itemCount: filtered.length,
                                        itemBuilder: (_, i) => _buildAutoCard(filtered[i]),
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

  Widget _buildAutoCard(Auto auto) {
    final dailyTotal = _dailyEffectivePrice(auto);
    final totalStay = dailyTotal * _rentalDays;

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => AutoDetailScreen(
                auto: auto,
                initialPickupDate: _pickupDate,
                initialDropoffDate: _dropoffDate,
                pickupTime: _pickupTime,
                dropoffTime: _dropoffTime,
                pickupLocation: _locationCtrl.text.trim(),
                initialDriverAge: _driverAge,
              ),
            ),
          );
        },
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Proveedor & Rating
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // Flexible: nombres de proveedor largos ya no empujan la nota fuera de la tarjeta.
                  Flexible(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEFF6FF),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        auto.proveedor,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  BookingRatingBadge(rating: auto.proveedorRating, showText: !esCompacto(context)),
                ],
              ),
              const SizedBox(height: 10),

              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      width: 118,
                      height: 82,
                      color: const Color(0xFFF5F7FA),
                      child: Image.network(
                        auto.imagenUrl ?? '',
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Icon(Icons.directions_car, size: 42, color: BookingColors.textMuted),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                auto.carDisplayName,
                                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: BookingColors.textDark),
                              ),
                            ),
                          ],
                        ),
                        const Text(
                          'o similar',
                          style: TextStyle(fontSize: 11, color: BookingColors.textMuted),
                        ),
                        const SizedBox(height: 4),
                        Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          children: [
                            _tagChip(auto.categoria),
                            if (auto.enCooldown)
                              _tagChip('En limpieza / Cooldown 2h', bg: const Color(0xFFFFF3CD), fg: const Color(0xFF856404)),
                            if (auto.noDisponibleTotal)
                              _tagChip('Sin unidades', bg: const Color(0xFFFCE8E8), fg: BookingColors.errorRed),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Especificaciones y capacidades exactas
              Wrap(
                spacing: 12,
                runSpacing: 6,
                children: [
                  _specItem(Icons.person_outline, '${auto.capacidadPasajeros} plazas'),
                  _specItem(Icons.sensor_door_outlined, '${auto.puertas} puertas'),
                  _specItem(Icons.settings_outlined, auto.transmision),
                  _specItem(Icons.luggage_outlined, '${auto.maletasGrandes} grande(s), ${auto.maletasPequenas} pequeña(s)'),
                  _specItem(Icons.speed, auto.kilometrajeIlimitado ? 'Km ilimitados' : 'Km limitados'),
                  _specItem(Icons.local_gas_station_outlined, auto.politicaCombustible),
                  if (auto.aireAcondicionado) _specItem(Icons.ac_unit, 'Aire acondicionado'),
                ],
              ),
              const SizedBox(height: 8),

              Row(
                children: [
                  const Icon(Icons.location_on_outlined, size: 14, color: BookingColors.actionBlue),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      auto.proveedorUbicacion,
                      style: const TextStyle(fontSize: 12, color: BookingColors.actionBlue),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Icon(
                    auto.cancelacionGratuita ? Icons.check : Icons.info_outline,
                    size: 15,
                    color: auto.cancelacionGratuita ? BookingColors.successGreen : BookingColors.textMuted,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    auto.cancelacionGratuita ? 'Cancelación gratuita (hasta 24h antes)' : 'Política estándar',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: auto.cancelacionGratuita ? BookingColors.successGreen : BookingColors.textMuted,
                    ),
                  ),
                ],
              ),
              const Divider(height: 18),

              FilaPrecioAccion(
                  precio: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Precio por $_rentalDays ${_rentalDays == 1 ? "día" : "días"} (+15% IVA al pagar)',
                        style: const TextStyle(fontSize: 11, color: BookingColors.textMuted),
                      ),
                      Text(
                        'US\$ ${totalStay.toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: BookingColors.textDark),
                      ),
                      Text(
                        'US\$ ${dailyTotal.toStringAsFixed(2)} / día',
                        style: const TextStyle(fontSize: 11, color: BookingColors.textMuted),
                      ),
                    ],
                  ),
                  accion: ElevatedButton(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AutoDetailScreen(
                            auto: auto,
                            initialPickupDate: _pickupDate,
                            initialDropoffDate: _dropoffDate,
                            pickupTime: _pickupTime,
                            dropoffTime: _dropoffTime,
                            pickupLocation: _locationCtrl.text.trim(),
                            initialDriverAge: _driverAge,
                          ),
                        ),
                      );
                    },
                    style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                    child: const Text('Ver oferta >', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tagChip(String label, {Color bg = const Color(0xFFF1F5F9), Color fg = BookingColors.textDark}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(4)),
      child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: fg)),
    );
  }

  Widget _specItem(IconData icon, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15, color: BookingColors.textMuted),
        const SizedBox(width: 4),
        Text(label, style: const TextStyle(fontSize: 12, color: BookingColors.textDark)),
      ],
    );
  }
}

