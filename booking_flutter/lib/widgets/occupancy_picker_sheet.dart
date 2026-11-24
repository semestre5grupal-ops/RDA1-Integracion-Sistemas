import 'package:flutter/material.dart';
import '../theme/booking_colors.dart';

class OccupancySelection {
  final int adultos;
  final List<int> edadesNinos;
  final int habitaciones;

  const OccupancySelection({
    this.adultos = 2,
    this.edadesNinos = const [],
    this.habitaciones = 1,
  });

  int get ninos => edadesNinos.length;
  int get totalHuespedes => adultos + ninos;

  String get resumenTexto {
    final a = adultos == 1 ? '1 adulto' : '$adultos adultos';
    final n = ninos == 1 ? '1 niño' : '$ninos niños';
    final h = habitaciones == 1 ? '1 hab.' : '$habitaciones hab.';
    return '$a · $n · $h';
  }
}

class OccupancyPickerSheet {
  static Future<OccupancySelection?> show(
    BuildContext context, {
    required OccupancySelection initial,
  }) async {
    int adultos = initial.adultos.clamp(1, 30);
    List<int?> edades = List<int?>.from(initial.edadesNinos);
    int habitaciones = initial.habitaciones.clamp(1, 30);
    String? errorMsg;

    return await showModalBottomSheet<OccupancySelection>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            void cambiarNinos(int nuevoTotal) {
              if (nuevoTotal < 0 || nuevoTotal > 10) return;
              setModalState(() {
                errorMsg = null;
                if (nuevoTotal > edades.length) {
                  while (edades.length < nuevoTotal) {
                    edades.add(8);
                  }
                } else {
                  edades = edades.sublist(0, nuevoTotal);
                }
              });
            }

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
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade300,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Huéspedes y habitaciones',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.textDark),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, color: BookingColors.textMuted),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    const Divider(height: 20),

                    _buildStepperRow(
                      title: 'Adultos',
                      subtitle: '18 años o más',
                      value: adultos,
                      min: 1,
                      max: 30,
                      onChanged: (v) => setModalState(() {
                        adultos = v;
                        errorMsg = null;
                      }),
                    ),
                    const SizedBox(height: 14),

                    _buildStepperRow(
                      title: 'Niños',
                      subtitle: 'De 0 a 17 años',
                      value: edades.length,
                      min: 0,
                      max: 10,
                      onChanged: cambiarNinos,
                    ),

                    if (edades.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF3F6FA),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: BookingColors.borderLight),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Edad de cada niño al finalizar el viaje:',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 10,
                              runSpacing: 8,
                              children: List.generate(edades.length, (idx) {
                                return SizedBox(
                                  width: 145,
                                  child: DropdownButtonFormField<int>(
                                    value: edades[idx] ?? 8,
                                    decoration: InputDecoration(
                                      labelText: 'Niño ${idx + 1}',
                                      filled: true,
                                      fillColor: Colors.white,
                                      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                                    ),
                                    items: List.generate(18, (age) {
                                      return DropdownMenuItem(
                                        value: age,
                                        child: Text('$age ${age == 1 ? 'año' : 'años'}', style: const TextStyle(fontSize: 13)),
                                      );
                                    }),
                                    onChanged: (val) => setModalState(() {
                                      edades[idx] = val ?? 8;
                                      errorMsg = null;
                                    }),
                                  ),
                                );
                              }),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 14),

                    _buildStepperRow(
                      title: 'Habitaciones',
                      subtitle: 'Total de cuartos requeridos',
                      value: habitaciones,
                      min: 1,
                      max: 30,
                      onChanged: (v) => setModalState(() {
                        habitaciones = v;
                        errorMsg = null;
                      }),
                    ),

                    if (errorMsg != null) ...[
                      const SizedBox(height: 10),
                      Text(errorMsg!, style: const TextStyle(color: BookingColors.errorRed, fontSize: 12, fontWeight: FontWeight.bold)),
                    ],

                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: () {
                          if (edades.any((e) => e == null)) {
                            setModalState(() => errorMsg = 'Indica la edad de cada niño para cotizar las habitaciones.');
                            return;
                          }
                          Navigator.pop(
                            ctx,
                            OccupancySelection(
                              adultos: adultos,
                              edadesNinos: edades.map((e) => e ?? 8).toList(),
                              habitaciones: habitaciones,
                            ),
                          );
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: BookingColors.actionBlue,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        child: const Text('Aplicar ocupación', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
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

  static Widget _buildStepperRow({
    required String title,
    required String subtitle,
    required int value,
    required int min,
    required int max,
    required ValueChanged<int> onChanged,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: BookingColors.textDark)),
            Text(subtitle, style: const TextStyle(fontSize: 12, color: BookingColors.textMuted)),
          ],
        ),
        Row(
          children: [
            _circleStepperBtn(
              icon: Icons.remove,
              enabled: value > min,
              onTap: () => onChanged(value - 1),
            ),
            SizedBox(
              width: 34,
              child: Text(
                '$value',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
            _circleStepperBtn(
              icon: Icons.add,
              enabled: value < max,
              onTap: () => onChanged(value + 1),
            ),
          ],
        ),
      ],
    );
  }

  static Widget _circleStepperBtn({
    required IconData icon,
    required bool enabled,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: enabled ? onTap : null,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          border: Border.all(color: enabled ? BookingColors.actionBlue : Colors.grey.shade300),
          borderRadius: BorderRadius.circular(8),
          color: enabled ? Colors.white : Colors.grey.shade100,
        ),
        child: Icon(icon, size: 18, color: enabled ? BookingColors.actionBlue : Colors.grey.shade400),
      ),
    );
  }
}

