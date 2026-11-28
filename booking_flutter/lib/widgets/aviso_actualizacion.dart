import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/actualizacion.dart';
import '../theme/booking_colors.dart';

/// Pide actualizar la app. Si la versión es obligatoria no se puede cerrar:
/// solo queda "Actualizar", que abre la descarga del APK nuevo en el navegador.
Future<void> mostrarAvisoActualizacion(BuildContext context, InfoVersion v) {
  return showDialog<void>(
    context: context,
    barrierDismissible: !v.obligatoria,
    builder: (ctx) => PopScope(
      canPop: !v.obligatoria,
      child: AlertDialog(
        icon: const Icon(Icons.system_update, color: BookingColors.actionBlue, size: 36),
        title: Text(v.obligatoria ? 'Debes actualizar la app' : 'Hay una versión nueva'),
        content: Text(
          '${v.obligatoria ? 'Esta versión ya no se puede usar. ' : ''}'
          'Descarga la nueva versión e instálala encima de la actual; tus datos se conservan.'
          '${v.notas.isNotEmpty ? '\n\nNovedades: ${v.notas}' : ''}',
        ),
        actions: [
          if (!v.obligatoria) TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Más tarde')),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue, foregroundColor: Colors.white),
            icon: const Icon(Icons.download),
            label: const Text('Actualizar'),
            onPressed: () => launchUrl(Uri.parse(v.urlApk), mode: LaunchMode.externalApplication),
          ),
        ],
      ),
    ),
  );
}
