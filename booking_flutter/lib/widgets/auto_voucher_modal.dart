import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../providers/currency_provider.dart';
import '../services/api_client.dart';
import '../services/booking_services.dart';

/// Datos que muestra el voucher. Salen de la respuesta de
/// `POST /autos/orders/create` y de la ficha del auto reservado (React arma el
/// mismo objeto `confirmedData` en AutoDetail.jsx).
class AutoVoucherData {
  final String pnr;
  final String marca;
  final String modelo;
  final String categoria;
  final String transmision;
  final double total;
  final String cobertura; // 'TOTAL' | 'BASICA'
  final String qrData;
  final String? licencia;
  final bool checkinHecho;
  final String lugarRetiro;
  final String fechaRetiro;
  final String horaRetiro;
  final String fechaDevolucion;
  final String horaDevolucion;
  final String? ubicacionMostrador;

  const AutoVoucherData({
    required this.pnr,
    required this.marca,
    required this.modelo,
    required this.categoria,
    required this.transmision,
    required this.total,
    required this.cobertura,
    required this.qrData,
    required this.lugarRetiro,
    required this.fechaRetiro,
    required this.horaRetiro,
    required this.fechaDevolucion,
    required this.horaDevolucion,
    this.licencia,
    this.checkinHecho = false,
    this.ubicacionMostrador,
  });
}

/// Réplica de `AutoVoucherModal.jsx`: voucher digital de alquiler con PNR
/// copiable, código QR, vehículo, cobertura/depósito, requisitos de mostrador
/// y check-in express (`POST /autos/reservas/:pnr/checkin`).
///
/// Diferencias deliberadas con React, ambas a favor del usuario:
/// · El QR es real (qr_flutter con `qrData`); React dibuja un SVG decorativo
///   que ningún lector puede escanear.
/// · Si el check-in falla se muestra el error. React lo marcaba como hecho de
///   todos modos ("confirmando check-in local"), lo que haría al cliente creer
///   que ya está registrado en el mostrador.
/// · Se añaden el retiro/devolución y el cooldown de 2 h, con el mismo texto que
///   usan AutoDetail.jsx y AutosPage.jsx.
class AutoVoucherModal extends StatefulWidget {
  final AutoVoucherData data;
  final String? token;

  const AutoVoucherModal({super.key, required this.data, this.token});

  static Future<void> show(BuildContext context, {required AutoVoucherData data, String? token}) {
    return showDialog<void>(
      context: context,
      barrierColor: const Color(0xA6000000),
      builder: (_) => AutoVoucherModal(data: data, token: token),
    );
  }

  @override
  State<AutoVoucherModal> createState() => _AutoVoucherModalState();
}

class _AutoVoucherModalState extends State<AutoVoucherModal> {
  static const _azul = Color(0xFF003580);
  static const _accion = Color(0xFF006CE4);

  late final TextEditingController _documentoCtrl = TextEditingController(text: widget.data.licencia ?? '');
  late bool _checkinHecho = widget.data.checkinHecho;
  bool _cargandoCheckin = false;
  bool _copiado = false;
  String? _errorCheckin;

  @override
  void dispose() {
    _documentoCtrl.dispose();
    super.dispose();
  }

