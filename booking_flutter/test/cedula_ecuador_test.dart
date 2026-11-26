import 'package:booking_flutter/utils/cedula_ecuador.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('cedulaValida (módulo 10)', () {
    test('cédulas con verificador correcto', () {
      // 1·2,7,1·2,2,3·2,4,5·2→1,6,7·2→5 = 35 → verificador (10 - 5) % 10 = 5
      expect(cedulaValida('1712345675'), isTrue);
      expect(cedulaValida('1755073481'), isTrue);
      // 0·2 + 1·1 = 1 → verificador 9
      expect(cedulaValida('0100000009'), isTrue);
      // Provincia 30 (exterior)
      expect(cedulaValida('3000000004'), isTrue);
    });
    test('verificador incorrecto', () {
      expect(cedulaValida('1712345678'), isFalse);
      expect(cedulaValida('1724567890'), isFalse);
    });
    test('provincia fuera de rango y tercer dígito >= 6', () {
      expect(cedulaValida('2500000000'), isFalse);
      expect(cedulaValida('0000000000'), isFalse);
      expect(cedulaValida('1760000000'), isFalse);
    });
    test('longitud o caracteres inválidos', () {
      expect(cedulaValida('171234567'), isFalse);
      expect(cedulaValida('17123456789'), isFalse);
      expect(cedulaValida('17123456a8'), isFalse);
      expect(cedulaValida(''), isFalse);
    });
  });

  group('validarDocumento', () {
    test('mensajes de React', () {
      expect(validarDocumento('CEDULA', '1712345675'), isNull);
      expect(validarDocumento('CEDULA', '1712345678'), 'La cédula no es válida. Revisa los 10 dígitos.');
      expect(validarDocumento('RUC', '1712345678001'), isNull);
      expect(validarDocumento('RUC', '171234'), 'El RUC debe tener 13 dígitos.');
      expect(validarDocumento('PASAPORTE', 'AB12345'), isNull);
      expect(validarDocumento('PASSPORT', 'A1'), isNotNull);
    });
  });

  test('validarCedulaOPasaporte', () {
    expect(validarCedulaOPasaporte('1712345675'), isNull);
    expect(validarCedulaOPasaporte('1712345678'), isNotNull);
    expect(validarCedulaOPasaporte('AB123456'), isNull);
    expect(validarCedulaOPasaporte(''), isNotNull);
  });
}
