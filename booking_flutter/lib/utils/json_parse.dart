/// Utilidades de parsing tolerante para respuestas de nodos socios.
///
/// Los microservicios de los compañeros (NODE_ATR_ARIEL, NODE_ATR_GLORIA,
/// aerolíneas, flotas de autos, hoteles...) no comparten un esquema único:
/// un precio puede llegar como `45`, `"45.00"`, `"$1,250.50"`, `{ total: 45 }`,
/// `{ amount: "45.00", currency: "USD" }` o incluso anidado; un booleano como
/// `true`, `"true"`, `1` o `"si"`; un identificador como `id`, `_id`,
/// `auto_id`... Estas funciones NUNCA lanzan excepción: ante un valor
/// irreconocible devuelven el `fallback`.
library;

/// Claves que, dentro de un objeto de precio, contienen el monto numérico.
/// El orden importa: `total` primero (igual que `price?.total` en React).
const List<String> _moneyKeys = [
  'total',
  'amount',
  'value',
  'valor',
  'monto',
  'precio',
  'price',
  'adult',
  'adulto',
  'grandTotal',
  'base',
];

/// Convierte cualquier representación de un número/monto a `double`.
double parseDouble(dynamic val, [double fallback = 0.0]) {
  return _tryDouble(val, 0) ?? fallback;
}

/// Igual que [parseDouble] pero devuelve `null` si no se reconoce el valor.
double? parseDoubleOrNull(dynamic val) => _tryDouble(val, 0);

double? _tryDouble(dynamic val, int depth) {
  if (val == null || depth > 4) return null;
  if (val is num) return val.isFinite ? val.toDouble() : null;
  if (val is bool) return null;
  if (val is String) {
    var s = val.trim();
    if (s.isEmpty) return null;
    // Quitar símbolos de moneda, códigos y espacios: "$ 1,250.50", "USD 45", "45 €"
    s = s.replaceAll(RegExp(r'[^0-9,.\-]'), '');
    if (s.isEmpty || s == '-' || s == '.' || s == ',') return null;
    final hasComma = s.contains(',');
    final hasDot = s.contains('.');
    if (hasComma && hasDot) {
      // El separador que aparece al final es el decimal.
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replaceAll('.', '').replaceAll(',', '.');
      } else {
        s = s.replaceAll(',', '');
      }
    } else if (hasComma) {
      // "45,50" -> decimal; "1,250" -> miles.
      final parts = s.split(',');
      if (parts.length == 2 && parts[1].length != 3) {
        s = s.replaceAll(',', '.');
      } else {
        s = s.replaceAll(',', '');
      }
    }
    return double.tryParse(s);
  }
  if (val is Map) {
    for (final k in _moneyKeys) {
      if (val.containsKey(k)) {
        final r = _tryDouble(val[k], depth + 1);
        if (r != null) return r;
      }
    }
    return null;
  }
  if (val is List && val.isNotEmpty) return _tryDouble(val.first, depth + 1);
  return null;
}

/// Convierte cualquier representación numérica a `int`.
int parseInt(dynamic val, [int fallback = 0]) {
  final d = _tryDouble(val, 0);
  if (d == null) return fallback;
  return d.round();
}

/// Igual que [parseInt] pero devuelve `null` si no se reconoce el valor.
int? parseIntOrNull(dynamic val) {
  final d = _tryDouble(val, 0);
  return d?.round();
}

/// Convierte `true`, `"true"`, `"si"`, `"sí"`, `"yes"`, `1`, `"1"` a booleano.
bool parseBool(dynamic val, [bool fallback = false]) {
  return parseBoolOrNull(val) ?? fallback;
}

bool? parseBoolOrNull(dynamic val) {
  if (val == null) return null;
  if (val is bool) return val;
  if (val is num) return val != 0;
  if (val is String) {
    final s = val.trim().toLowerCase();
    if (const ['true', '1', 'si', 'sí', 'yes', 'y', 's'].contains(s)) return true;
    if (const ['false', '0', 'no', 'n'].contains(s)) return false;
  }
  return null;
}

/// Devuelve el primer valor no vacío entre [keys] convertido a texto.
/// Ignora mapas y listas (evita mostrar "{...}" en pantalla).
String? firstString(Map json, List<String> keys) {
  for (final k in keys) {
    final v = json[k];
    if (v == null || v is Map || v is List) continue;
    final s = v.toString().trim();
    if (s.isNotEmpty && s != 'null') return s;
  }
  return null;
}

/// Texto legible de un valor que puede ser String o un objeto con nombre.
String? displayText(dynamic v) {
  if (v == null) return null;
  if (v is Map) {
    return firstString(v, const ['nombre', 'name', 'label', 'titulo', 'title', 'descripcion', 'description', 'codigo', 'code']);
  }
  if (v is List) return null;
  final s = v.toString().trim();
  return s.isEmpty ? null : s;
}

/// Lista de textos a partir de `["a","b"]` o `[{nombre:"a"}, {name:"b"}]`.
List<String> stringList(dynamic v) {
  if (v is List) {
    return v.map(displayText).whereType<String>().where((s) => s.isNotEmpty).toList();
  }
  if (v is String && v.trim().isNotEmpty) {
    return v.split(RegExp(r'[,;|]')).map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
  }
  return <String>[];
}

/// Extrae la lista de elementos de respuestas `[...]`, `{data:[...]}`,
/// `{items:[...]}`, `{results:[...]}` o `{data:{items:[...]}}`.
List<Map<String, dynamic>> extractList(dynamic decoded, [List<String> extraKeys = const []]) {
  dynamic list = decoded;
  if (decoded is Map) {
    list = null;
    for (final k in [...extraKeys, 'data', 'items', 'results', 'resultados', 'offers', 'reservas', 'reservations', 'orders']) {
      final v = decoded[k];
      if (v is List) {
        list = v;
        break;
      }
      if (v is Map) {
        final nested = extractList(v, extraKeys);
        if (nested.isNotEmpty) return nested;
      }
    }
  }
  if (list is! List) return <Map<String, dynamic>>[];
  return list.whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList();
}
