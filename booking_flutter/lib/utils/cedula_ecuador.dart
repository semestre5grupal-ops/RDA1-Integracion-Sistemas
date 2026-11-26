/// Validación de documentos de identidad ecuatorianos.
///
/// Réplica de `cedulaValida()` de `frontend/src/components/FormularioReserva.jsx`
/// y `AlojamientoCheckoutModal.jsx` (la versión canónica del frontend):
///
/// 1. Exactamente 10 dígitos.
/// 2. Provincia (2 primeros dígitos) entre 01 y 24, o 30 (ecuatorianos
///    registrados en el exterior).
/// 3. Tercer dígito < 6 (persona natural).
/// 4. Dígito verificador por **módulo 10**: los 9 primeros dígitos se
///    multiplican por los coeficientes 2,1,2,1,2,1,2,1,2; a cada producto
///    mayor que 9 se le resta 9; el verificador es `(10 - suma % 10) % 10`.
library;

bool cedulaValida(String cedula) {
  final c = cedula.trim();
  if (!RegExp(r'^\d{10}$').hasMatch(c)) return false;
  final provincia = int.parse(c.substring(0, 2));
  if (!((provincia >= 1 && provincia <= 24) || provincia == 30)) return false;
  if (int.parse(c[2]) > 5) return false;
  var suma = 0;
  for (var i = 0; i < 9; i++) {
    var d = int.parse(c[i]) * (i.isEven ? 2 : 1);
    if (d > 9) d -= 9;
    suma += d;
  }
  return (10 - (suma % 10)) % 10 == int.parse(c[9]);
}

/// Valida un documento según su tipo y devuelve el mensaje de error de React,
/// o `null` si es válido. Tipos: `CEDULA`, `RUC`, `PASAPORTE` (también `PASSPORT`).
String? validarDocumento(String tipo, String numero) {
  final doc = numero.trim();
  if (doc.isEmpty) return 'Ingresa el número de documento.';
  switch (tipo.toUpperCase()) {
    case 'CEDULA':
      return cedulaValida(doc) ? null : 'La cédula no es válida. Revisa los 10 dígitos.';
    case 'RUC':
      return RegExp(r'^\d{13}$').hasMatch(doc) ? null : 'El RUC debe tener 13 dígitos.';
    case 'PASAPORTE':
    case 'PASSPORT':
      return RegExp(r'^[A-Za-z0-9]{6,12}$').hasMatch(doc) ? null : 'El pasaporte debe tener entre 6 y 12 letras o números.';
    default:
      return null;
  }
}

/// Para campos mixtos "Cédula / Pasaporte": si el valor es solo numérico se
/// exige una cédula válida (módulo 10); si es alfanumérico, formato de pasaporte.
String? validarCedulaOPasaporte(String numero) {
  final doc = numero.trim();
  if (doc.isEmpty) return 'Ingresa tu cédula o pasaporte.';
  if (RegExp(r'^\d+$').hasMatch(doc)) {
    return cedulaValida(doc) ? null : 'La cédula no es válida. Revisa los 10 dígitos.';
  }
  return validarDocumento('PASAPORTE', doc);
}
