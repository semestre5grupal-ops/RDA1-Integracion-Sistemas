import 'package:flutter/material.dart';
import '../theme/booking_colors.dart';

class VueloPassengersSelection {
  final int adults;
  final int youths;
  final int children;
  final int infants;

  const VueloPassengersSelection({
    this.adults = 1,
    this.youths = 0,
    this.children = 0,
    this.infants = 0,
  });

  int get total => adults + youths + children + infants;
  int get seatedTotal => adults + youths + children;

  Map<String, int> toApiMap() {
    return {
      'adults': adults,
      'youths': youths,
      'children': children,
      'infants': infants,
    };
  }

  String get resumenTexto {
    final parts = <String>[];
    parts.add('$adults ${adults == 1 ? 'adulto' : 'adultos'}');
    if (youths > 0) parts.add('$youths ${youths == 1 ? 'joven' : 'jóvenes'}');
    if (children > 0) parts.add('$children ${children == 1 ? 'niño' : 'niños'}');
    if (infants > 0) parts.add('$infants ${infants == 1 ? 'bebé' : 'bebés'}');
    return parts.join(' · ');
  }
}

class VueloPassengersSheet {
  static Future<VueloPassengersSelection?> show(
    BuildContext context, {
    required VueloPassengersSelection initial,
  }) async {
    int adults = initial.adults.clamp(1, 9);
    int youths = initial.youths.clamp(0, 8);
    int children = initial.children.clamp(0, 8);
    int infants = initial.infants.clamp(0, adults);
    String? errorMsg;

    return await showModalBottomSheet<VueloPassengersSelection>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            int seatedCount() => adults + youths + children;

            void sumar(String tipo) {
              setModalState(() {
                errorMsg = null;
                if (tipo == 'infants') {
                  if (infants >= adults) {
                    errorMsg = 'Solo se permite 1 bebé por cada adulto.';
                    return;
                  }
                  infants++;
                  return;
                }
                if (seatedCount() >= 9) {
                  errorMsg = 'Máximo 9 pasajeros con asiento por reserva.';
                  return;
                }
                if (tipo == 'adults') adults++;
                if (tipo == 'youths') youths++;
                if (tipo == 'children') children++;
              });
            }

            void restar(String tipo) {
              setModalState(() {
                errorMsg = null;
                if (tipo == 'adults') {
                  if (adults <= 1) return;
                  adults--;
                  if (infants > adults) {
                    infants = adults;
                    errorMsg = 'Se ajustaron los bebés (máx. 1 por adulto).';
                  }
                } else if (tipo == 'youths' && youths > 0) {
                  youths--;
                } else if (tipo == 'children' && children > 0) {
                  children--;
                } else if (tipo == 'infants' && infants > 0) {
                  infants--;
                }
              });
            }

            return Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
              ),
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('¿Quiénes vuelan?', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(ctx)),
                    ],
                  ),
                  const Divider(height: 20),

                  _row('Adultos', 'Desde 15 años', adults, () => restar('adults'), () => sumar('adults'), canMinus: adults > 1),
                  const SizedBox(height: 12),
                  _row('Jóvenes', 'De 12 a 14 años', youths, () => restar('youths'), () => sumar('youths'), canMinus: youths > 0),
                  const SizedBox(height: 12),
                  _row('Niños', 'De 2 a 11 años', children, () => restar('children'), () => sumar('children'), canMinus: children > 0),
                  const SizedBox(height: 12),
                  _row('Bebés', 'Menores de 2 años (en brazos)', infants, () => restar('infants'), () => sumar('infants'), canMinus: infants > 0),

                  if (errorMsg != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(8)),
                      child: Text(errorMsg!, style: const TextStyle(color: BookingColors.errorRed, fontSize: 12, fontWeight: FontWeight.bold)),
                    ),
                  ],

                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.pop(
                          ctx,
                          VueloPassengersSelection(
                            adults: adults,
                            youths: youths,
                            children: children,
                            infants: infants,
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: BookingColors.actionBlue,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      child: Text('Confirmar (${adults + youths + children + infants} pasajero/s)', style: const TextStyle(fontWeight: FontWeight.bold)),
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

  static Widget _row(
    String label,
    String subtitle,
    int value,
    VoidCallback onMinus,
    VoidCallback onPlus, {
    required bool canMinus,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            Text(subtitle, style: const TextStyle(fontSize: 12, color: BookingColors.textMuted)),
          ],
        ),
        Row(
          children: [
            IconButton(
              onPressed: canMinus ? onMinus : null,
              icon: Icon(Icons.remove_circle_outline, color: canMinus ? BookingColors.actionBlue : Colors.grey.shade300),
            ),
            SizedBox(
              width: 24,
              child: Text('$value', textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ),
            IconButton(
              onPressed: onPlus,
              icon: const Icon(Icons.add_circle_outline, color: BookingColors.actionBlue),
            ),
          ],
        ),
      ],
    );
  }
}

