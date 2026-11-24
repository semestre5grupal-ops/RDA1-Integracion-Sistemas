import 'package:flutter/material.dart';
import '../theme/booking_colors.dart';

class BookingRatingBadge extends StatelessWidget {
  final double rating;
  final int? reviewsCount;
  final bool showText;

  const BookingRatingBadge({
    super.key,
    required this.rating,
    this.reviewsCount,
    this.showText = true,
  });

  String _getRatingText(double score) {
    if (score >= 9.5) return 'Excepcional';
    if (score >= 9.0) return 'Fantástico';
    if (score >= 8.5) return 'Muy bueno';
    if (score >= 8.0) return 'Fabuloso';
    if (score >= 7.0) return 'Bueno';
    return 'Aceptable';
  }

  @override
  Widget build(BuildContext context) {
    final text = _getRatingText(rating);

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        if (showText) ...[
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                text,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                  color: BookingColors.textDark,
                ),
              ),
              if (reviewsCount != null)
                Text(
                  '$reviewsCount comentarios',
                  style: const TextStyle(
                    fontSize: 11,
                    color: BookingColors.textMuted,
                  ),
                ),
            ],
          ),
          const SizedBox(width: 8),
        ],
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
          decoration: const BoxDecoration(
            color: BookingColors.primaryBlue,
            borderRadius: BorderRadius.only(
              topLeft: Radius.circular(6),
              topRight: Radius.circular(6),
              bottomRight: Radius.circular(6),
            ),
          ),
          child: Text(
            rating.toStringAsFixed(1),
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
          ),
        ),
      ],
    );
  }
}
