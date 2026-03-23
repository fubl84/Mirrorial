import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../layout/layout_helpers.dart';
import '../../services/display_preferences.dart';
import '../../services/weather_service.dart';

class WeatherModule extends ConsumerWidget {
  final Map config;
  final ModuleLayoutData? layoutData;
  final Map<String, dynamic>? rootConfig;

  const WeatherModule({super.key, required this.config, this.layoutData, this.rootConfig});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final weatherAsync = ref.watch(weatherProvider);
    final locale = resolveDisplayLocale(rootConfig);

    return weatherAsync.when(
      data: (weather) {
        if (weather == null) {
          return Text(
            translateDisplayLabel('configure_weather', locale),
            style: const TextStyle(color: Colors.grey),
          );
        }

        return LayoutBuilder(
          builder: (context, constraints) {
            final variant = _resolveWeatherVariant(constraints, layoutData);
            final forecastCount = _forecastCountForVariant(variant, constraints.maxWidth, weather.forecast.length);
            final align = layoutData?.align ?? 'stretch';

            return AnimatedSwitcher(
              duration: const Duration(milliseconds: 450),
              child: switch (variant) {
                _WeatherVariant.compact => _CompactWeather(
                    key: const ValueKey('weather-compact'),
                    weather: weather,
                    locale: locale,
                    align: align,
                  ),
                _WeatherVariant.card => _WeatherCardLayout(
                    key: const ValueKey('weather-card'),
                    weather: weather,
                    locale: locale,
                    forecastCount: forecastCount,
                    wideMode: false,
                    align: align,
                  ),
                _WeatherVariant.panorama => _WeatherCardLayout(
                    key: const ValueKey('weather-panorama'),
                    weather: weather,
                    locale: locale,
                    forecastCount: forecastCount,
                    wideMode: true,
                    align: align,
                  ),
                _WeatherVariant.hero => _WeatherHeroLayout(
                    key: const ValueKey('weather-hero'),
                    weather: weather,
                    locale: locale,
                    forecastCount: forecastCount,
                    align: align,
                  ),
              },
            );
          },
        );
      },
      loading: () => const Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))),
      error: (e, st) => const Icon(Icons.error_outline, color: Colors.red),
    );
  }
}

enum _WeatherVariant { compact, card, panorama, hero }

_WeatherVariant _resolveWeatherVariant(BoxConstraints constraints, ModuleLayoutData? layoutData) {
  final width = constraints.maxWidth.isFinite ? constraints.maxWidth : (layoutData?.bounds.width ?? 0);
  final height = constraints.maxHeight.isFinite ? constraints.maxHeight : (layoutData?.bounds.height ?? 0);
  final aspect = width / math.max(height, 1);

  if ((layoutData?.density ?? ModuleVisualDensity.medium) == ModuleVisualDensity.compact || height < 140) {
    return _WeatherVariant.compact;
  }
  if (aspect >= 2.2) {
    return _WeatherVariant.panorama;
  }
  if ((layoutData?.density ?? ModuleVisualDensity.medium) == ModuleVisualDensity.expanded && height >= 340) {
    return _WeatherVariant.hero;
  }
  return _WeatherVariant.card;
}

int _forecastCountForVariant(_WeatherVariant variant, double width, int availableItems) {
  if (availableItems <= 0) {
    return 0;
  }

  switch (variant) {
    case _WeatherVariant.compact:
      return 0;
    case _WeatherVariant.card:
      return math.min(3, availableItems);
    case _WeatherVariant.panorama:
      return math.min(width >= 1100 ? 7 : 5, availableItems);
    case _WeatherVariant.hero:
      return math.min(width >= 900 ? 6 : 5, availableItems);
  }
}

class _CompactWeather extends StatelessWidget {
  final WeatherData weather;
  final String locale;
  final String align;

  const _CompactWeather({super.key, required this.weather, required this.locale, required this.align});

