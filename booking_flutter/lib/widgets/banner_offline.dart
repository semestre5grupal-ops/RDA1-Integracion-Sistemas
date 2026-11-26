import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../offline/cola_reservas.dart';
import '../offline/estado_red.dart';

/// Aviso fijo arriba: sin conexión, reservas en espera o reservas rechazadas.
/// Equivale a `OfflineBanner.jsx`. No ocupa espacio cuando no hay nada que decir.
class BannerOffline extends StatelessWidget {
  const BannerOffline({super.key});

  @override
  Widget build(BuildContext context) {
    final red = context.watch<EstadoRed>();
    final cola = context.watch<ColaReservas>();
    final pendientes = cola.pendientes;
    final rechazadas = cola.rechazadas;
    if (red.enLinea && pendientes.isEmpty && rechazadas.isEmpty) return const SizedBox.shrink();

    final lineas = <Widget>[];
    if (!red.enLinea) {
      lineas.add(const _Linea(icono: Icons.wifi_off, texto: 'Sin conexión. Puedes seguir mirando; las reservas se enviarán al volver la red.', color: Color(0xFF475569)));
    }
    if (pendientes.isNotEmpty) {
      lineas.add(_Linea(
        icono: Icons.schedule_send,
        texto: pendientes.length == 1
            ? '1 reserva en espera: ${pendientes.first.titulo}. Se enviará sola.'
            : '${pendientes.length} reservas en espera. Se enviarán solas.',
        color: const Color(0xFF9A5B00),
        accion: red.enLinea ? TextButton(onPressed: red.reintentar, child: const Text('Reintentar ahora')) : null,
      ));
    }
    for (final r in rechazadas) {
      lineas.add(_Linea(
        icono: Icons.error_outline,
        texto: '${r.titulo}: ${r.error ?? 'no se pudo enviar'}${r.codigoSoporte != null ? '\nCódigo de soporte: ${r.codigoSoporte}' : ''}',
        color: const Color(0xFFB42318),
        accion: TextButton(onPressed: () => cola.descartar(r.id), child: const Text('Descartar')),
      ));
    }
    return Material(
      color: Colors.white,
      child: SafeArea(bottom: false, child: Column(mainAxisSize: MainAxisSize.min, children: lineas)),
    );
  }
}

class _Linea extends StatelessWidget {
  const _Linea({required this.icono, required this.texto, required this.color, this.accion});

  final IconData icono;
  final String texto;
  final Color color;
  final Widget? accion;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: color.withValues(alpha: 0.12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Row(children: [
        Icon(icono, size: 18, color: color),
        const SizedBox(width: 8),
        Expanded(child: Text(texto, style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w600))),
        if (accion != null) accion!,
      ]),
    );
  }
}
