import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CurrencyOption {
  final String code;
  final String name;
  final String symbol;
  final double rate;

  const CurrencyOption({
    required this.code,
    required this.name,
    required this.symbol,
    required this.rate,
  });
}

class CurrencyProvider extends ChangeNotifier {
  static const List<CurrencyOption> supportedCurrencies = [
    CurrencyOption(code: 'USD', name: 'Dólar estadounidense', symbol: 'US\$', rate: 1.0),
    CurrencyOption(code: 'EUR', name: 'Euro', symbol: '€', rate: 0.95),
    CurrencyOption(code: 'COP', name: 'Peso colombiano', symbol: 'COP \$', rate: 4100.0),
    CurrencyOption(code: 'CLP', name: 'Peso chileno', symbol: 'CLP \$', rate: 950.0),
    CurrencyOption(code: 'MXN', name: 'Peso mexicano', symbol: 'MX\$', rate: 20.0),
    CurrencyOption(code: 'ARS', name: 'Peso argentino', symbol: 'ARS \$', rate: 1000.0),
    CurrencyOption(code: 'GBP', name: 'Libra esterlina', symbol: '£', rate: 0.79),
  ];

  String _currency = 'USD';

  String get currency => _currency;

  CurrencyOption get currentOption =>
      supportedCurrencies.firstWhere((c) => c.code == _currency, orElse: () => supportedCurrencies.first);

  CurrencyProvider() {
    _loadSaved();
  }

  Future<void> _loadSaved() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString('booking_currency');
      if (saved != null && supportedCurrencies.any((c) => c.code == saved)) {
        _currency = saved;
        notifyListeners();
      }
    } catch (_) {}
  }

  Future<void> changeCurrency(String code) async {
    if (!supportedCurrencies.any((c) => c.code == code)) return;
    _currency = code;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('booking_currency', code);
    } catch (_) {}
  }

  String formatPrice(double priceInUsd, {bool forceDecimals = true}) {
    final opt = currentOption;
    final val = priceInUsd * opt.rate;
    if (opt.code == 'COP' || opt.code == 'CLP' || opt.code == 'ARS') {
      return '${opt.symbol} ${val.round()}';
    }
    return '${opt.symbol} ${forceDecimals ? val.toStringAsFixed(2) : val.toStringAsFixed(0)}';
  }
}
