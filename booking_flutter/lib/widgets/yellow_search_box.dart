import 'package:flutter/material.dart';
import '../theme/booking_colors.dart';

class YellowSearchBox extends StatelessWidget {
  final List<Widget> children;
  final VoidCallback onSearch;
  final String buttonText;

  const YellowSearchBox({
    super.key,
    required this.children,
    required this.onSearch,
    this.buttonText = 'Buscar',
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: BookingColors.accentYellow,
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.16),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
        border: Border.all(color: BookingColors.accentYellow, width: 4),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ...children.map((child) => Container(
                margin: const EdgeInsets.only(bottom: 3),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: child,
              )),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed: onSearch,
              style: ElevatedButton.styleFrom(
                backgroundColor: BookingColors.actionBlue,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(4),
                ),
                elevation: 0,
              ),
              child: Text(
                buttonText,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
