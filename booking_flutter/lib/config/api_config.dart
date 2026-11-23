import 'dart:io';
import 'package:flutter/foundation.dart';

class ApiConfig {
  // En producción apunta a Azure App Service; en local conmuta a localhost/10.0.2.2 según plataforma
  static String get baseUrl {
    if (kReleaseMode) {
      return 'https://booking-core-api.azurewebsites.net/api/v1';
    }
    
    // En emulador Android, localhost del host es 10.0.2.2; en Web/Desktop es localhost
    if (!kIsWeb && Platform.isAndroid) {
      return 'http://10.0.2.2:3000/api/v1';
    }
    
    return 'http://localhost:3000/api/v1';
  }

  static String get graphqlUrl {
    if (kReleaseMode) {
      return 'https://booking-core-api.azurewebsites.net/graphql';
    }
    if (!kIsWeb && Platform.isAndroid) {
      return 'http://10.0.2.2:3000/graphql';
    }
    return 'http://localhost:3000/graphql';
  }

  static const Duration timeout = Duration(seconds: 10);
}

