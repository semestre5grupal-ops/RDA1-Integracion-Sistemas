import 'package:flutter/material.dart';
import '../utils/pantalla.dart';

/// Precio a la izquierda y botón a la derecha en pantallas anchas; en celular,
/// el precio arriba y el botón debajo a todo el ancho, para que nunca se salga
/// de la tarjeta (antes "Ver disponibilidad" quedaba cortado a 360 px).
class FilaPrecioAccion extends StatelessWidget {
  const FilaPrecioAccion({super.key, required this.precio, required this.accion});

  final Widget precio;
  final Widget accion;

  @override
  Widget build(BuildContext context) {
    if (!esCompacto(context)) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [Flexible(child: precio), const SizedBox(width: 12), accion],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Align(alignment: Alignment.centerLeft, child: precio),
        const SizedBox(height: 10),
        ConstrainedBox(constraints: const BoxConstraints(minHeight: 48), child: accion),
      ],
    );
  }
}
