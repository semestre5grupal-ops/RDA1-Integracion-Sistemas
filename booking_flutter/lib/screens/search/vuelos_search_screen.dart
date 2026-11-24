import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../models/vuelo.dart';
import '../../services/booking_services.dart';
import '../../theme/booking_colors.dart';
import '../../utils/destinos_catalog.dart';
import '../../widgets/booking_search_loading_view.dart';
import '../../widgets/vuelo_passengers_sheet.dart';
import '../detalle/vuelo_detail_screen.dart';

class _FlightGroup {
  final String key;
  final List<Vuelo> offers;
  final Vuelo representative;
  final double lowestPrice;

  _FlightGroup({
    required this.key,
    required this.offers,
    required this.representative,
    required this.lowestPrice,
  });
}

class _FareCardItem {
  final Vuelo offer;
  final VueloCabinOption option;
  final double computedTotal;

  _FareCardItem({
    required this.offer,
    required this.option,
    required this.computedTotal,
  });
}

class VuelosSearchScreen extends StatefulWidget {
  final String originIata;
  final String destinationIata;
  final DateTime departureDate;
  final DateTime? returnDate;
  final bool isRoundTrip;
  final VueloPassengersSelection initialPassengers;

  const VuelosSearchScreen({
    super.key,
    required this.originIata,
    required this.destinationIata,
    required this.departureDate,
    this.returnDate,
    this.isRoundTrip = false,
    this.initialPassengers = const VueloPassengersSelection(),
  });

  @override
  State<VuelosSearchScreen> createState() => _VuelosSearchScreenState();
}

class _VuelosSearchScreenState extends State<VuelosSearchScreen> {
  late String _origin;
  late String _destination;
  late DateTime _departureDate;
  DateTime? _returnDate;
  late bool _isRoundTrip;
  late VueloPassengersSelection _passengers;

  bool _loading = true;
  String? _error;
  List<Vuelo> _offers = [];
  List<VueloSource> _sources = [];
  double _bookingFeePct = 0.0;

  // Filtros & Orden (igual que VuelosPage.jsx)
  String _stopsFilter = 'all'; // all, direct, stops
  String _airlineFilter = 'ALL';
  String _sortBy = 'price'; // price, duration, departure
  final Set<String> _expandedGroupKeys = {};

  @override
  void initState() {
    super.initState();
    _origin = widget.originIata;
    _destination = widget.destinationIata;
    _departureDate = widget.departureDate;
    _returnDate = widget.returnDate;
    _isRoundTrip = widget.isRoundTrip;
    _passengers = widget.initialPassengers;
    _fetchFlights();
  }

  Future<void> _fetchFlights() async {
    setState(() {
      _loading = true;
      _error = null;
      _expandedGroupKeys.clear();
    });
    try {
      final itineraries = <Map<String, String>>[
        {
          'origin': _origin,
          'destination': _destination,
          'departureDate': DateFormat('yyyy-MM-dd').format(_departureDate),
        },
      ];
      if (_isRoundTrip && _returnDate != null) {
        itineraries.add({
          'origin': _destination,
          'destination': _origin,
          'departureDate': DateFormat('yyyy-MM-dd').format(_returnDate!),
        });
      }

      final result = await BookingServices.searchVuelos(
        itineraries: itineraries,
        passengers: _passengers.toApiMap(),
      );
      if (mounted) {
        setState(() {
          _offers = result.offers;
          _sources = result.sources;
          _bookingFeePct = result.bookingFeePct;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'No se pudieron consultar vuelos disponibles: ${e.toString()}';
          _loading = false;
        });
      }
    }
  }

  List<String> get _availableAirlines {
    final set = <String>{};
    for (final o in _offers) {
      if (o.airlineName.isNotEmpty) set.add(o.airlineName);
    }
    return set.toList()..sort();
  }

