import 'dart:convert';
import '../models/admin_models.dart';
import 'api_client.dart';

/// Consultas del panel de administración (solo lectura). El backend exige el
/// token de un administrador en cada una: si el usuario no lo es, responde 403.
class AdminServices {
  static dynamic _json(dynamic res) {
    if (res.statusCode >= 200 && res.statusCode < 300) return jsonDecode(res.body);
    throw ApiClient.parseError(res);
  }

  static Future<MetricasAdmin> metricas({required String token, int dias = 30}) async {
    final res = await ApiClient.get('/admin/metricas', queryParams: {'dias': '$dias'}, token: token);
    return MetricasAdmin.fromJson(_json(res));
  }

  static Future<InformeSlo> slo({required String token, int horas = 24}) async {
    final res = await ApiClient.get('/admin/procesos/vuelos/slo', queryParams: {'horas': '$horas'}, token: token);
    return InformeSlo.fromJson(_json(res));
  }

  static Future<List<EventoTraza>> monitoreo({required String token, int horas = 24}) async {
    final res = await ApiClient.get('/admin/procesos/vuelos/monitoreo', queryParams: {'horas': '$horas'}, token: token);
    final d = _json(res);
    return EventoTraza.lista(d is Map ? d['eventos'] : null);
  }

  static Future<List<EventoTraza>> traza({required String token, required String id}) async {
    final res = await ApiClient.get('/admin/procesos/vuelos/traza/${Uri.encodeComponent(id)}', token: token);
    final d = _json(res);
    return EventoTraza.lista(d is Map ? d['eventos'] : null);
  }
}
