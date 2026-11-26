import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/currency_provider.dart';
import '../utils/json_parse.dart';

/// Piezas comunes de los modales de vuelos de `frontend/src/vuelos.css`
/// (`.modal`, `.modal-head`, `.modal-error`, `.cotizacion`, `.modal-radio`,
/// `.btn-primario`, `.btn-secundario`, `.btn-peligro`), compartidas por
/// [ModalPostventa], [ModalCambioFecha] y [ModalBloqueoCupo].
class VuelosModalColors {
  static const bookingBlue = Color(0xFF003B95);
  static const yellow = Color(0xFFFEBB02);
  static const textDark = Color(0xFF1A1A1A);
  static const textMuted = Color(0xFF474747);
  static const border = Color(0xFFE7E7E7);
  static const errorFg = Color(0xFF991B1B);
  static const errorBg = Color(0xFFFEE2E2);
  static const errorBorder = Color(0xFFF5C2C0);
  static const radioActivo = Color(0xFFEEF3FC);
  static const totalBg = Color(0xFFF7F9FD);
  static const exito = Color(0xFF166534);
}

/// `formatearMoneda(valor, moneda)` de React: importes del contrato (`string`)
/// convertidos a la moneda elegida por el usuario. `--` si no hay valor.
String formatearMoneda(BuildContext context, dynamic valor) {
  final v = parseDoubleOrNull(valor);
  if (v == null) return '--';
  return Provider.of<CurrencyProvider>(context, listen: false).formatPrice(v);
}

/// Contenedor del diálogo: `.modal` (máx. 620 px) con cabecera, cuerpo
/// desplazable y pie. [onCerrar] es `null` mientras hay un envío en curso
/// (React no cierra a mitad de un POST: no podría mostrar el resultado).
class VuelosModalShell extends StatelessWidget {
  final String titulo;
  final VoidCallback? onCerrar;
  final List<Widget> cuerpo;
  final Widget pie;
  final double maxWidth;

  const VuelosModalShell({
    super.key,
    required this.titulo,
    required this.onCerrar,
    required this.cuerpo,
    required this.pie,
    this.maxWidth = 620,
  });

  @override
  Widget build(BuildContext context) {
    return Dialog(
      insetPadding: const EdgeInsets.all(16),
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth, maxHeight: MediaQuery.of(context).size.height * 0.9),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: VuelosModalColors.border))),
              child: Row(
                children: [
                  Expanded(
                    child: Semantics(
                      header: true,
                      child: Text(titulo, style: const TextStyle(fontSize: 16.8, fontWeight: FontWeight.w700, color: VuelosModalColors.textDark)),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Cerrar',
                    onPressed: onCerrar,
                    icon: const Icon(Icons.close, size: 20, color: VuelosModalColors.textMuted),
                  ),
                ],
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: cuerpo),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: const BoxDecoration(border: Border(top: BorderSide(color: VuelosModalColors.border))),
              child: pie,
            ),
          ],
        ),
      ),
    );
  }
}

/// `.modal-error` con `role="alert"`.
class VuelosModalError extends StatelessWidget {
  final String mensaje;
  const VuelosModalError(this.mensaje, {super.key});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
        decoration: BoxDecoration(
          color: VuelosModalColors.errorBg,
          borderRadius: BorderRadius.circular(6),
          border: const Border(
            left: BorderSide(color: VuelosModalColors.errorFg, width: 3),
            top: BorderSide(color: VuelosModalColors.errorBorder),
            right: BorderSide(color: VuelosModalColors.errorBorder),
            bottom: BorderSide(color: VuelosModalColors.errorBorder),
          ),
        ),
        child: Text(mensaje, style: const TextStyle(color: VuelosModalColors.errorFg, fontSize: 13)),
      ),
    );
  }
}

/// `.modal-nota`
class VuelosModalNota extends StatelessWidget {
  final String texto;
  const VuelosModalNota(this.texto, {super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Text(texto, style: const TextStyle(fontSize: 12, color: VuelosModalColors.textMuted)),
    );
  }
}