  @override
  Widget build(BuildContext context) {
    return _AlignedWeatherBlock(
      align: align,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _AnimatedWeatherHeroIcon(kind: weather.visualKind, size: 46),
          const SizedBox(width: 12),
          Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '${weather.temp.round()}°',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      color: Theme.of(context).textTheme.displayLarge?.color,
                      fontWeight: FontWeight.w700,
                    ),
              ),
              Text(
                _localizedCondition(weather.condition, locale),
                style: Theme.of(context).textTheme.bodyMedium,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _WeatherCardLayout extends StatelessWidget {
  final WeatherData weather;
  final String locale;
  final int forecastCount;
  final bool wideMode;
  final String align;

  const _WeatherCardLayout({
    super.key,
    required this.weather,
    required this.locale,
    required this.forecastCount,
    required this.wideMode,
    required this.align,
  });

  @override
  Widget build(BuildContext context) {
    final forecast = weather.forecast.take(forecastCount).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _HeroAndChangeBlock(
          weather: weather,
          locale: locale,
          iconSize: wideMode ? 86 : 74,
          tempFontSize: wideMode ? 58 : 50,
          align: align,
        ),
        if (forecast.isNotEmpty) ...[
          const SizedBox(height: 16),
          Expanded(
            child: _ForecastRow(
              items: forecast,
              locale: locale,
              largeCards: wideMode,
            ),
          ),
        ],
      ],
    );
  }
}

class _WeatherHeroLayout extends StatelessWidget {
  final WeatherData weather;
  final String locale;
  final int forecastCount;
  final String align;

  const _WeatherHeroLayout({
    super.key,
    required this.weather,
    required this.locale,
    required this.forecastCount,
    required this.align,
  });

  @override
  Widget build(BuildContext context) {
    final forecast = weather.forecast.take(forecastCount).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _HeroAndChangeBlock(
          weather: weather,
          locale: locale,
          iconSize: 96,
          tempFontSize: 64,
          align: align,
        ),
        if (forecast.isNotEmpty) ...[
          const SizedBox(height: 18),
          Text(translateDisplayLabel('forecast', locale), style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          Expanded(
            child: _ForecastRow(
              items: forecast,
              locale: locale,
              largeCards: true,
            ),
          ),
        ],
      ],
    );
  }
}

class _HeroAndChangeBlock extends StatelessWidget {
  final WeatherData weather;
  final String locale;
  final double iconSize;
  final double tempFontSize;
  final String align;

  const _HeroAndChangeBlock({
    required this.weather,
    required this.locale,
    required this.iconSize,
    required this.tempFontSize,
    required this.align,
  });

  @override
  Widget build(BuildContext context) {
    final weatherHero = _CurrentWeatherHero(
      weather: weather,
      locale: locale,
      iconSize: iconSize,
      tempFontSize: tempFontSize,
    );
    final upcoming = weather.upcomingChange != null
        ? _UpcomingChangeChip(change: weather.upcomingChange!, locale: locale)
        : null;

    final heroGroup = LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 760;
        if (upcoming == null) {
          return weatherHero;
        }
        if (wide) {
          return Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              weatherHero,
              const SizedBox(width: 16),
              upcoming,
            ],
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            weatherHero,
            const SizedBox(height: 12),
            upcoming,
          ],
        );
      },
    );

    return _AlignedWeatherBlock(
      align: align,
      child: heroGroup,
    );
  }
}

class _CurrentWeatherHero extends StatelessWidget {
  final WeatherData weather;
  final String locale;
  final double iconSize;
  final double tempFontSize;

  const _CurrentWeatherHero({
    required this.weather,
    required this.locale,
    required this.iconSize,
    required this.tempFontSize,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        _AnimatedWeatherHeroIcon(kind: weather.visualKind, size: iconSize),
        const SizedBox(width: 14),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              weather.locationLabel,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 3),
            Text(
              _localizedCondition(weather.condition, locale),
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontSize: 15),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '${weather.temp.round()}°',
              style: Theme.of(context).textTheme.displayLarge?.copyWith(
                    fontSize: tempFontSize,
                    fontWeight: FontWeight.w700,
                    height: 0.92,
                  ),
            ),
            if (weather.feelsLike != null)
              Text(
                '${translateDisplayLabel('feels_like', locale)} ${weather.feelsLike!.round()}°',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      fontSize: 16,
                      color: Theme.of(context).textTheme.bodyMedium?.color,
                    ),
              ),
          ],
        ),
      ],
    );
  }
}

