import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../services/api_client.dart';
import '../../services/booking_services.dart';
import '../../theme/booking_colors.dart';

class EstadoVueloScreen extends StatefulWidget {
  const EstadoVueloScreen({super.key});

  @override
  State<EstadoVueloScreen> createState() => _EstadoVueloScreenState();
}

class _EstadoVueloScreenState extends State<EstadoVueloScreen> {
  final TextEditingController _flightCtrl = TextEditingController(text: 'EQ-301');
  DateTime _selectedDate = DateTime.now().add(const Duration(days: 1));
  bool _loading = false;
  String? _errorMsg;
  Map<String, dynamic>? _flightData;

  @override
  void dispose() {
    _flightCtrl.dispose();
    super.dispose();
  }

  Future<void> _consultarEstado([String? overrideCode]) async {
    final code = (overrideCode ?? _flightCtrl.text).trim().toUpperCase();
    if (overrideCode != null) _flightCtrl.text = code;
    if (code.length < 3) {
      setState(() => _errorMsg = 'Ingresa un número de vuelo válido (ej. EQ-301 o LA1402).');
      return;
    }

    setState(() {
      _loading = true;
      _errorMsg = null;
      _flightData = null;
    });

    try {
      final dateStr = DateFormat('yyyy-MM-dd').format(_selectedDate);
      final data = await BookingServices.consultarEstadoVuelo(code, dateStr);
      if (mounted) {
        setState(() {
          _flightData = data;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMsg = e is ApiException
              ? e.userMessage
              : 'No se encontró información de vuelo para esa fecha o código.';
          _loading = false;
        });
      }
    }
  }

  Color _statusColor(String status) {
    final u = status.toUpperCase();
    if (u.contains('CANCEL') || u.contains('DIVERT')) return BookingColors.errorRed;
    if (u.contains('DELAY')) return Colors.orange.shade800;
    if (u.contains('BOARD')) return BookingColors.actionBlue;
    return BookingColors.successGreen;
  }

  @override
  Widget build(BuildContext context) {
    final payload = (_flightData != null && _flightData!['data'] is Map)
        ? Map<String, dynamic>.from(_flightData!['data'])
        : _flightData;

    final dep = payload?['departure'] is Map ? Map<String, dynamic>.from(payload!['departure']) : <String, dynamic>{};
    final arr = payload?['arrival'] is Map ? Map<String, dynamic>.from(payload!['arrival']) : <String, dynamic>{};
    final status = (payload?['status'] ?? payload?['estado'] ?? 'SCHEDULED').toString().toUpperCase();

    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text('Estado de Vuelo en Vivo', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 17)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Consulta por número de vuelo', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _flightCtrl,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        labelText: 'Código de vuelo',
                        hintText: 'Ej. EQ-301, LA1402, AV7380',
                        prefixIcon: Icon(Icons.flight),
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      children: ['EQ-301', 'LA1402', 'AV7380'].map((preset) {
                        return ActionChip(
                          label: Text(preset, style: const TextStyle(fontSize: 11)),
                          onPressed: () => _consultarEstado(preset),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(minimumSize: const Size(double.infinity, 44)),
                      icon: const Icon(Icons.calendar_today, size: 16),
                      label: Text('Fecha de salida: ${DateFormat('EEE, dd MMM yyyy').format(_selectedDate)}'),
                      onPressed: () async {
                        final p = await showDatePicker(
                          context: context,
                          initialDate: _selectedDate,
                          firstDate: DateTime.now().subtract(const Duration(days: 7)),
                          lastDate: DateTime.now().add(const Duration(days: 180)),
                        );
                        if (p != null) setState(() => _selectedDate = p);
                      },
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton.icon(
                        onPressed: _loading ? null : () => _consultarEstado(),
                        icon: const Icon(Icons.search, color: Colors.white),
                        label: const Text('Consultar estado', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                        style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            if (_loading)
              const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
            else if (_errorMsg != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFFCE8E8),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: BookingColors.errorRed),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline, color: BookingColors.errorRed),
                    const SizedBox(width: 10),
                    Expanded(child: Text(_errorMsg!, style: const TextStyle(color: BookingColors.errorRed, fontSize: 13))),
                  ],
                ),
              )
            else if (payload != null)
              Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            payload['flightNumber']?.toString() ?? _flightCtrl.text.trim(),
                            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: _statusColor(status).withValues(alpha: 0.14),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              status,
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: _statusColor(status)),
                            ),
                          ),
                        ],
                      ),
                      if (payload['airline'] != null)
                        Text(payload['airline'].toString(), style: const TextStyle(fontSize: 13, color: BookingColors.textMuted)),
                      const Divider(height: 22),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(dep['iataCode']?.toString() ?? payload['origin']?.toString() ?? 'ORIGEN', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                              Text('Salida: ${dep['scheduledAt'] ?? dep['at'] ?? payload['departureTime'] ?? '--:--'}', style: const TextStyle(fontSize: 12)),
                              Text('Terminal: ${dep['terminal'] ?? 'T1'} · Puerta: ${dep['gate'] ?? payload['gate'] ?? 'Por asignar'}', style: const TextStyle(fontSize: 11, color: BookingColors.actionBlue)),
                            ],
                          ),
                          const Icon(Icons.flight_takeoff, size: 28, color: BookingColors.actionBlue),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(arr['iataCode']?.toString() ?? payload['destination']?.toString() ?? 'DESTINO', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                              Text('Llegada: ${arr['scheduledAt'] ?? arr['at'] ?? payload['arrivalTime'] ?? '--:--'}', style: const TextStyle(fontSize: 12)),
                              Text('Terminal: ${arr['terminal'] ?? 'T1'}', style: const TextStyle(fontSize: 11, color: BookingColors.textMuted)),
                            ],
                          ),
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
}
