import 'package:flutter/material.dart';
import 'layout/layout_helpers.dart';
import 'widgets/modules/clock_module.dart';
import 'widgets/modules/weather_module.dart';
import 'widgets/modules/ha_module.dart';
import 'widgets/modules/calendar_module.dart';
import 'widgets/modules/daily_brief_module.dart';
import 'widgets/modules/travel_time_module.dart';

/// The central registry for all Mirrorial Modules.
/// To add a 3rd-party module:
/// 1. Import your module file above.
/// 2. Add a new switch case below matching your module's JSON 'type' name.
Widget buildModuleFromRegistry(
  String type,
  Map<String, dynamic> config, {
  ModuleLayoutData? layoutData,
  Map<String, dynamic>? rootConfig,
}) {
  switch (type) {
    case 'clock':
      return ClockModule(config: config, layoutData: layoutData, rootConfig: rootConfig);
    case 'weather':
      return WeatherModule(config: config, layoutData: layoutData, rootConfig: rootConfig);
    case 'home_assistant':
      return HomeAssistantModule(config: config, layoutData: layoutData);
    case 'calendar':
      return CalendarModule(config: config, layoutData: layoutData, rootConfig: rootConfig);
    case 'daily_brief':
      return DailyBriefModule(config: config, layoutData: layoutData, rootConfig: rootConfig);
    case 'travel_time':
      return TravelTimeModule(config: config, layoutData: layoutData, rootConfig: rootConfig);
      
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