class _AlignedWeatherBlock extends StatelessWidget {
  final String align;
  final Widget child;

  const _AlignedWeatherBlock({required this.align, required this.child});

  @override
  Widget build(BuildContext context) {
    final alignment = switch (align) {
      'center' => Alignment.center,
      'end' => Alignment.centerRight,
      _ => Alignment.centerLeft,
    };

    return Align(
      alignment: alignment,
      child: child,
    );
  }
}

class _UpcomingChangeChip extends StatelessWidget {
  final WeatherUpcomingChange change;
  final String locale;

  const _UpcomingChangeChip({required this.change, required this.locale});

  @override
  Widget build(BuildContext context) {
    final label = _buildUpcomingChangeLabel(change, locale);

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 260),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Theme.of(context).iconTheme.color?.withValues(alpha: 0.22) ?? Colors.white12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Icon(Icons.schedule_rounded, size: 15, color: Theme.of(context).iconTheme.color),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontSize: 13, height: 1.2),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ForecastRow extends StatelessWidget {
  final List<WeatherForecastItem> items;
  final String locale;
  final bool largeCards;

  const _ForecastRow({
    required this.items,
    required this.locale,
    required this.largeCards,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final spacing = items.length >= 6 ? 8.0 : 10.0;
        final cardWidth = (constraints.maxWidth - ((items.length - 1) * spacing)) / items.length;
        final cardHeight = constraints.maxHeight;
        final iconSize = math.min(cardHeight * 0.28, cardWidth * 0.32).clamp(24.0, largeCards ? 40.0 : 34.0);
        final dayFontSize = math.min(cardHeight * 0.11, cardWidth * 0.16).clamp(12.0, largeCards ? 16.0 : 14.0);
        final highFontSize = math.min(cardHeight * 0.18, cardWidth * 0.2).clamp(18.0, largeCards ? 28.0 : 22.0);
        final lowFontSize = math.min(cardHeight * 0.11, cardWidth * 0.14).clamp(12.0, largeCards ? 16.0 : 14.0);

        return Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: items.asMap().entries.map((entry) {
            final index = entry.key;
            final item = entry.value;

            return Expanded(
              child: Container(
                margin: EdgeInsets.only(right: index == items.length - 1 ? 0 : spacing),
                padding: EdgeInsets.symmetric(vertical: largeCards ? 16 : 14, horizontal: largeCards ? 12 : 10),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.045),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      DateFormat('E', locale).format(item.date),
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontSize: dayFontSize,
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    SizedBox(height: math.max(8, cardHeight * 0.06)),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        _StaticWeatherGlyph(kind: item.visualKind, size: iconSize),
                        SizedBox(width: math.max(8, cardWidth * 0.05)),
                        Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${item.maxTemp.round()}°',
                              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    fontSize: highFontSize,
                                    height: 1.0,
                                  ),
                            ),
                            Text(
                              '${item.minTemp.round()}°',
                              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                    fontSize: lowFontSize,
                                    height: 1.0,
                                  ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          }).toList(),
        );
      },
    );
  }
}

class _AnimatedWeatherHeroIcon extends StatefulWidget {
  final String kind;
  final double size;

  const _AnimatedWeatherHeroIcon({required this.kind, required this.size});

  @override
  State<_AnimatedWeatherHeroIcon> createState() => _AnimatedWeatherHeroIconState();
}

class _AnimatedWeatherHeroIconState extends State<_AnimatedWeatherHeroIcon> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(seconds: 4))..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) => _WeatherGlyph(
        kind: widget.kind,
        size: widget.size,
        progress: _controller.value,
      ),
    );
  }
}

class _StaticWeatherGlyph extends StatelessWidget {
  final String kind;
  final double size;

  const _StaticWeatherGlyph({required this.kind, required this.size});

  @override
  Widget build(BuildContext context) {
    return _WeatherGlyph(kind: kind, size: size, progress: 0.35);
  }
}

class _WeatherGlyph extends StatelessWidget {
  final String kind;
  final double size;
  final double progress;