/// Fila de `.cotizacion` (`penalidad` en rojo, `total` resaltada).
class CotizacionFila {
  final String etiqueta;
  final String valor;
  final bool penalidad;
  final bool total;
  const CotizacionFila(this.etiqueta, this.valor, {this.penalidad = false, this.total = false});
}

class VuelosCotizacion extends StatelessWidget {
  final List<CotizacionFila> filas;
  const VuelosCotizacion(this.filas, {super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(border: Border.all(color: VuelosModalColors.border), borderRadius: BorderRadius.circular(8)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var i = 0; i < filas.length; i++)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: filas[i].total ? VuelosModalColors.totalBg : null,
                border: i == filas.length - 1 ? null : const Border(bottom: BorderSide(color: VuelosModalColors.border)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Flexible(child: Text(filas[i].etiqueta, style: _estilo(filas[i]))),
                  Text(filas[i].valor, style: _estilo(filas[i])),
                ],
              ),
            ),
        ],
      ),
    );
  }

  TextStyle _estilo(CotizacionFila f) => TextStyle(
        fontSize: f.total ? 14 : 13,
        fontWeight: f.total ? FontWeight.w700 : FontWeight.w400,
        color: f.penalidad ? VuelosModalColors.errorFg : VuelosModalColors.textDark,
      );
}

/// `.modal-radio`: tarjeta seleccionable con nombre y metadato.
class VuelosRadioCard extends StatelessWidget {
  final bool activo;
  final String nombre;
  final String meta;
  final VoidCallback? onTap;
  const VuelosRadioCard({super.key, required this.activo, required this.nombre, required this.meta, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      inMutuallyExclusiveGroup: true,
      checked: activo,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: activo ? VuelosModalColors.radioActivo : Colors.white,
            border: Border.all(color: activo ? VuelosModalColors.bookingBlue : VuelosModalColors.border, width: 1.5),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(activo ? Icons.radio_button_checked : Icons.radio_button_off, size: 16, color: VuelosModalColors.bookingBlue),
                  const SizedBox(width: 6),
                  Flexible(child: Text(nombre, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: VuelosModalColors.textDark))),
                ],
              ),
              if (meta.isNotEmpty) Text(meta, style: const TextStyle(fontSize: 11, color: VuelosModalColors.textMuted)),
            ],
          ),
        ),
      ),
    );
  }
}

/// `.btn-primario` (amarillo Booking), `.btn-secundario` y `.btn-peligro`.
enum VuelosBotonTipo { primario, secundario, peligro }

class VuelosBoton extends StatelessWidget {
  final String texto;
  final VoidCallback? onPressed;
  final VuelosBotonTipo tipo;
  const VuelosBoton(this.texto, {super.key, required this.onPressed, this.tipo = VuelosBotonTipo.primario});

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color fg, BorderSide side) = switch (tipo) {
      VuelosBotonTipo.primario => (VuelosModalColors.yellow, const Color(0xFF1A1A2E), BorderSide.none),
      VuelosBotonTipo.secundario => (Colors.white, VuelosModalColors.textDark, const BorderSide(color: VuelosModalColors.border)),
      VuelosBotonTipo.peligro => (const Color(0xFFB91C1C), Colors.white, BorderSide.none),
    };
    return Opacity(
      opacity: onPressed == null ? 0.55 : 1,
      child: TextButton(
        onPressed: onPressed,
        style: TextButton.styleFrom(
          backgroundColor: bg,
          foregroundColor: fg,
          disabledForegroundColor: fg,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4), side: side),
          textStyle: const TextStyle(fontSize: 13.6, fontWeight: FontWeight.w700),
        ),
        child: Text(texto),
      ),
    );
  }
}

/// `.modal-input` con su `<label htmlFor>`.
class VuelosCampo extends StatelessWidget {
  final String etiqueta;
  final Widget child;
  const VuelosCampo({super.key, required this.etiqueta, required this.child});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(etiqueta, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: VuelosModalColors.textDark)),
          const SizedBox(height: 4),
          child,
        ],
      ),
    );
  }
}

InputDecoration vuelosInputDecoration({String? hint}) => InputDecoration(
      hintText: hint,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(4), borderSide: const BorderSide(color: VuelosModalColors.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(4), borderSide: const BorderSide(color: VuelosModalColors.border)),
    );
