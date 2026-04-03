import 'package:flutter_test/flutter_test.dart';
import 'package:mirrorial_display/services/display_preferences.dart';

void main() {
  test('display preferences default to English and 24h', () {
    expect(resolveDisplayLocale(null), 'en');
    expect(resolveUse24HourFormat(null, null), true);
  });

  test('address-like locations are only allowed for useful destinations', () {
    expect(shouldAllowAddressLikeLocation('Beispielstr. 15, Musterstadt', null), false);
    expect(shouldAllowAddressLikeLocation('City Hospital, Klinikstrasse 52, Musterstadt', null), true);
    expect(
      shouldAllowAddressLikeLocation(
        'Beispielallee 8, Musterstadt',
        {
          'services': {
            'context': {
              'usefulLocationWhitelist': ['beispielallee'],
            },
          },
        },
      ),
      true,
    );
  });
}