  double _computeOptionPrice(Vuelo offer, VueloCabinOption opt) {
    final map = opt.pricePerPassengerType;
    if (map.isEmpty) return offer.totalPrice;

    final pAdult = map['ADULT'] ?? offer.totalPrice / (_passengers.seatedTotal > 0 ? _passengers.seatedTotal : 1);
    final pYouth = map['YOUTH'] ?? pAdult;
    final pChild = map['CHILD'] ?? pAdult;
    final pInfant = map['INFANT'] ?? 0.0;

    final sum = (_passengers.adults * pAdult) +
        (_passengers.youths * pYouth) +
        (_passengers.children * pChild) +
        (_passengers.infants * pInfant);

    return sum > 0 ? sum : offer.totalPrice;
  }

  List<_FlightGroup> get _filteredGroups {
    // 1. Filtrar ofertas
    final filtered = _offers.where((offer) {
      if (_stopsFilter == 'direct') {
        if (offer.itineraries.any((it) => it.stopsCount > 0)) return false;
      } else if (_stopsFilter == 'stops') {
        if (offer.itineraries.every((it) => it.stopsCount == 0)) return false;
      }
      if (_airlineFilter != 'ALL' && offer.airlineName != _airlineFilter) return false;
      return true;
    }).toList();

    // 2. Agrupar ofertas por ruta/vuelos (VueloGroupCard.jsx parity)
    final map = <String, List<Vuelo>>{};
    for (final o in filtered) {
      final flightNumbersKey = o.itineraries
          .map((it) => it.segments.map((s) => s.flightNumber).join('+'))
          .join(' / ');
      final key = '${o.airlineCode}|${o.airlineName}|$flightNumbersKey';
      map.putIfAbsent(key, () => []).add(o);
    }

    final groups = <_FlightGroup>[];
    map.forEach((key, list) {
      list.sort((a, b) => a.totalPrice.compareTo(b.totalPrice));
      double minP = list.first.totalPrice;
      for (final o in list) {
        if (o.totalPrice < minP) minP = o.totalPrice;
        if (o.itineraries.isNotEmpty) {
          for (final opt in o.itineraries.first.pricingOptions) {
            final p = _computeOptionPrice(o, opt);
            if (p < minP) minP = p;
          }
        }
      }
      groups.add(
        _FlightGroup(
          key: key,
          offers: list,
          representative: list.first,
          lowestPrice: minP,
        ),
      );
    });

    // 3. Ordenar grupos
    groups.sort((a, b) {
      if (_sortBy == 'duration') {
        return a.representative.duracionMinutos.compareTo(b.representative.duracionMinutos);
      }
      if (_sortBy == 'departure') {
        return a.representative.horaSalida.compareTo(b.representative.horaSalida);
      }
      return a.lowestPrice.compareTo(b.lowestPrice);
    });

    return groups;
  }

  List<_FareCardItem> _buildFareCards(_FlightGroup group) {
    final items = <_FareCardItem>[];
    final seen = <String>{};

    for (final offer in group.offers) {
      final firstOpts = offer.itineraries.isNotEmpty ? offer.itineraries.first.pricingOptions : <VueloCabinOption>[];
      if (firstOpts.isEmpty) {
        final fallbackOpt = VueloCabinOption(
          cabinClass: 'ECONOMY',
          fareBrand: 'STANDARD',
          availableSeats: offer.availableSeats,
        );
        items.add(_FareCardItem(offer: offer, option: fallbackOpt, computedTotal: offer.totalPrice));
      } else {
        for (final opt in firstOpts) {
          final uniqueKey = '${offer.offerId}-${opt.cabinClass}-${opt.fareBrand}';
          if (seen.add(uniqueKey)) {
            items.add(
              _FareCardItem(
                offer: offer,
                option: opt,
                computedTotal: _computeOptionPrice(offer, opt),
              ),
            );
          }
        }
      }
    }

    items.sort((a, b) => a.computedTotal.compareTo(b.computedTotal));
    return items;
  }

