import 'package:flutter_test/flutter_test.dart';
import 'package:mirrorial_display/services/display_preferences.dart';

void main() {
  test('display preferences default to English and 24h', () {
    expect(resolveDisplayLocale(null), 'en');
    expect(resolveUse24HourFormat(null, null), true);
  });

  test('address-like locations are only allowed for useful destinations', () {
    expect(shouldAllowAddressLikeLocation('Schottmüllerstr. 15, Hamburg', null), false);
    expect(shouldAllowAddressLikeLocation('UKE hospital, Martinistrasse 52, Hamburg', null), true);
    expect(
      shouldAllowAddressLikeLocation(
        'Karolinenstrasse 8, Hamburg',
        {
          'services': {
            'context': {
              'usefulLocationWhitelist': ['karolinenstrasse'],
            },
          },
        },
      ),
      true,
    );
  });
}
