import 'package:booking_flutter/models/alojamiento.dart';
import 'package:booking_flutter/providers/auth_provider.dart';
import 'package:booking_flutter/providers/currency_provider.dart';
import 'package:booking_flutter/widgets/alojamiento_checkout_modal.dart';
import 'package:booking_flutter/widgets/modal_bloqueo_cupo.dart';
import 'package:booking_flutter/widgets/modal_cambio_fecha.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

Widget _app(Widget child) => MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => CurrencyProvider()),
      ],
      child: MaterialApp(home: child),
    );

AlojamientoCheckoutModal _checkout({required String id}) {
  final aloj = Alojamiento.fromJson({'id': id, 'nombre': 'Hotel Prueba', 'precio_por_noche': 100, 'destino': 'Quito'});
  final tipo = TipoHabitacion.fromJson({'product_id': 'STD', 'nombre': 'Doble', 'price': 200, 'meal_plan': 'DESAYUNO_INCLUIDO', 'camas': 1});
  return AlojamientoCheckoutModal(
    alojamiento: aloj,
    checkin: DateTime(2026, 12, 10),
    checkout: DateTime(2026, 12, 12),
    adults: 2,
    edadesNinos: const [5],
    rooms: 1,
    tipoHabitacion: tipo,
    nightsCount: 2,
    totalPrice: 200,
  );
}

Future<void> _escribir(WidgetTester t, String hint, String texto) async {
  await t.enterText(find.widgetWithText(TextField, hint).first, texto);
  await t.pump();
}

Future<void> _siguiente(WidgetTester t) async {
  final boton = find.text('Siguiente: últimos datos  >');
  await t.ensureVisible(boton);
  await t.tap(boton);
  await t.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('AlojamientoCheckoutModal — paso 1 (handleAvanzarPaso2)', () {
    testWidgets('valida campos en el orden de React y avanza al paso 2', (t) async {
      t.view.physicalSize = const Size(1400, 3200);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);

      await t.pumpWidget(_app(_checkout(id: 'NODE_ALO_X~42')));
      await t.pumpAndSettle();

      // Régimen de la habitación elegida y cálculo de cancelación (50 % de 200).
      expect(find.text('Desayuno incluido'), findsOneWidget);
      expect(find.textContaining('100.00'), findsWidgets);
      // 1 acompañante adulto (2 adultos − titular) + 1 niño con su edad.
      expect(find.text('Nombre del niño'), findsOneWidget);

      await _siguiente(t);
      expect(find.text('Por favor completa tu nombre y apellidos.'), findsOneWidget);

      await _escribir(t, 'Ej. Juan', 'Ana');
      await _escribir(t, 'Ej. Pérez Cadena', 'Torres');
      await t.enterText(find.widgetWithText(TextField, 'nombre@ejemplo.com').at(0), 'ana@correo.ec');
      await t.enterText(find.widgetWithText(TextField, 'nombre@ejemplo.com').at(1), 'otra@correo.ec');
      await _siguiente(t);
      expect(find.text('Las direcciones de e-mail no coinciden.'), findsOneWidget);

      await t.enterText(find.widgetWithText(TextField, 'nombre@ejemplo.com').at(1), 'ANA@correo.ec');
      await _siguiente(t);
      expect(find.text('Por favor ingresa un número de teléfono de contacto.'), findsOneWidget);

      await _escribir(t, '0991234567', '0991234567');
      // Hotel de socio (id con "~"): exige documento y valida la cédula por módulo 10.
      await _escribir(t, '1710034065', '1712345678');
      await _siguiente(t);
      expect(find.text('La cédula no es válida. Revisa los 10 dígitos.'), findsOneWidget);

      await _escribir(t, '1710034065', '1712345675');
      await _siguiente(t);
      expect(find.text('Paga en el alojamiento'), findsOneWidget);
      expect(find.text('Completar reserva'), findsOneWidget);
      // El titular de la tarjeta se propone con el nombre del paso 1.
      expect(find.widgetWithText(TextField, 'Ana Torres'), findsOneWidget);
    });

    testWidgets('alojamiento local (sin "~") no pide documento', (t) async {
      t.view.physicalSize = const Size(1400, 3200);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(_app(_checkout(id: 'local-7')));
      await t.pumpAndSettle();
      expect(find.text('Documento del titular *'), findsNothing);
    });

    testWidgets('en móvil (390 px) se apila sin desbordes', (t) async {
      t.view.physicalSize = const Size(390, 2600);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(_app(_checkout(id: 'NODE_ALO_X~42')));
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
      expect(find.text('Introduce tus datos'), findsOneWidget);
    });
  });

  group('Helpers de los modales de vuelos', () {
    test('fechaLegible y horaDeIso trabajan sobre la cadena', () {
      expect(fechaLegible('2026-11-12'), '12 nov 2026');
      expect(fechaLegible(null), '');
      expect(horaDeIso('2026-11-12T15:05:00.000Z'), '15:05');
      expect(horaDeIso(null), '--:--');
    });
    test('formatoCuentaAtras', () {
      expect(formatoCuentaAtras(600), '10:00');
      expect(formatoCuentaAtras(61), '1:01');
      expect(formatoCuentaAtras(-5), '0:00');
    });
  });
}
