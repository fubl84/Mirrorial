import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class ClockModule extends StatelessWidget {
  final Map config;

  const ClockModule({super.key, required this.config});

  @override
  Widget build(BuildContext context) {
    final format = config['format'] == '24h' ? 'HH:mm' : 'hh:mm';
    final showSeconds = config['showSeconds'] ?? false;
    final finalFormat = showSeconds ? '$format:ss' : format;

    return StreamBuilder(
      stream: Stream.periodic(const Duration(seconds: 1)),
      builder: (context, snapshot) {
        final now = DateTime.now();
        final timeString = DateFormat(finalFormat).format(now);
        final dateString = DateFormat('EEEE, d. MMMM').format(now);

        return Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              timeString,
              style: Theme.of(context).textTheme.displayLarge,
            ),
            Text(
              dateString,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        );
      },
    );
  }
}
