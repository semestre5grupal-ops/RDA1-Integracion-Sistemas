import 'package:flutter/material.dart';
import '../../models/atraccion.dart';
import '../../services/booking_services.dart';
import '../../theme/booking_colors.dart';
import '../../widgets/booking_rating_badge.dart';
import '../../widgets/booking_search_loading_view.dart';
import '../detalle/atraccion_detail_screen.dart';

class AtraccionesSearchScreen extends StatefulWidget {
  final String initialQuery;
  final DateTime initialDate;

  const AtraccionesSearchScreen({
    super.key,
    required this.initialQuery,
    required this.initialDate,
  });

  @override
  State<AtraccionesSearchScreen> createState() => _AtraccionesSearchScreenState();
}

class _AtraccionesSearchScreenState extends State<AtraccionesSearchScreen> {
  late TextEditingController _searchCtrl;
  List<Atraccion> _atracciones = [];
  bool _loading = true;
  String? _error;

  // Filtros RDA2 de AtraccionesSearchPage.jsx
  bool _filtroComida = false;
  bool _filtroTransporte = false;
  bool _filtroGuia = false;
  String _criterioOrden = 'favoritos'; // 'favoritos' | 'precio_bajo' | 'mejores_comentarios'

  @override
  void initState() {
    super.initState();
    _searchCtrl = TextEditingController(text: widget.initialQuery);
    _fetchData();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchData() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await BookingServices.getAtracciones(page: 1, limit: 100);
      if (mounted) {
        setState(() {
          _atracciones = list;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Error al cargar atracciones.';
          _loading = false;
        });
      }
    }
  }

  List<Atraccion> get _filteredAndSorted {
    final q = _searchCtrl.text.trim().toLowerCase();
    var list = _atracciones.where((a) {
      if (q.isNotEmpty) {
        final match = a.nombre.toLowerCase().contains(q) ||
            a.ciudad.toLowerCase().contains(q) ||
            a.descripcion.toLowerCase().contains(q) ||
            a.longDescription.toLowerCase().contains(q) ||
            a.includes.join(' ').toLowerCase().contains(q);
        if (!match) return false;
      }

      final incStr = a.includes.join(' ').toLowerCase();
      final descStr = a.longDescription.toLowerCase();

      if (_filtroComida &&
          !(incStr.contains('comida') || incStr.contains('degust') || incStr.contains('alimento') || descStr.contains('cacao') || descStr.contains('degustación'))) {
        return false;
      }
      if (_filtroTransporte && !(incStr.contains('transporte') || descStr.contains('transporte'))) {
        return false;
      }
      if (_filtroGuia && !(incStr.contains('guía') || incStr.contains('guia') || a.idiomas.isNotEmpty)) {
        return false;
      }
      return true;
    }).toList();

    if (_criterioOrden == 'precio_bajo') {
      list.sort((a, b) => a.precioAdulto.compareTo(b.precioAdulto));
    } else if (_criterioOrden == 'mejores_comentarios') {
      list.sort((a, b) => b.rating.compareTo(a.rating));
    } else {
      list.sort((a, b) {
        final cmp = b.rating.compareTo(a.rating);
        return cmp != 0 ? cmp : b.reviewsCount.compareTo(a.reviewsCount);
      });
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final items = _filteredAndSorted;

    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Container(
          height: 40,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: BookingColors.accentYellow, width: 2),
          ),
          child: TextField(
            controller: _searchCtrl,
            textInputAction: TextInputAction.search,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              hintText: 'Buscar por atracción o ciudad...',
              prefixIcon: Icon(Icons.search, size: 18, color: BookingColors.primaryBlue),
              border: InputBorder.none,
              contentPadding: EdgeInsets.symmetric(vertical: 8),
            ),
          ),
        ),
      ),
      body: _loading
          ? BookingSearchLoadingView(
              destino: _searchCtrl.text.isNotEmpty ? _searchCtrl.text : 'Ecuador',
              titulo: 'Buscando ofertas y experiencias en tiempo real...',
            )
          : _error != null
              ? Center(child: Text(_error!))
              : Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1140),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Tabs de ordenamiento y filtros de inclusión RDA2
                        Container(
                          color: Colors.white,
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: Row(
                                  children: [
                                    _sortTab('favoritos', 'Nuestros favoritos'),
                                    const SizedBox(width: 8),
                                    _sortTab('precio_bajo', 'Precio más bajo'),
                                    const SizedBox(width: 8),
                                    _sortTab('mejores_comentarios', 'Mejores comentarios'),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 10),
                              const Text(
                                'Inclusiones del Servicio:',
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF047857)),
                              ),
                              const SizedBox(height: 6),
                              Wrap(
                                spacing: 8,
                                runSpacing: 6,
                                children: [
                                  FilterChip(
                                    label: const Text('🍴 Alimentos / Degustación', style: TextStyle(fontSize: 12)),
                                    selected: _filtroComida,
                                    selectedColor: const Color(0xFFD1FAE5),
                                    onSelected: (v) => setState(() => _filtroComida = v),
                                  ),
                                  FilterChip(
                                    label: const Text('🚌 Transporte / Recogida', style: TextStyle(fontSize: 12)),
                                    selected: _filtroTransporte,
                                    selectedColor: const Color(0xFFD1FAE5),
                                    onSelected: (v) => setState(() => _filtroTransporte = v),
                                  ),
                                  FilterChip(
                                    label: const Text('🧭 Guía Oficial', style: TextStyle(fontSize: 12)),
                                    selected: _filtroGuia,
                                    selectedColor: const Color(0xFFD1FAE5),
                                    onSelected: (v) => setState(() => _filtroGuia = v),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
                          child: Text(
                            'Atracciones (${items.length} disponibles)',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                          ),
                        ),
                        Expanded(
                          child: items.isEmpty
                              ? const Center(
                                  child: Text('No se encontraron atracciones para tu búsqueda.', style: TextStyle(color: BookingColors.textMuted)),
                                )
                              : ListView.builder(
                                  padding: const EdgeInsets.all(14),
                                  itemCount: items.length,
                                  itemBuilder: (context, idx) => _buildResultCard(items[idx]),
                                ),
                        ),
                      ],
                    ),
                  ),
                ),
    );
  }

  Widget _sortTab(String id, String label) {
    final active = _criterioOrden == id;
    return ChoiceChip(
      label: Text(label),
      selected: active,
      selectedColor: BookingColors.primaryBlue,
      labelStyle: TextStyle(color: active ? Colors.white : BookingColors.textDark, fontSize: 12, fontWeight: FontWeight.w600),
      onSelected: (_) => setState(() => _criterioOrden = id),
    );
  }

  Widget _buildResultCard(Atraccion a) {
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      elevation: 2,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: const BorderSide(color: BookingColors.borderLight)),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => AtraccionDetailScreen(atraccion: a, initialDate: widget.initialDate)),
          );
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Image.network(
                a.imagenUrl ?? '',
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(color: Colors.grey.shade200, child: const Icon(Icons.landscape, size: 42)),
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
                      Expanded(
                        child: Text(a.nombre, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
                      ),
                      const SizedBox(width: 8),
                      BookingRatingBadge(rating: a.rating, reviewsCount: a.reviewsCount),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    a.longDescription,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13, color: BookingColors.textMuted),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 12,
                    runSpacing: 4,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.schedule, size: 14, color: BookingColors.primaryBlue),
                          const SizedBox(width: 4),
                          Text('Duración: ${a.duracion}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
                        ],
                      ),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.location_on_outlined, size: 14, color: BookingColors.primaryBlue),
                          const SizedBox(width: 4),
                          Text(a.ciudad, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
                        ],
                      ),
                    ],
                  ),
                  if (a.freeCancellation) ...[
                    const SizedBox(height: 6),
                    const Text('📅 Cancelación gratis disponible', style: TextStyle(fontSize: 12, color: BookingColors.successGreen, fontWeight: FontWeight.bold)),
                  ],
                  const Divider(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Desde', style: TextStyle(fontSize: 11, color: BookingColors.textMuted)),
                          Text(
                            'US\$ ${a.precioAdulto.toStringAsFixed(2)}',
                            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                          ),
                          if (a.admiteNinos && a.precioNino != null)
                            Text('Niños: US\$ ${a.precioNino!.toStringAsFixed(2)}', style: const TextStyle(fontSize: 11, color: BookingColors.successGreen)),
                        ],
                      ),
                      ElevatedButton(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => AtraccionDetailScreen(atraccion: a, initialDate: widget.initialDate)),
                          );
                        },
                        style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                        child: const Text('Más info y turnos >', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
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
}

