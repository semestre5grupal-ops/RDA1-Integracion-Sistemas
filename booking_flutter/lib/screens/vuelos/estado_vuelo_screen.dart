import 'package:flutter/material.dart';
import '../../services/booking_services.dart';
import '../../models/vuelo.dart';

class EstadoVueloScreen extends StatefulWidget {
  const EstadoVueloScreen({super.key});

  @override
  State<EstadoVueloScreen> createState() => _EstadoVueloScreenState();
}

class _EstadoVueloScreenState extends State<EstadoVueloScreen> {
  final TextEditingController _searchController = TextEditingController();
  List<Vuelo> _vuelos = [];
  List<Vuelo> _filteredVuelos = [];
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _fetchVuelos();
  }

  Future<void> _fetchVuelos() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final data = await BookingServices.getVuelos();
      setState(() {
        _vuelos = data;
        _filteredVuelos = data;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'No se pudo cargar el estado de vuelos. Reintente más tarde.';
        _isLoading = false;
      });
    }
  }

  void _onSearch(String query) {
    if (query.isEmpty) {
      setState(() {
        _filteredVuelos = _vuelos;
      });
      return;
    }

    final lower = query.toLowerCase();
    setState(() {
      _filteredVuelos = _vuelos.where((v) {
        return v.numeroVuelo.toLowerCase().contains(lower) ||
            v.aerolinea.toLowerCase().contains(lower) ||
            v.origen.toLowerCase().contains(lower) ||
            v.destino.toLowerCase().contains(lower);
      }).toList();
    });
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'a tiempo':
      case 'en hora':
      case 'programado':
        return Colors.green[700]!;
      case 'en vuelo':
        return const Color(0xFF003580);
      case 'demorado':
        return Colors.orange[800]!;
      case 'cancelado':
        return Colors.red[700]!;
      default:
        return Colors.grey[700]!;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Rastreador de Vuelos'),
        backgroundColor: const Color(0xFF003580),
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          Container(
            color: const Color(0xFF003580),
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: TextField(
              controller: _searchController,
              onChanged: _onSearch,
              style: const TextStyle(color: Colors.black87),
              decoration: InputDecoration(
                hintText: 'Buscar por código (ej. EQ-301) o destino...',
                prefixIcon: const Icon(Icons.search, color: Color(0xFF003580)),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, color: Colors.grey),
                        onPressed: () {
                          _searchController.clear();
                          _onSearch('');
                        },
                      )
                    : null,
                filled: true,
                fillColor: Colors.white,
                contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 16),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(30),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _errorMessage != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.cloud_off, size: 64, color: Colors.grey),
                              const SizedBox(height: 16),
                              Text(_errorMessage!, textAlign: TextAlign.center),
                              const SizedBox(height: 16),
                              ElevatedButton(
                                onPressed: _fetchVuelos,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF003580),
                                  foregroundColor: Colors.white,
                                ),
                                child: const Text('Reintentar'),
                              ),
                            ],
                          ),
                        ),
                      )
                    : _filteredVuelos.isEmpty
                        ? const Center(
                            child: Text(
                              'No se encontraron vuelos para este criterio.',
                              style: TextStyle(color: Colors.grey, fontSize: 16),
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: _fetchVuelos,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(12),
                              itemCount: _filteredVuelos.length,
                              itemBuilder: (context, index) {
                                final vuelo = _filteredVuelos[index];
                                final status = vuelo.estado;
                                final statusColor = _getStatusColor(status);

                                return Card(
                                  margin: const EdgeInsets.only(bottom: 12),
                                  elevation: 2,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Padding(
                                    padding: const EdgeInsets.all(16),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                          children: [
                                            Row(
                                              children: [
                                                const Icon(Icons.flight, color: Color(0xFF003580), size: 20),
                                                const SizedBox(width: 8),
                                                Text(
                                                  vuelo.numeroVuelo,
                                                  style: const TextStyle(
                                                    fontWeight: FontWeight.bold,
                                                    fontSize: 16,
                                                  ),
                                                ),
                                                const SizedBox(width: 8),
                                                Text(
                                                  '• ${vuelo.aerolinea}',
                                                  style: TextStyle(
                                                    color: Colors.grey[600],
                                                    fontSize: 14,
                                                  ),
                                                ),
                                              ],
                                            ),
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                              decoration: BoxDecoration(
                                                color: statusColor.withOpacity(0.15),
                                                borderRadius: BorderRadius.circular(12),
                                                border: Border.all(color: statusColor.withOpacity(0.5)),
                                              ),
                                              child: Text(
                                                status.toUpperCase(),
                                                style: TextStyle(
                                                  color: statusColor,
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.bold,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                        const Divider(height: 24),
                                        Row(
                                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                          children: [
                                            Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  vuelo.origen,
                                                  style: const TextStyle(
                                                    fontSize: 18,
                                                    fontWeight: FontWeight.bold,
                                                  ),
                                                ),
                                                Text(
                                                  vuelo.horaSalida,
                                                  style: TextStyle(
                                                    color: Colors.grey[700],
                                                    fontSize: 13,
                                                  ),
                                                ),
                                              ],
                                            ),
                                            const Icon(Icons.arrow_forward, color: Colors.grey),
                                            Column(
                                              crossAxisAlignment: CrossAxisAlignment.end,
                                              children: [
                                                Text(
                                                  vuelo.destino,
                                                  style: const TextStyle(
                                                    fontSize: 18,
                                                    fontWeight: FontWeight.bold,
                                                  ),
                                                ),
                                                Text(
                                                  vuelo.horaLlegada,
                                                  style: TextStyle(
                                                    color: Colors.grey[700],
                                                    fontSize: 13,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 12),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                          decoration: BoxDecoration(
                                            color: Colors.grey[100],
                                            borderRadius: BorderRadius.circular(8),
                                          ),
                                          child: Row(
                                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                            children: [
                                              Text(
                                                'Fecha: ${vuelo.fecha}',
                                                style: TextStyle(fontSize: 12, color: Colors.grey[800]),
                                              ),
                                              Text(
                                                'Puerta: ${vuelo.puertaEmbarque ?? "TBD"}',
                                                style: TextStyle(
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.bold,
                                                  color: Colors.grey[800],
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