  Future<void> _copiarPnr() async {
    await Clipboard.setData(ClipboardData(text: widget.data.pnr));
    setState(() => _copiado = true);
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _copiado = false);
    });
  }

  Future<void> _hacerCheckin() async {
    final doc = _documentoCtrl.text.trim();
    if (doc.length < 5) {
      setState(() => _errorCheckin = 'El documento de identidad debe tener al menos 5 caracteres.');
      return;
    }
    setState(() {
      _cargandoCheckin = true;
      _errorCheckin = null;
    });
    try {
      await BookingServices.checkinAuto(widget.data.pnr, documentoIdentidad: doc, numeroLicencia: doc, token: widget.token);
      if (mounted) setState(() => _checkinHecho = true);
    } catch (e) {
      if (mounted) {
        setState(() => _errorCheckin = e is ApiException ? e.userMessage : 'No se pudo completar el check-in. Inténtalo de nuevo o hazlo en el mostrador.');
      }
    } finally {
      if (mounted) setState(() => _cargandoCheckin = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final total = Provider.of<CurrencyProvider>(context).formatPrice(d.total);
    final esTotal = d.cobertura.toUpperCase() == 'TOTAL';
    final ancho = MediaQuery.of(context).size.width;

    return Dialog(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(20),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: Color(0xFFD0D7DE))),
      clipBehavior: Clip.antiAlias,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: 720, maxHeight: MediaQuery.of(context).size.height * 0.9),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── Cabecera oficial ───────────────────────────────────────
            Container(
              color: _azul,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Text('🚗', style: TextStyle(fontSize: 22)),
                          SizedBox(width: 8),
                          Flexible(
                            child:
                                Text('Voucher Digital de Alquiler de Auto', style: TextStyle(color: Colors.white, fontSize: 21.6, fontWeight: FontWeight.w700)),
                          ),
                        ]),
                        SizedBox(height: 4),
                        Text('Presenta este documento o código QR en el mostrador para retiro express de llaves',
                            style: TextStyle(color: Color(0xFFB6D3FF), fontSize: 13.6)),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Cerrar',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close, color: Colors.white),
                  ),
                ],
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // ── PNR + QR ──────────────────────────────────────
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF4F7FB),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFE1E8F0)),
                      ),
                      child: Wrap(
                        alignment: WrapAlignment.spaceBetween,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 20,
                        runSpacing: 16,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Text('CÓDIGO LOCALIZADOR (PNR):', style: TextStyle(fontSize: 12.8, color: Color(0xFF555555), letterSpacing: 0.5)),
                              const SizedBox(height: 4),
                              Row(mainAxisSize: MainAxisSize.min, children: [
                                SelectableText(d.pnr, style: const TextStyle(fontSize: 27, fontWeight: FontWeight.w800, color: _azul, letterSpacing: 1)),
                                const SizedBox(width: 10),
                                OutlinedButton(
                                  onPressed: _copiarPnr,
                                  style: OutlinedButton.styleFrom(
                                    backgroundColor: const Color(0xFFE7F0FD),
                                    foregroundColor: _accion,
                                    side: const BorderSide(color: _accion),
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    minimumSize: Size.zero,
                                    textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                                  ),
                                  child: Text(_copiado ? '✓ Copiado' : 'Copiar'),
                                ),
                              ]),
                              const SizedBox(height: 10),
                              _pildoraCheckin(),
                            ],
                          ),
                          Column(mainAxisSize: MainAxisSize.min, children: [
                            Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: const Color(0xFFDDDDDD)),
                              ),
                              child: QrImageView(
                                data: d.qrData,
                                size: 128,
                                eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: _azul),
                                dataModuleStyle: const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: _azul),
                              ),
                            ),
                            const SizedBox(height: 4),
                            const Text('Escanear en Mostrador', style: TextStyle(fontSize: 11.2, color: Color(0xFF777777))),
                          ]),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // ── Vehículo + Cobertura (2 columnas; 1 en móvil) ──
                    _dosColumnas(
                      ancho < 600,
                      _tarjeta('🚘 Vehículo Confirmado', [
                        Text('${d.marca} ${d.modelo}'.trim(), style: const TextStyle(fontSize: 16.8, fontWeight: FontWeight.w700, color: _azul)),
                        const SizedBox(height: 4),
                        Text.rich(TextSpan(style: const TextStyle(fontSize: 13.6, color: Color(0xFF666666)), children: [
                          const TextSpan(text: 'Categoría: '),
                          TextSpan(text: d.categoria, style: const TextStyle(fontWeight: FontWeight.w700)),
                          const TextSpan(text: ' • Transmisión: '),
                          TextSpan(text: d.transmision, style: const TextStyle(fontWeight: FontWeight.w700)),
                        ])),
                        const SizedBox(height: 6),
                        const Text('⛽ Política de combustible: Lleno a lleno',
                            style: TextStyle(fontSize: 13.6, color: Color(0xFF008009), fontWeight: FontWeight.w600)),
                        const SizedBox(height: 2),
                        const Text.rich(TextSpan(style: TextStyle(fontSize: 13.6, color: Color(0xFF555555)), children: [
                          TextSpan(text: '🛣️ Kilometraje: '),
                          TextSpan(text: 'Ilimitado', style: TextStyle(fontWeight: FontWeight.w700)),
                        ])),
                      ]),
                      _tarjeta('🛡️ Cobertura y Depósito', [
                        Text(esTotal ? 'Cobertura Total / Protección Premium' : 'Protección Básica',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: esTotal ? const Color(0xFF137333) : const Color(0xFF333333))),
                        const SizedBox(height: 4),
                        _linea('Franquicia por daños: ', esTotal ? '\$0.00 US\$' : '\$1,200.00 US\$'),
                        const SizedBox(height: 2),
                        _linea('Depósito en tarjeta: ', esTotal ? '\$0.00 US\$ (Exonerado)' : '\$1,200.00 US\$ retenido'),
                        const SizedBox(height: 6),
                        Text('Total pagado: $total', style: const TextStyle(fontSize: 15.2, fontWeight: FontWeight.w700, color: _azul)),
                      ]),
                    ),
                    const SizedBox(height: 16),

                    // ── Entrega en patio: retiro / devolución ──
                    _tarjeta('🗓️ Retiro y devolución', [
                      _linea('Retiro: ', '${d.fechaRetiro} · ${d.horaRetiro} — ${d.lugarRetiro}'),
                      if (d.ubicacionMostrador != null && d.ubicacionMostrador!.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        _linea('Mostrador: ', d.ubicacionMostrador!),
                      ],
                      const SizedBox(height: 2),
                      _linea('Devolución: ', '${d.fechaDevolucion} · ${d.horaDevolucion} — ${d.lugarRetiro}'),
                      const SizedBox(height: 6),
                      const Text.rich(TextSpan(style: TextStyle(fontSize: 13, color: Color(0xFF555555), height: 1.4), children: [
                        TextSpan(text: '🧼 Garantía de Limpieza e Inspección: ', style: TextStyle(fontWeight: FontWeight.w700)),
                        TextSpan(text: 'tras la devolución el vehículo cumple un '),
                        TextSpan(text: 'cooldown estricto de 2 horas', style: TextStyle(fontWeight: FontWeight.w700)),
                        TextSpan(text: ' de higienización técnica antes de reingresar al catálogo. Devuelve el auto a la hora pactada.'),
                      ])),
                    ]),
                    const SizedBox(height: 16),

                    // ── Requisitos de mostrador ──
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEFCF3),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFF6E05E)),
                      ),
                      child: const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('⚠️ Requisitos Obligatorios al Retirar el Vehículo en Mostrador:',
                              style: TextStyle(fontSize: 14.4, fontWeight: FontWeight.w700, color: Color(0xFF975A16))),
                          SizedBox(height: 6),
                          _Requisito('Licencia de conducir física original:', ' Con vigencia mayor a 1 año a nombre del titular.'),
                          _Requisito('Documento de identidad oficial:', ' Cédula o Pasaporte físico vigente.'),
                          _Requisito('Tarjeta de crédito física:', ' Con cupo disponible para el depósito (en caso de Protección Básica).'),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // ── Check-in express ──
                    if (!_checkinHecho)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                        decoration: BoxDecoration(
                          color: const Color(0xFFE8F0FE),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFFB3D1FF)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('🚀 Check-in Digital Anticipado (Ahorra hasta 20 minutos)',
                                style: TextStyle(fontSize: 14.4, fontWeight: FontWeight.w700, color: Color(0xFF1A73E8))),
                            const SizedBox(height: 4),
                            const Text('Ingresa el número de tu licencia física para validar tu entrega express:',
                                style: TextStyle(fontSize: 13, color: Color(0xFF333333))),
                            const SizedBox(height: 10),
                            Wrap(
                              spacing: 10,
                              runSpacing: 8,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                SizedBox(
                                  width: ancho < 600 ? double.infinity : 360,
                                  child: TextField(
                                    controller: _documentoCtrl,
                                    maxLength: 20,
                                    decoration: const InputDecoration(
                                      hintText: 'Número de Licencia de Conducir',
                                      counterText: '',
                                      isDense: true,
                                      filled: true,
                                      fillColor: Colors.white,
                                      border: OutlineInputBorder(),
                                    ),
                                    onSubmitted: (_) => _hacerCheckin(),
                                  ),
                                ),
                                ElevatedButton(
                                  onPressed: _cargandoCheckin ? null : _hacerCheckin,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: _accion,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                                  ),
                                  child: Text(_cargandoCheckin ? 'Validando...' : 'Completar Check-in Express',
                                      style: const TextStyle(fontWeight: FontWeight.w700)),
                                ),
                              ],
                            ),
                            if (_errorCheckin != null)
                              Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Text(_errorCheckin!, style: const TextStyle(color: Color(0xFFB3261E), fontSize: 13)),
                              ),
                          ],
                        ),
                      ),
                    if (!_checkinHecho) const SizedBox(height: 20),

                    // ── Acciones ──
                    const Divider(height: 1, color: Color(0xFFEEEEEE)),
                    const SizedBox(height: 16),
                    Align(
                      alignment: Alignment.centerRight,
                      child: ElevatedButton(
                        onPressed: () => Navigator.of(context).pop(),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _accion,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                        ),
                        child: const Text('Entendido / Cerrar', style: TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _pildoraCheckin() {
    final hecho = _checkinHecho;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: hecho ? const Color(0xFFE6F4EA) : const Color(0xFFFEF7E0),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        hecho ? '✓ Check-in Express Confirmado' : '⏳ Check-in Online Pendiente',
        style: TextStyle(
          fontSize: 13,
          fontWeight: hecho ? FontWeight.w700 : FontWeight.w600,
          color: hecho ? const Color(0xFF137333) : const Color(0xFFB06000),
        ),
      ),
    );
  }

  static Widget _dosColumnas(bool apilar, Widget a, Widget b) => apilar
      ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [a, const SizedBox(height: 16), b])
      : IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(child: a),
            const SizedBox(width: 16),
            Expanded(child: b),
          ]),
        );

  static Widget _tarjeta(String titulo, List<Widget> hijos) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFFFAFAFA),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFFEEEEEE)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.only(bottom: 4),
              margin: const EdgeInsets.only(bottom: 8),
              decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFDDDDDD)))),
              child: Text(titulo, style: const TextStyle(fontSize: 13.6, fontWeight: FontWeight.w700, color: Color(0xFF333333))),
            ),
            ...hijos,
          ],
        ),
      );

  static Widget _linea(String etiqueta, String valor) => Text.rich(TextSpan(
        style: const TextStyle(fontSize: 13.6, color: Color(0xFF555555)),
        children: [TextSpan(text: etiqueta), TextSpan(text: valor, style: const TextStyle(fontWeight: FontWeight.w700))],
      ));
}

class _Requisito extends StatelessWidget {
  final String negrita;
  final String resto;
  const _Requisito(this.negrita, this.resto);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 8, top: 2),
      child: Text.rich(TextSpan(
        style: const TextStyle(fontSize: 13.6, color: Color(0xFF744210), height: 1.5),
        children: [
          const TextSpan(text: '• '),
          TextSpan(text: negrita, style: const TextStyle(fontWeight: FontWeight.w700)),
          TextSpan(text: resto),
        ],
      )),
    );
  }
}
