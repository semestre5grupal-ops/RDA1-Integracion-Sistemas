import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;

/// Número de compilación de este APK. Lo pone GitHub Actions al compilar
/// (`--dart-define=BUILD_NUMBER=<n.º de ejecución>`). En compilaciones locales
/// vale 0 y no se busca actualización.
const int buildActual = int.fromEnvironment('BUILD_NUMBER');

/// Archivo que publica GitHub Actions junto al APK, con el número de la última compilación.
const String urlVersion = String.fromEnvironment(
  'VERSION_URL',
  defaultValue: 'https://github.com/semestre5grupal-ops/RDA1-Integracion-Sistemas/releases/download/apk-movil-latest/version.json',
);

/// Lo que dice `version.json`.
class InfoVersion {
  final int build;
  final bool obligatoria;
  final String urlApk;
  final String notas;
  const InfoVersion({required this.build, required this.obligatoria, required this.urlApk, this.notas = ''});

  static InfoVersion? desdeJson(dynamic j) {
    if (j is! Map) return null;
    final build = int.tryParse('${j['build']}');
    final url = j['url']?.toString() ?? '';
    if (build == null || !url.startsWith('https://')) return null;
    return InfoVersion(build: build, obligatoria: j['obligatoria'] == true, urlApk: url, notas: j['notas']?.toString() ?? '');
  }
}

/// Devuelve la versión nueva si hay una más reciente que la instalada; si no
/// hay, si no hay red o si el archivo no se puede leer, devuelve `null`.
/// Nunca lanza: una falla aquí no debe impedir usar la app.
Future<InfoVersion?> buscarActualizacion({http.Client? client, int? actual, bool? esWeb}) async {
  final instalada = actual ?? buildActual;
  if ((esWeb ?? kIsWeb) || instalada <= 0) return null;
  final c = client ?? http.Client();
  try {
    final res = await c.get(Uri.parse(urlVersion)).timeout(const Duration(seconds: 6));
    if (res.statusCode != 200) return null;
    final info = InfoVersion.desdeJson(jsonDecode(res.body));
    if (info == null || info.build <= instalada) return null;
    return info;
  } catch (_) {
    return null;
  } finally {
    if (client == null) c.close();
  }
}