  const _WeatherGlyph({
    required this.kind,
    required this.size,
    required this.progress,
  });

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).iconTheme.color ?? const Color(0xFF8B5CF6);

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: switch (kind) {
          'clear' => _buildClear(accent),
          'partly_cloudy' => _buildPartlyCloudy(accent),
          'cloudy' => _buildCloudy(accent),
          'rain' => _buildRain(accent),
          'snow' => _buildSnow(accent),
          'storm' => _buildStorm(accent),
          'fog' => _buildFog(accent),
          _ => _buildClear(accent),
        },
      ),
    );
  }

  List<Widget> _buildClear(Color accent) {
    final rayScale = 0.96 + (0.04 * math.sin(progress * math.pi * 2));
    final glowOpacity = 0.14 + (0.04 * math.sin(progress * math.pi * 2));

    return [
      Transform.scale(
        scale: rayScale,
        child: Container(
          width: size * 0.68,
          height: size * 0.68,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFFBBF24).withValues(alpha: glowOpacity),
                blurRadius: size * 0.14,
                spreadRadius: size * 0.02,
              ),
            ],
            gradient: const RadialGradient(
              colors: [
                Color(0xFFFDE68A),
                Color(0xFFFBBF24),
              ],
            ),
          ),
        ),
      ),
      ...List.generate(6, (index) {
        final angle = ((math.pi * 2) / 6) * index + (progress * 0.6);
        return Positioned(
          left: (size * 0.5) + math.cos(angle) * (size * 0.29) - (size * 0.024),
          top: (size * 0.5) + math.sin(angle) * (size * 0.29) - (size * 0.024),
          child: Container(
            width: size * 0.048,
            height: size * 0.11,
            decoration: BoxDecoration(
              color: const Color(0xFFFCD34D).withValues(alpha: 0.85),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
        );
      }),
    ];
  }

  List<Widget> _buildPartlyCloudy(Color accent) {
    return [
      Positioned(
        left: size * 0.02,
        top: size * 0.02,
        child: Transform.scale(
          scale: 0.95 + (0.08 * math.sin(progress * math.pi * 2)),
          child: Icon(Icons.wb_sunny_rounded, size: size * 0.54, color: const Color(0xFFFBBF24)),
        ),
      ),
      Positioned(
        left: size * 0.14 + (math.sin(progress * math.pi * 2) * 2),
        top: size * 0.24,
        child: Icon(Icons.cloud_rounded, size: size * 0.74, color: Colors.white.withValues(alpha: 0.88)),
      ),
    ];
  }

  List<Widget> _buildCloudy(Color accent) {
    return [
      Positioned(
        left: size * 0.04 + (math.sin(progress * math.pi * 2) * 2.5),
        top: size * 0.18,
        child: Icon(Icons.cloud_rounded, size: size * 0.76, color: Colors.white.withValues(alpha: 0.82)),
      ),
      Positioned(
        left: size * 0.18 - (math.sin(progress * math.pi * 2) * 2),
        top: size * 0.28,
        child: Icon(Icons.cloud_rounded, size: size * 0.58, color: Colors.white.withValues(alpha: 0.58)),
      ),
    ];
  }

  List<Widget> _buildRain(Color accent) {
    final offset = (progress * size * 0.18) % (size * 0.18);

    return [
      Positioned(
        top: size * 0.12,
        child: Icon(Icons.cloud_rounded, size: size * 0.76, color: Colors.white.withValues(alpha: 0.84)),
      ),
      ...List.generate(3, (index) {
        final leftBase = size * (0.26 + (index * 0.16));
        return Positioned(
          left: leftBase,
          top: size * 0.58 + offset,
          child: Container(
            width: size * 0.05,
            height: size * 0.14,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.9),
              borderRadius: BorderRadius.circular(99),
            ),
          ),
        );
      }),
    ];
  }

  List<Widget> _buildSnow(Color accent) {
    final drift = math.sin(progress * math.pi * 2) * 3;

    return [
      Positioned(
        top: size * 0.12,
        child: Icon(Icons.cloud_rounded, size: size * 0.76, color: Colors.white.withValues(alpha: 0.84)),
      ),
      ...List.generate(3, (index) {
        final topBase = size * (0.62 + (index.isEven ? 0 : 0.06));
        return Positioned(
          left: size * (0.24 + (index * 0.18)) + drift,
          top: topBase,
          child: Icon(Icons.circle, size: size * 0.07, color: Colors.white.withValues(alpha: 0.92)),
        );
      }),
    ];
  }

  List<Widget> _buildStorm(Color accent) {
    final flash = progress > 0.82 ? 1.0 : 0.0;

    return [
      Positioned(
        top: size * 0.1,
        child: Icon(Icons.cloud_rounded, size: size * 0.76, color: Colors.white.withValues(alpha: 0.84)),
      ),
      Positioned(
        top: size * 0.44,
        child: Opacity(
          opacity: 0.75 + (flash * 0.25),
          child: Icon(Icons.bolt_rounded, size: size * 0.34, color: const Color(0xFFFDE047)),
        ),
      ),
    ];
  }

  List<Widget> _buildFog(Color accent) {
    final drift = math.sin(progress * math.pi * 2) * 5;
    return [
      Positioned(
        top: size * 0.1,
        child: Icon(Icons.cloud_rounded, size: size * 0.64, color: Colors.white.withValues(alpha: 0.68)),
      ),
      ...[0.54, 0.7].map((factor) {
        return Positioned(
          left: size * 0.1 + drift,
          top: size * factor,
          child: Container(
            width: size * 0.72,
            height: size * 0.06,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.4),
              borderRadius: BorderRadius.circular(99),
            ),
          ),
        );
      }),
    ];
  }
}

