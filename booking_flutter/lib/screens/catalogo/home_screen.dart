import 'package:flutter/material.dart';
import '../../services/booking_services.dart';
import '../../models/atraccion.dart';
import '../../models/auto.dart';
import '../../models/alojamiento.dart';
import '../../models/vuelo.dart';
import '../detalle/atraccion_detail_screen.dart';
import '../detalle/auto_detail_screen.dart';
import '../detalle/alojamiento_detail_screen.dart';
import '../detalle/vuelo_detail_screen.dart';
import '../vuelos/estado_vuelo_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.travel_explore, color: Colors.white),
            SizedBox(width: 8),
            Text(
              'Booking Central',
              style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF003580),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.flight_takeoff, color: Colors.white),
            tooltip: 'Rastreador de Vuelos',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const EstadoVueloScreen()),
              );
            },
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: const Color(0xFFFEBB02), // Amarillo Booking
          indicatorWeight: 4,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: const [
            Tab(icon: Icon(Icons.attractions), text: 'Tours'),
            Tab(icon: Icon(Icons.directions_car), text: 'Autos'),
            Tab(icon: Icon(Icons.hotel), text: 'Hoteles'),
            Tab(icon: Icon(Icons.flight), text: 'Vuelos'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [
          _AtraccionesView(),
          _AutosView(),
          _AlojamientosView(),
          _VuelosView(),
        ],
      ),
    );
  }
}

// --- VISTA TOURS / ATRACCIONES ---
class _AtraccionesView extends StatelessWidget {
  const _AtraccionesView();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Atraccion>>(
      future: BookingServices.getAtracciones(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        final list = snapshot.data ?? [];
        if (list.isEmpty) {
          return const Center(child: Text('No hay atracciones disponibles en este momento.'));
        }
        return ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: list.length,
          itemBuilder: (context, i) {
            final a = list[i];
            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              clipBehavior: Clip.antiAlias,
              elevation: 2,
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
                    if (a.imagenUrl != null && a.imagenUrl!.isNotEmpty)
                      Image.network(
                        a.imagenUrl!,
                        height: 160,
                        width: double.infinity,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(
                          height: 120,
                          color: Colors.blueGrey.shade100,
                          child: const Icon(Icons.image_not_supported, size: 40, color: Colors.grey),
                        ),
                      ),
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Chip(
                                label: Text(a.proveedor, style: const TextStyle(fontSize: 11, color: Colors.white)),
                                backgroundColor: const Color(0xFF003580),
                                padding: EdgeInsets.zero,
                              ),
                              Row(
                                children: [
                                  const Icon(Icons.star, color: Color(0xFFFEBB02), size: 18),
                                  const SizedBox(width: 4),
                                  Text('${a.rating}', style: const TextStyle(fontWeight: FontWeight.bold)),
                                ],
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(a.nombre, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                          Text(a.ciudad, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                          const SizedBox(height: 8),
                          Text(
                            '\$${a.precio.toStringAsFixed(2)}',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF003580)),
                          ),
                        ],
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
}

// --- VISTA AUTOS ---
class _AutosView extends StatelessWidget {
  const _AutosView();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Auto>>(
      future: BookingServices.getAutos(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        final list = snapshot.data ?? [];
        if (list.isEmpty) {
          return const Center(child: Text('No hay vehículos disponibles.'));
        }
        return ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: list.length,
          itemBuilder: (context, i) {
            final auto = list[i];
            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: const Color(0xFF003580).withOpacity(0.1),
                  child: const Icon(Icons.directions_car, color: Color(0xFF003580)),
                ),
                title: Text('${auto.marca} ${auto.modelo}', style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text('${auto.categoria} · ${auto.transmision} · ${auto.proveedor}'),
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('\$${auto.precioPorDia.toStringAsFixed(2)}/día', style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF003580))),
                    if (auto.enCooldown)
                      const Text('Cooldown 2h', style: TextStyle(color: Colors.orange, fontSize: 11, fontWeight: FontWeight.bold)),
                  ],
                ),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => AutoDetailScreen(auto: auto)),
                  );
                },
              ),
            );
          },
        );
      },
    );
  }
}

// --- VISTA ALOJAMIENTOS ---
class _AlojamientosView extends StatelessWidget {
  const _AlojamientosView();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Alojamiento>>(
      future: BookingServices.getAlojamientos(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        final list = snapshot.data ?? [];
        if (list.isEmpty) {
          return const Center(child: Text('No hay alojamientos disponibles.'));
        }
        return ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: list.length,
          itemBuilder: (context, i) {
            final h = list[i];
            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: ListTile(
                leading: const Icon(Icons.hotel, color: Color(0xFF003580), size: 36),
                title: Text(h.nombre, style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text('${h.ciudad} · ★ ${h.rating}'),
                trailing: Text('\$${h.precioPorNoche.toStringAsFixed(2)}/noche', style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF003580))),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => AlojamientoDetailScreen(alojamiento: h)),
                  );
                },
              ),
            );
          },
        );
      },
    );
  }
}

// --- VISTA VUELOS ---
class _VuelosView extends StatelessWidget {
  const _VuelosView();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Vuelo>>(
      future: BookingServices.getVuelos(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        final list = snapshot.data ?? [];
        if (list.isEmpty) {
          return const Center(child: Text('No hay vuelos programados.'));
        }
        return ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: list.length,
          itemBuilder: (context, i) {
            final v = list[i];
            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: ListTile(
                leading: const Icon(Icons.flight, color: Color(0xFF003580), size: 36),
                title: Text('${v.origen} ➔ ${v.destino}', style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text('${v.aerolinea} (${v.numeroVuelo})\nSalida: ${v.horaSalida} | Llegada: ${v.horaLlegada}'),
                isThreeLine: true,
                trailing: Text('\$${v.precio.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF003580), fontSize: 16)),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => VueloDetailScreen(vuelo: v)),
                  );
                },
              ),
            );
          },
        );
      },
    );
  }
}

