import 'dart:async';
import 'package:flutter/material.dart';
import '../theme/booking_colors.dart';

class VuelosLoadingView extends StatefulWidget {
  const VuelosLoadingView({super.key});

  @override
  State<VuelosLoadingView> createState() => _VuelosLoadingViewState();
}

class _VuelosLoadingViewState extends State<VuelosLoadingView> {
  static const List<String> _aerolineas = [
    'EcoAirlines',
    'Vuelos EQ10',
    'GabatAIR',
    'Quinde Vuelos',
    'RAM Alliance',
  ];

  static const List<String> _etapas = [
    'Consultando a las aerolíneas socias…',
    'Revisando disponibilidad de asientos…',
    'Comparando precios y tarifas…',
    'Ordenando las mejores opciones para ti…',
  ];

  int _etapaIdx = 0;
  int _listas = 0;
  double _progreso = 0.08;
  Timer? _etapaTimer;
  Timer? _aeroTimer;
  Timer? _progTimer;

  @override
  void initState() {
    super.initState();
    _etapaTimer = Timer.periodic(const Duration(milliseconds: 900), (_) {
      if (mounted) setState(() => _etapaIdx = (_etapaIdx + 1) % _etapas.length);
    });
    _aeroTimer = Timer.periodic(const Duration(milliseconds: 450), (_) {
      if (mounted && _listas < _aerolineas.length) {
        setState(() => _listas++);
      }
    });
    _progTimer = Timer.periodic(const Duration(milliseconds: 200), (_) {
      if (mounted) {
        setState(() {
          _progreso = _progreso + (0.92 - _progreso) * 0.12;
          if (_progreso > 0.92) _progreso = 0.92;
        });
      }
    });
  }

  @override
  void dispose() {
    _etapaTimer?.cancel();
    _aeroTimer?.cancel();
    _progTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Ocupa todo el cuerpo con fondo blanco. Va alineada ARRIBA, no centrada:
    // en VuelosPage.jsx <VuelosCargando /> se pinta en la sección de resultados
    // (cabecera de progreso + tarjetas esqueleto), igual que la lista que reemplaza.
    return Container(
      width: double.infinity,
      height: double.infinity,
      color: Colors.white,
      alignment: Alignment.topCenter,
      child: _buildScroll(),
    );
  }

  Widget _buildScroll() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 820),
          child: Column(
            children: [
              // Cabecera de progreso y checklist de 5 aerolíneas socias (VuelosCargando.jsx parity)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFE6EAF0)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _etapas[_etapaIdx],
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF1A1A2E)),
                    ),
                    const SizedBox(height: 12),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(99),
                      child: LinearProgressIndicator(
                        value: _progreso,
                        minHeight: 6,
                        backgroundColor: const Color(0xFFEEF2F7),
                        valueColor: const AlwaysStoppedAnimation<Color>(BookingColors.actionBlue),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: List.generate(_aerolineas.length, (i) {
                        final done = i < _listas;
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: done ? const Color(0xFFE8F5EE) : Colors.white,
                            borderRadius: BorderRadius.circular(99),
                            border: Border.all(color: done ? const Color(0xFFB7E1C7) : const Color(0xFFE6EAF0)),
                          ),
                          child: Text(
                            '${done ? '✓' : '•'} ${_aerolineas[i]}',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: done ? FontWeight.w600 : FontWeight.normal,
                              color: done ? const Color(0xFF0D7A2F) : const Color(0xFF6B7280),
                            ),
                          ),
                        );
                      }),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              // 3 tarjetas esqueleto con la forma real de resultados de vuelos
              ...List.generate(3, (_) {
                return Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE6EAF0)),
                  ),
                  child: Row(
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(width: 44, height: 44, decoration: BoxDecoration(color: const Color(0xFFEEF2F7), borderRadius: BorderRadius.circular(10))),
                          const SizedBox(height: 8),
                          Container(width: 85, height: 12, decoration: BoxDecoration(color: const Color(0xFFEEF2F7), borderRadius: BorderRadius.circular(6))),
                        ],
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Row(
                          children: [
                            Container(width: 48, height: 22, decoration: BoxDecoration(color: const Color(0xFFEEF2F7), borderRadius: BorderRadius.circular(6))),
                            const SizedBox(width: 10),
                            Expanded(child: Container(height: 2, color: const Color(0xFFE6EAF0))),
                            const SizedBox(width: 10),
                            Container(width: 48, height: 22, decoration: BoxDecoration(color: const Color(0xFFEEF2F7), borderRadius: BorderRadius.circular(6))),
                          ],
                        ),
                      ),
                      const SizedBox(width: 16),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Container(width: 65, height: 20, decoration: BoxDecoration(color: const Color(0xFFEEF2F7), borderRadius: BorderRadius.circular(6))),
                          const SizedBox(height: 8),
                          Container(width: 95, height: 32, decoration: BoxDecoration(color: const Color(0xFFEEF2F7), borderRadius: BorderRadius.circular(8))),
                        ],
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }
}
