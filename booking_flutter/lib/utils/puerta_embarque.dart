/// Puerta de embarque (`gate`) que informa la aerolínea en el estado del vuelo y
/// en el pase de abordar (contrato v2). Solo viene cuando ya está asignada: sin
/// puerta devuelve `null` y la pantalla no muestra nada (igual que antes).
String? puertaDe(Map<String, dynamic>? origen) {
  final v = origen?['gate'];
  if (v == null) return null;
  final texto = v.toString().trim();
  return texto.isEmpty ? null : texto;
}
