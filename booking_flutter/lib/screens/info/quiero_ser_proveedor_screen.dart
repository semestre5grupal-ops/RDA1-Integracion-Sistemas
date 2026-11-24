import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../services/booking_services.dart';
import '../../theme/booking_colors.dart';

class QuieroSerProveedorScreen extends StatefulWidget {
  const QuieroSerProveedorScreen({super.key});

  @override
  State<QuieroSerProveedorScreen> createState() => _QuieroSerProveedorScreenState();
}

class _QuieroSerProveedorScreenState extends State<QuieroSerProveedorScreen> {
  static const _tipos = [
    {'id': 'hospedaje', 'icon': Icons.hotel, 'label': 'Hospedaje', 'sub': 'Hotel, hostal, cabaña'},
    {'id': 'vuelos', 'icon': Icons.flight, 'label': 'Vuelos', 'sub': 'Aerolínea'},
    {'id': 'autos', 'icon': Icons.directions_car, 'label': 'Autos', 'sub': 'Rentadora de vehículos'},
    {'id': 'atracciones', 'icon': Icons.attractions, 'label': 'Atracciones', 'sub': 'Tours, parques, museos'},
  ];

  final _empresaCtrl = TextEditingController();
  final _rucCtrl = TextEditingController();
  final _contactoCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _telCtrl = TextEditingController();
  final _ciudadCtrl = TextEditingController();
  final _webCtrl = TextEditingController();
  final _descCtrl = TextEditingController();

  String _tipo = '';
  bool _enviando = false;
  String? _errorGeneral;
  Map<String, dynamic>? _resultado;

  @override
  void dispose() {
    _empresaCtrl.dispose();
    _rucCtrl.dispose();
    _contactoCtrl.dispose();
    _emailCtrl.dispose();
    _telCtrl.dispose();
    _ciudadCtrl.dispose();
    _webCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    setState(() => _errorGeneral = null);
    final rucClean = _rucCtrl.text.replaceAll(RegExp(r'\s+'), '');

    if (_empresaCtrl.text.trim().length < 3) {
      setState(() => _errorGeneral = 'Escribe el nombre de tu empresa (mínimo 3 caracteres).');
      return;
    }
    if (!RegExp(r'^\d{13}$').hasMatch(rucClean)) {
      setState(() => _errorGeneral = 'El RUC debe tener exactamente 13 dígitos.');
      return;
    }
    if (_tipo.isEmpty) {
      setState(() => _errorGeneral = 'Elige qué tipo de servicio ofreces.');
      return;
    }
    if (_contactoCtrl.text.trim().length < 3) {
      setState(() => _errorGeneral = 'Escribe el nombre de la persona de contacto.');
      return;
    }
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(_emailCtrl.text.trim())) {
      setState(() => _errorGeneral = 'Escribe un correo electrónico válido.');
      return;
    }
    if (!RegExp(r'^\+?[\d\s-]{7,20}$').hasMatch(_telCtrl.text.trim())) {
      setState(() => _errorGeneral = 'Escribe un teléfono válido (solo números).');
      return;
    }

