// Lectura de boletos y pases de abordar según el contrato v2 de vuelos
// (`BoardingPass`: `passengerId`, `segmentId`, `seat`, `barcode`, `barcodeType`,
// `boardingGroup`, `boardingPosition`, `gate`; `Ticket`: `ticketId`, `passengerId`,
// `eTicketNumber`). Se aceptan también los nombres antiguos que usaba la app
// (`seatNumber`, `barcodeData`, `boardingPassCode`, `ticketNumber`) por si algún
// socio los sigue enviando.

String? _texto(Object? v) {
  if (v == null) return null;
  final t = v.toString().trim();
  return t.isEmpty ? null : t;
}

String? asientoDe(Map<String, dynamic>? pase) => _texto(pase?['seat']) ?? _texto(pase?['seatNumber']);

String? codigoBarrasDe(Map<String, dynamic>? pase) =>
    _texto(pase?['barcode']) ?? _texto(pase?['barcodeData']) ?? _texto(pase?['boardingPassCode']);

String? grupoEmbarqueDe(Map<String, dynamic>? pase) => _texto(pase?['boardingGroup']);

String? posicionEmbarqueDe(Map<String, dynamic>? pase) => _texto(pase?['boardingPosition']);

String? tipoCodigoDe(Map<String, dynamic>? pase) => _texto(pase?['barcodeType']);

String numeroBoletoDe(Map<String, dynamic> boleto) =>
    _texto(boleto['eTicketNumber']) ?? _texto(boleto['ticketNumber']) ?? '--';

/// Pase que corresponde a [boleto].
///
/// Se empareja por pasajero (`passengerId`); si el pasajero tiene un pase por
/// cada tramo, se prefiere el del primer tramo del boleto. Para respuestas
/// antiguas se prueba también por `ticketId` y por nombre. Si no hay forma de
/// emparejar, solo se devuelve un pase cuando hay exactamente uno: con varios
/// pasajeros, mostrar el primero ponía el asiento de otra persona.
Map<String, dynamic>? paseDelBoleto(List<Map<String, dynamic>> pases, Map<String, dynamic> boleto) {
  if (pases.isEmpty) return null;

  final paxId = _texto(boleto['passengerId']);
  final tid = _texto(boleto['ticketId']) ?? _texto(boleto['id']);
  final nombre = _texto(boleto['passengerName']);

  List<Map<String, dynamic>> candidatos = [];
  if (paxId != null) candidatos = pases.where((p) => _texto(p['passengerId']) == paxId).toList();
  if (candidatos.isEmpty && tid != null) candidatos = pases.where((p) => _texto(p['ticketId']) == tid).toList();
  if (candidatos.isEmpty && nombre != null) candidatos = pases.where((p) => _texto(p['passengerName']) == nombre).toList();

  if (candidatos.isEmpty) return pases.length == 1 ? pases.first : null;
  if (candidatos.length == 1) return candidatos.first;

  final tramos = boleto['segments'];
  final primerTramo = tramos is List && tramos.isNotEmpty && tramos.first is Map ? _texto((tramos.first as Map)['segmentId']) : null;
  if (primerTramo != null) {
    for (final p in candidatos) {
      if (_texto(p['segmentId']) == primerTramo) return p;
    }
  }
  return candidatos.first;
}
