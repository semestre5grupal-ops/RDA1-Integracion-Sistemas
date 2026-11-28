import 'package:flutter/widgets.dart';

/// Ancho a partir del cual la app usa el diseño ancho (tablet / web).
/// Por debajo, diseño de celular: una columna, barra inferior, hojas desde abajo.
const double kAnchoCompacto = 600;

/// `true` en celulares (menos de 600 px lógicos de ancho).
bool esCompacto(BuildContext context) => MediaQuery.sizeOf(context).width < kAnchoCompacto;
