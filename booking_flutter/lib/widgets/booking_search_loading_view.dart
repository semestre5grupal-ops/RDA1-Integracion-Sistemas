import 'dart:async';
import 'package:flutter/material.dart';
import '../theme/booking_colors.dart';

class BookingSearchLoadingView extends StatefulWidget {
  final String? destino;
  final String? titulo;
  final List<String>? frases;
  final String subtitulo;

  const BookingSearchLoadingView({
    super.key,
    this.destino,
    this.titulo,
    this.frases,
    this.subtitulo = 'Encuentra alojamientos, vuelos, renta de autos y atracciones en un solo lugar',
  });

  static const List<String> defaultFrases = [
    'Estamos buscando las mejores opciones para tu viaje...',
    'Verificando disponibilidad y tarifas en tiempo real...',
    'Comparando opciones para darte la mejor experiencia...',
    'Estamos personalizando tus resultados...',
    'Casi listo, organizando las mejores ofertas...',
  ];

  @override
  State<BookingSearchLoadingView> createState() => _BookingSearchLoadingViewState();
}

class _BookingSearchLoadingViewState extends State<BookingSearchLoadingView>
    with SingleTickerProviderStateMixin {
  late final List<String> _listaFrases;
  int _fraseIndex = 0;
  int _activoIcono = 0;

  Timer? _fraseTimer;
  Timer? _iconTimer;
  late final AnimationController _progressController;

  static const List<Map<String, dynamic>> _iconosVerticales = [
    {'icon': Icons.hotel, 'label': 'Alojamientos'},
    {'icon': Icons.flight, 'label': 'Vuelos'},
    {'icon': Icons.directions_car, 'label': 'Renta de autos'},
    {'icon': Icons.attractions, 'label': 'Atracciones'},
    {'icon': Icons.check_circle_outline, 'label': 'Disponibilidad en vivo'},
    {'icon': Icons.verified_user_outlined, 'label': 'Reserva segura'},
  ];

  @override
  void initState() {
    super.initState();

    if (widget.frases != null && widget.frases!.isNotEmpty) {
      _listaFrases = widget.frases!;
    } else if (widget.titulo != null && widget.titulo!.isNotEmpty) {
      _listaFrases = [widget.titulo!];
    } else if (widget.destino != null && widget.destino!.trim().isNotEmpty) {
      _listaFrases = [
        'Estamos buscando las mejores opciones en ${widget.destino!.trim()}...',
        'Verificando disponibilidad y tarifas en tiempo real...',
        'Comparando opciones para darte la mejor experiencia...',
        'Estamos personalizando tus resultados...',
        'Casi listo, organizando las mejores ofertas...',
      ];
    } else {
      _listaFrases = BookingSearchLoadingView.defaultFrases;
    }

    // Rotación de frases cada 2.4s (exacto a React)
    _fraseTimer = Timer.periodic(const Duration(milliseconds: 2400), (_) {
      if (mounted) {
        setState(() {
          _fraseIndex = (_fraseIndex + 1) % _listaFrases.length;
        });
      }
    });

    // Rotación de íconos cada 1.2s (exacto a React)
    _iconTimer = Timer.periodic(const Duration(milliseconds: 1200), (_) {
      if (mounted) {
        setState(() {
          _activoIcono = (_activoIcono + 1) % _iconosVerticales.length;
        });
      }
    });

    // Animación de barra de progreso deslizante (1.5s loop continuo)
    _progressController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _fraseTimer?.cancel();
    _iconTimer?.cancel();
    _progressController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 48),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // 1. Título dinámico con animación Fade
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 400),
            transitionBuilder: (child, animation) {
              return FadeTransition(
                opacity: animation,
                child: SlideTransition(
                  position: Tween<Offset>(
                    begin: const Offset(0, 0.15),
                    end: Offset.zero,
                  ).animate(animation),
                  child: child,
                ),
              );
            },
            child: Text(
              _listaFrases[_fraseIndex],
              key: ValueKey<int>(_fraseIndex),
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: BookingColors.textDark,
                height: 1.25,
              ),
            ),
          ),
          const SizedBox(height: 8),

          // 2. Subtítulo
          Text(
            widget.subtitulo,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: BookingColors.textMuted,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 28),

          // 3. Barra de progreso animada (estilo loading-slide de React)
          Container(
            width: double.infinity,
            constraints: const BoxConstraints(maxWidth: 580),
            height: 6,
            decoration: BoxDecoration(
              color: const Color(0xFFE5E7EB),
              borderRadius: BorderRadius.circular(4),
            ),
            clipBehavior: Clip.antiAlias,
            child: AnimatedBuilder(
              animation: _progressController,
              builder: (context, child) {
                return LayoutBuilder(
                  builder: (context, constraints) {
                    final barWidth = constraints.maxWidth * 0.4;
                    final totalTravel = constraints.maxWidth + barWidth;
                    final currentLeft = (_progressController.value * totalTravel) - barWidth;

                    return Stack(
                      children: [
                        Positioned(
                          left: currentLeft,
                          top: 0,
                          bottom: 0,
                          width: barWidth,
                          child: Container(
                            decoration: BoxDecoration(
                              color: BookingColors.actionBlue,
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                );
              },
            ),
          ),
          const SizedBox(height: 36),

          // 4. Grid de 6 íconos de verticales con foco secuencial
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final isNarrow = constraints.maxWidth < 450;
                final crossAxisCount = isNarrow ? 3 : 6;

                return GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: crossAxisCount,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 12,
                    childAspectRatio: 0.95,
                  ),
                  itemCount: _iconosVerticales.length,
                  itemBuilder: (context, idx) {
                    final item = _iconosVerticales[idx];
                    final isHighlight = idx == _activoIcono;

                    return AnimatedScale(
                      scale: isHighlight ? 1.15 : 1.0,
                      duration: const Duration(milliseconds: 300),
                      curve: Curves.easeOut,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            item['icon'] as IconData,
                            size: 28,
                            color: isHighlight
                                ? BookingColors.actionBlue
                                : const Color(0xFF64748B),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            item['label'] as String,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: isHighlight ? FontWeight.bold : FontWeight.w500,
                              color: isHighlight
                                  ? BookingColors.primaryBlue
                                  : const Color(0xFF64748B),
                              height: 1.2,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
          const SizedBox(height: 32),

          // 5. Indicador de confianza minimalista
          const Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.check_circle, size: 16, color: BookingColors.successGreen),
              SizedBox(width: 8),
              Text(
                'Tarifas transparentes y confirmación inmediata',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF475569),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