String _localizedCondition(String condition, String locale) {
  if (locale != 'de') {
    return condition;
  }

  const labels = {
    'Clear': 'Klar',
    'Partly cloudy': 'Leicht bewölkt',
    'Cloudy': 'Bewölkt',
    'Fog': 'Nebel',
    'Rain': 'Regen',
    'Snow': 'Schnee',
    'Storm': 'Gewitter',
  };

  return labels[condition] ?? condition;
}

String _buildUpcomingChangeLabel(WeatherUpcomingChange change, String locale) {
  final hours = change.hoursUntil;
  final timeLabel = locale == 'de' ? 'in ~$hours Std.' : 'in ~$hours h';

  if (locale == 'de') {
    return switch (change.code) {
      'rain_start' => 'Regen $timeLabel',
      'rain_continues' => 'Regen hält an $timeLabel',
      'snow_start' => 'Schnee $timeLabel',
      'snow_continues' => 'Schnee hält an $timeLabel',
      'storm_start' => 'Gewitterrisiko $timeLabel',
      'fog_start' => 'Nebel $timeLabel',
      'fog_lifts' => 'Nebel lichtet sich $timeLabel',
      'some_clouds' => 'Erste Wolken $timeLabel',
      'clouds_increase' => 'Mehr Wolken $timeLabel',
      'clouds_thicken' => 'Wolken werden dichter $timeLabel',
      'clouds_break' => 'Wolken lockern auf $timeLabel',
      'precipitation_eases' => 'Niederschlag lässt nach $timeLabel',
      'clearing' => 'Es klart auf $timeLabel',
      _ => 'Wetterumschwung $timeLabel',
    };
  }

  return switch (change.code) {
    'rain_start' => 'Rain $timeLabel',
    'rain_continues' => 'Rain continues $timeLabel',
    'snow_start' => 'Snow $timeLabel',
    'snow_continues' => 'Snow continues $timeLabel',
    'storm_start' => 'Storm risk $timeLabel',
    'fog_start' => 'Fog $timeLabel',
    'fog_lifts' => 'Fog lifting $timeLabel',
    'some_clouds' => 'Some clouds $timeLabel',
    'clouds_increase' => 'More clouds $timeLabel',
    'clouds_thicken' => 'Clouds thicken $timeLabel',
    'clouds_break' => 'Clouds break up $timeLabel',
    'precipitation_eases' => 'Rain easing $timeLabel',
    'clearing' => 'Clearing skies $timeLabel',
    _ => 'Conditions shift $timeLabel',
  };
}