  Future<void> _openEditSearchSheet() async {
    String orig = _origin;
    String dest = _destination;
    DateTime dep = _departureDate;
    DateTime? ret = _returnDate;
    bool round = _isRoundTrip;
    VueloPassengersSelection pax = _passengers;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModal) {
            final airports = DestinosCatalog.todosAeropuertos;
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
                    const Text('Modificar búsqueda de vuelos', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        ChoiceChip(
                          label: const Text('Solo ida'),
                          selected: !round,
                          onSelected: (_) => setModal(() => round = false),
                        ),
                        const SizedBox(width: 8),
                        ChoiceChip(
                          label: const Text('Ida y vuelta'),
                          selected: round,
                          onSelected: (_) => setModal(() {
                            round = true;
                            ret ??= dep.add(const Duration(days: 5));
                          }),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      value: airports.any((a) => a.codigo == orig) ? orig : airports.first.codigo,
                      decoration: const InputDecoration(labelText: 'Origen', border: OutlineInputBorder()),
                      items: airports.map((a) => DropdownMenuItem(value: a.codigo, child: Text(a.nombre))).toList(),
                      onChanged: (v) {
                        if (v != null) setModal(() => orig = v);
                      },
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            value: airports.any((a) => a.codigo == dest) ? dest : airports[1].codigo,
                            decoration: const InputDecoration(labelText: 'Destino', border: OutlineInputBorder()),
                            items: airports.map((a) => DropdownMenuItem(value: a.codigo, child: Text(a.nombre))).toList(),
                            onChanged: (v) {
                              if (v != null) setModal(() => dest = v);
                            },
                          ),
                        ),
                        IconButton(
                          tooltip: 'Intercambiar origen y destino',
                          icon: const Icon(Icons.swap_vert, color: BookingColors.actionBlue),
                          onPressed: () {
                            setModal(() {
                              final tmp = orig;
                              orig = dest;
                              dest = tmp;
                            });
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.flight_takeoff, size: 15),
                            label: Text('Ida: ${DateFormat('dd MMM').format(dep)}'),
                            onPressed: () async {
                              final picked = await showDatePicker(
                                context: context,
                                initialDate: dep,
                                firstDate: DateTime.now(),
                                lastDate: DateTime.now().add(const Duration(days: 365)),
                              );
                              if (picked != null) {
                                setModal(() {
                                  dep = picked;
                                  if (ret != null && !ret!.isAfter(dep)) ret = dep.add(const Duration(days: 3));
                                });
                              }
                            },
                          ),
                        ),
                        if (round) ...[
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton.icon(
                              icon: const Icon(Icons.flight_land, size: 15),
                              label: Text('Vuelta: ${DateFormat('dd MMM').format(ret ?? dep.add(const Duration(days: 5)))}'),
                              onPressed: () async {
                                final picked = await showDatePicker(
                                  context: context,
                                  initialDate: ret ?? dep.add(const Duration(days: 5)),
                                  firstDate: dep.add(const Duration(days: 1)),
                                  lastDate: DateTime.now().add(const Duration(days: 365)),
                                );
                                if (picked != null) setModal(() => ret = picked);
                              },
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(minimumSize: const Size(double.infinity, 44)),
                      icon: const Icon(Icons.people_outline),
                      label: Text(pax.resumenTexto),
                      onPressed: () async {
                        final res = await VueloPassengersSheet.show(context, initial: pax);
                        if (res != null) setModal(() => pax = res);
                      },
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: () {
                          if (orig == dest) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('El aeropuerto de origen y destino deben ser distintos.')),
                            );
                            return;
                          }
                          Navigator.pop(ctx);
                          setState(() {
                            _origin = orig;
                            _destination = dest;
                            _departureDate = dep;
                            _returnDate = ret;
                            _isRoundTrip = round;
                            _passengers = pax;
                          });
                          _fetchFlights();
                        },
                        style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                        child: const Text('Buscar vuelos', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
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

  @override
  Widget build(BuildContext context) {
    final groups = _filteredGroups;
    final okSources = _sources.where((s) => s.ok).length;

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
                const Icon(Icons.flight_takeoff, color: BookingColors.primaryBlue, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$_origin → $_destination ${_isRoundTrip ? "(Ida y vuelta)" : "(Solo ida)"}',
                        style: const TextStyle(color: BookingColors.textDark, fontSize: 13, fontWeight: FontWeight.bold),
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        '${DateFormat('dd MMM').format(_departureDate)}${_isRoundTrip && _returnDate != null ? " - ${DateFormat('dd MMM').format(_returnDate!)}" : ""} · ${_passengers.resumenTexto}',
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
              destino: '$_origin ➔ $_destination',
              frases: const [
                'Consultando tarifas en vivo con las 5 aerolíneas socias...',
                'Comparando clases Económica, Premium y Ejecutiva...',
                'Verificando equipaje incluido y políticas de cambio...',
                'Organizando las mejores combinaciones de vuelo...',
              ],
            )
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.flight_land, size: 48, color: BookingColors.errorRed),
                        const SizedBox(height: 12),
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        ElevatedButton(onPressed: _fetchFlights, child: const Text('Reintentar')),
                      ],
                    ),
                  ),
                )
              : Column(
                  children: [
                    // Filtros rápidos Escalas + Aerolínea + Sort
                    Container(
                      color: Colors.white,
                      padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
                      child: Column(
                        children: [
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(
                              children: [
                                ...[
                                  {'key': 'all', 'label': 'Todas las escalas'},
                                  {'key': 'direct', 'label': 'Directo'},
                                  {'key': 'stops', 'label': 'Con escalas'},
                                ].map((f) {
                                  final sel = _stopsFilter == f['key'];
                                  return Padding(
                                    padding: const EdgeInsets.only(right: 6),
                                    child: ChoiceChip(
                                      label: Text(f['label']!, style: TextStyle(fontSize: 12, color: sel ? Colors.white : BookingColors.textDark)),
                                      selected: sel,
                                      selectedColor: BookingColors.actionBlue,
                                      onSelected: (_) => setState(() => _stopsFilter = f['key']!),
                                    ),
                                  );
                                }),
                              ],
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Expanded(
                                child: DropdownButtonHideUnderline(
                                  child: DropdownButton<String>(
                                    value: _sortBy,
                                    isExpanded: true,
                                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: BookingColors.textDark),
                                    items: const [
                                      DropdownMenuItem(value: 'price', child: Text('Ordenar: Más barato')),
                                      DropdownMenuItem(value: 'duration', child: Text('Más rápido (duración)')),
                                      DropdownMenuItem(value: 'departure', child: Text('Salida más temprana')),
                                    ],
                                    onChanged: (v) {
                                      if (v != null) setState(() => _sortBy = v);
                                    },
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              DropdownButtonHideUnderline(
                                child: DropdownButton<String>(
                                  value: _airlineFilter,
                                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: BookingColors.actionBlue),
                                  items: [
                                    const DropdownMenuItem(value: 'ALL', child: Text('Todas aerolíneas')),
                                    ..._availableAirlines.map((a) => DropdownMenuItem(value: a, child: Text(a))),
                                  ],
                                  onChanged: (v) {
                                    if (v != null) setState(() => _airlineFilter = v);
                                  },
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    // Resumen fuentes conectadas
                    Container(
                      width: double.infinity,
                      color: const Color(0xFFF0F4F8),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '${groups.length} ${groups.length == 1 ? "vuelo encontrado" : "vuelos encontrados"}',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: BookingColors.textDark),
                          ),
                          if (_sources.isNotEmpty)
                            Text(
                              '$okSources/${_sources.length} aerolíneas activas${_bookingFeePct > 0 ? " · Fee ${_bookingFeePct.toStringAsFixed(0)}%" : ""}',
                              style: const TextStyle(fontSize: 11, color: BookingColors.successGreen, fontWeight: FontWeight.w600),
                            ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: groups.isEmpty
                          ? Center(
                              child: Padding(
                                padding: const EdgeInsets.all(24),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.airplanemode_inactive, size: 54, color: BookingColors.textMuted),
                                    const SizedBox(height: 12),
                                    const Text(
                                      'No encontramos vuelos para esta ruta/filtros.',
                                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                                      textAlign: TextAlign.center,
                                    ),
                                    const SizedBox(height: 10),
                                    ElevatedButton(
                                      onPressed: () {
                                        setState(() {
                                          _stopsFilter = 'all';
                                          _airlineFilter = 'ALL';
                                        });
                                      },
                                      child: const Text('Limpiar filtros'),
                                    ),
                                  ],
                                ),
                              ),
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.all(14),
                              itemCount: groups.length,
                              itemBuilder: (_, i) => _buildGroupCard(groups[i]),
                            ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildGroupCard(_FlightGroup group) {
    final rep = group.representative;
    final expanded = _expandedGroupKeys.contains(group.key);
    final fareCards = expanded ? _buildFareCards(group) : const <_FareCardItem>[];

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: expanded ? BookingColors.actionBlue : Colors.grey.shade200, width: expanded ? 1.5 : 1),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Cabecera Aerolínea + Vuelo
            Row(
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: BookingColors.primaryBlue,
                  child: Text(
                    rep.airlineCode.isNotEmpty ? rep.airlineCode : 'EQ',
                    style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        rep.airlineName,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: BookingColors.textDark),
                      ),
                      Text(
                        'Vuelo ${rep.numeroVuelo}${DestinosCatalog.esViajeInternacional(_origin, _destination) ? " · Internacional" : " · Nacional"}',
                        style: const TextStyle(fontSize: 11, color: BookingColors.textMuted),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE7F6EC),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    'Desde US\$ ${group.lowestPrice.toStringAsFixed(2)}',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: BookingColors.successGreen),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Tramos (Ida y opcional Vuelta)
            if (rep.itineraries.isNotEmpty)
              ...List.generate(rep.itineraries.length, (idx) {
                final it = rep.itineraries[idx];
                final firstSeg = it.segments.isNotEmpty ? it.segments.first : null;
                final lastSeg = it.segments.isNotEmpty ? it.segments.last : null;
                final depTime = firstSeg != null ? extraerHoraIso(firstSeg.departureAt) : rep.horaSalida;
                final arrTime = lastSeg != null ? extraerHoraIso(lastSeg.arrivalAt) : rep.horaLlegada;
                final orig = firstSeg?.originIata ?? rep.origen;
                final dest = lastSeg?.destinationIata ?? rep.destino;

                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (rep.itineraries.length > 1)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Text(
                              idx == 0 ? 'TRAMO DE IDA' : 'TRAMO DE REGRESO',
                              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                            ),
                          ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(depTime, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                                Text(orig, style: const TextStyle(fontSize: 12, color: BookingColors.textMuted)),
                              ],
                            ),
                            Expanded(
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 10),
                                child: Column(
                                  children: [
                                    Text(
                                      formatearDuracionMinutos(it.totalDurationMinutes),
                                      style: const TextStyle(fontSize: 11, color: BookingColors.textMuted),
                                    ),
                                    const Divider(height: 8, thickness: 1.5, color: BookingColors.actionBlue),
                                    Text(
                                      it.stopsCount == 0
                                          ? 'Directo'
                                          : '${it.stopsCount} ${it.stopsCount == 1 ? "escala" : "escalas"}',
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600,
                                        color: it.stopsCount == 0 ? BookingColors.successGreen : Colors.orange.shade800,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(arrTime, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                                Text(dest, style: const TextStyle(fontSize: 12, color: BookingColors.textMuted)),
                              ],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              })
            else
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('${rep.horaSalida} (${rep.origen})'),
                  Text(formatearDuracionMinutos(rep.duracionMinutos), style: const TextStyle(fontSize: 12, color: BookingColors.textMuted)),
                  Text('${rep.horaLlegada} (${rep.destino})'),
                ],
              ),

            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${_passengers.resumenTexto} · ${rep.availableSeats} asientos disp.',
                  style: const TextStyle(fontSize: 11, color: BookingColors.textMuted),
                ),
                ElevatedButton.icon(
                  onPressed: () {
                    setState(() {
                      if (expanded) {
                        _expandedGroupKeys.remove(group.key);
                      } else {
                        _expandedGroupKeys.add(group.key);
                      }
                    });
                  },
                  icon: Icon(expanded ? Icons.expand_less : Icons.expand_more, size: 18, color: Colors.white),
                  label: Text(
                    expanded ? 'Ocultar tarifas' : 'Ver tarifas (${group.offers.length})',
                    style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                  style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                ),
              ],
            ),

            // Familias Tarifarias (FareFamilies.jsx parity)
            if (expanded) ...[
              const Divider(height: 20),
              const Text(
                'Elige tu tarifa:',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: BookingColors.textDark),
              ),
              const SizedBox(height: 10),
              SizedBox(
                height: 258,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  itemCount: fareCards.length,
                  itemBuilder: (_, idx) {
                    final fc = fareCards[idx];
                    final opt = fc.option;
                    return Container(
                      width: 224,
                      margin: const EdgeInsets.only(right: 10),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF9FBFF),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: BookingColors.actionBlue.withValues(alpha: 0.35)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            opt.fareBrand,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                          ),
                          Text(
                            'Cabina ${opt.cabinLabelEs}',
                            style: const TextStyle(fontSize: 11, color: BookingColors.textMuted),
                          ),
                          const SizedBox(height: 8),
                          _fareRuleRow(
                            opt.personalItemIncluded ? Icons.check_circle : Icons.cancel_outlined,
                            'Artículo personal incluido',
                            opt.personalItemIncluded ? BookingColors.successGreen : BookingColors.textMuted,
                          ),
                          _fareRuleRow(
                            opt.carryOnIncluded > 0 ? Icons.luggage : Icons.cancel_outlined,
                            opt.carryOnIncluded > 0 ? '${opt.carryOnIncluded} equipaje de mano' : 'Sin equipaje de mano',
                            opt.carryOnIncluded > 0 ? BookingColors.successGreen : BookingColors.textMuted,
                          ),
                          _fareRuleRow(
                            opt.checkedBaggageIncluded > 0 ? Icons.work : Icons.close,
                            opt.checkedBaggageIncluded > 0
                                ? '${opt.checkedBaggageIncluded} maleta(s) en bodega'
                                : 'Equipaje en bodega con costo',
                            opt.checkedBaggageIncluded > 0 ? BookingColors.successGreen : Colors.orange.shade800,
                          ),
                          _fareRuleRow(
                            opt.isChangeable ? Icons.swap_horiz : Icons.block,
                            opt.isChangeable ? 'Permite cambios' : 'No permite cambios',
                            opt.isChangeable ? BookingColors.successGreen : BookingColors.textMuted,
                          ),
                          _fareRuleRow(
                            opt.isRefundable ? Icons.replay : Icons.money_off,
                            opt.isRefundable ? 'Reembolsable' : 'No reembolsable',
                            opt.isRefundable ? BookingColors.successGreen : BookingColors.textMuted,
                          ),
                          const Spacer(),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'US\$ ${fc.computedTotal.toStringAsFixed(2)}',
                                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: BookingColors.textDark),
                              ),
                              Text(
                                '${opt.availableSeats} disp.',
                                style: const TextStyle(fontSize: 10, color: BookingColors.textMuted),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => VueloDetailScreen(
                                      oferta: fc.offer,
                                      tarifaSeleccionada: fc.option,
                                      pasajeros: _passengers,
                                      ofertasGrupo: group.offers,
                                    ),
                                  ),
                                );
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: BookingColors.actionBlue,
                                padding: const EdgeInsets.symmetric(vertical: 8),
                              ),
                              child: const Text(
                                'Seleccionar',
                                style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _fareRuleRow(IconData icon, String label, Color color) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              label,
              style: TextStyle(fontSize: 11, color: color == BookingColors.textMuted ? BookingColors.textMuted : BookingColors.textDark),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