    setState(() => _enviando = true);
    try {
      final data = await BookingServices.enviarSolicitudProveedor({
        'empresa': _empresaCtrl.text.trim(),
        'ruc': rucClean,
        'tipo': _tipo,
        'contactoNombre': _contactoCtrl.text.trim(),
        'email': _emailCtrl.text.trim(),
        'telefono': _telCtrl.text.trim(),
        'ciudad': _ciudadCtrl.text.trim(),
        'sitioWeb': _webCtrl.text.trim(),
        'descripcion': _descCtrl.text.trim(),
      });
      if (mounted) {
        setState(() {
          _resultado = data;
          _enviando = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _enviando = false;
          _errorGeneral = e is ApiException ? e.userMessage : 'No se pudo enviar la solicitud.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text('Registra tu negocio o propiedad', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 17)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: _resultado != null
                ? Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    child: Padding(
                      padding: const EdgeInsets.all(28),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.check_circle, size: 54, color: BookingColors.successGreen),
                          const SizedBox(height: 10),
                          const Text('¡Solicitud enviada!', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue)),
                          const SizedBox(height: 8),
                          Text(_resultado!['mensaje']?.toString() ?? 'Nuestro equipo revisará tu postulación comercial.', textAlign: TextAlign.center),
                          const SizedBox(height: 18),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                            decoration: BoxDecoration(color: const Color(0xFFEBF3FF), borderRadius: BorderRadius.circular(8)),
                            child: Column(
                              children: [
                                const Text('CÓDIGO DE SOLICITUD', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: BookingColors.textMuted)),
                                const SizedBox(height: 4),
                                Text(_resultado!['codigo']?.toString() ?? 'SOL-2026', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue)),
                                const SizedBox(height: 4),
                                const Text('Estado: Pendiente de revisión', style: TextStyle(fontSize: 12, color: BookingColors.textMuted)),
                              ],
                            ),
                          ),
                          const SizedBox(height: 20),
                          ElevatedButton(
                            onPressed: () => Navigator.pop(context),
                            style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                            child: const Text('Volver al inicio', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ),
                    ),
                  )
                : Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Conviértete en socio proveedor en Booking', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue)),
                          const SizedBox(height: 4),
                          const Text('Conecta tu hotel, aerolínea, rentadora o tour operador con viajeros de todo Ecuador.', style: TextStyle(fontSize: 13, color: BookingColors.textMuted)),
                          const Divider(height: 24),
                          if (_errorGeneral != null)
                            Container(
                              width: double.infinity,
                              margin: const EdgeInsets.only(bottom: 14),
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(8)),
                              child: Text(_errorGeneral!, style: const TextStyle(color: BookingColors.errorRed, fontSize: 12.5)),
                            ),

                          const Text('Tipo de servicio*', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                          const SizedBox(height: 8),
                          GridView.count(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            crossAxisCount: 2,
                            crossAxisSpacing: 8,
                            mainAxisSpacing: 8,
                            childAspectRatio: 2.6,
                            children: _tipos.map((t) {
                              final sel = _tipo == t['id'];
                              return InkWell(
                                onTap: () => setState(() => _tipo = t['id'] as String),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                  decoration: BoxDecoration(
                                    color: sel ? const Color(0xFFEBF3FF) : Colors.white,
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: sel ? BookingColors.actionBlue : Colors.grey.shade300, width: sel ? 2 : 1),
                                  ),
                                  child: Row(
                                    children: [
                                      Icon(t['icon'] as IconData, color: BookingColors.actionBlue, size: 22),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Column(
                                          mainAxisAlignment: MainAxisAlignment.center,
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(t['label'] as String, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12.5)),
                                            Text(t['sub'] as String, style: const TextStyle(fontSize: 10, color: BookingColors.textMuted), overflow: TextOverflow.ellipsis),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 14),
                          TextField(controller: _empresaCtrl, decoration: const InputDecoration(labelText: 'Razón social / Nombre de empresa*', border: OutlineInputBorder())),
                          const SizedBox(height: 10),
                          TextField(controller: _rucCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'RUC (13 dígitos)*', border: OutlineInputBorder())),
                          const SizedBox(height: 10),
                          TextField(controller: _contactoCtrl, decoration: const InputDecoration(labelText: 'Persona de contacto*', border: OutlineInputBorder())),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(child: TextField(controller: _emailCtrl, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Correo corporativo*', border: OutlineInputBorder()))),
                              const SizedBox(width: 10),
                              Expanded(child: TextField(controller: _telCtrl, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Teléfono*', border: OutlineInputBorder()))),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(child: TextField(controller: _ciudadCtrl, decoration: const InputDecoration(labelText: 'Ciudad (opcional)', border: OutlineInputBorder()))),
                              const SizedBox(width: 10),
                              Expanded(child: TextField(controller: _webCtrl, decoration: const InputDecoration(labelText: 'Sitio web (opcional)', border: OutlineInputBorder()))),
                            ],
                          ),
                          const SizedBox(height: 10),
                          TextField(controller: _descCtrl, maxLines: 3, decoration: const InputDecoration(labelText: 'Descripción de inventario (opcional)', border: OutlineInputBorder())),
                          const SizedBox(height: 18),
                          SizedBox(
                            width: double.infinity,
                            height: 48,
                            child: ElevatedButton(
                              onPressed: _enviando ? null : _enviar,
                              style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                              child: _enviando
                                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                                  : const Text('Enviar solicitud de afiliación', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

