import 'package:flutter/material.dart';
import 'widgets/modules/clock_module.dart';
import 'widgets/modules/weather_module.dart';
import 'widgets/modules/ha_module.dart';
import 'widgets/modules/calendar_module.dart';

/// The central registry for all Mirrorial Modules.
/// To add a 3rd-party module:
/// 1. Import your module file above.
/// 2. Add a new switch case below matching your module's JSON 'type' name.
Widget buildModuleFromRegistry(String type, Map config) {
  switch (type) {
    case 'clock':
      return ClockModule(config: config);
    case 'weather':
      return WeatherModule(config: config);
    case 'home_assistant':
      return HomeAssistantModule(config: config);
    case 'calendar':
      return CalendarModule(config: config);
      
    // -----------------------------------------
    // ADD 3RD-PARTY MODULES BELOW THIS LINE
    // case 'my_custom_module':
    //   return MyCustomModule(config: config);
    // -----------------------------------------
    
    default:
      return Center(
        child: Text(
          'Unknown Module: $type',
          style: const TextStyle(color: Colors.redAccent, fontSize: 12),
        ),
      );
  }
}
