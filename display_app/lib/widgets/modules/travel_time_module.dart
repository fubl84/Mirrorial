import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../layout/layout_helpers.dart';
import '../../services/display_preferences.dart';
import '../../services/travel_time_service.dart';

class TravelTimeModule extends ConsumerWidget {
  final Map config;
  final ModuleLayoutData? layoutData;
  final Map<String, dynamic>? rootConfig;

  const TravelTimeModule({super.key, required this.config, this.layoutData, this.rootConfig});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final service = ref.watch(travelTimeServiceProvider);
    final items = (config['items'] as List? ?? []);
    final locale = resolveDisplayLocale(rootConfig);
    final use24HourFormat = resolveUse24HourFormat(config, rootConfig);

    return StreamBuilder<TravelTimeSnapshot>(
      stream: service.watchItems(items),
      builder: (context, snapshot) {
        final travelSnapshot = snapshot.data ?? TravelTimeSnapshot(updatedAt: null, items: const <TravelTimeItem>[]);
        final routes = travelSnapshot.items;
        if (routes.isEmpty) {
          return Align(
            alignment: Alignment.topLeft,
            child: Text(
              'Configure Travel Time routes in the Remote UI.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          );
        }

        final density = layoutData?.density ?? ModuleVisualDensity.medium;

        return LayoutBuilder(
          builder: (context, constraints) {
            final width = constraints.maxWidth.isFinite ? constraints.maxWidth : (layoutData?.bounds.width ?? 320);
            final height = constraints.maxHeight.isFinite ? constraints.maxHeight : (layoutData?.bounds.height ?? 180);
            final updatedLabel = travelSnapshot.updatedAt != null
                ? '${translateDisplayLabel('updated', locale)} ${formatClockTime(DateTime.parse(travelSnapshot.updatedAt!).toLocal(), locale, use24HourFormat: use24HourFormat)}'
                : null;
            final gridPlan = _resolveGridPlan(
              width: width,
              height: height,
              itemCount: routes.length,
              density: density,
              hasUpdatedLabel: updatedLabel != null,
            );

            return SizedBox.expand(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (updatedLabel != null) ...[
                    Align(
                      alignment: Alignment.topRight,
                      child: Padding(
                        padding: EdgeInsets.only(bottom: gridPlan.labelSpacing),
                        child: Text(
                          updatedLabel,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: Colors.white54,
                                fontSize: gridPlan.timestampFontSize,
                              ),
                        ),
                      ),
                    ),
                  ],
                  Expanded(
                    child: Wrap(
                      spacing: gridPlan.spacing,
                      runSpacing: gridPlan.spacing,
                      children: routes.map((route) => SizedBox(
                        width: gridPlan.cardWidth,
                        height: gridPlan.cardHeight,
                        child: _TravelTimeCompactCard(
                          route: route,
                          density: density,
                          cardHeight: gridPlan.cardHeight,
                          locale: locale,
                        ),
                      )).toList(),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

class _TravelGridPlan {
  final double spacing;
  final int columns;
  final int rows;
  final double cardWidth;
  final double cardHeight;
  final double labelSpacing;
  final double timestampFontSize;

  const _TravelGridPlan({
    required this.spacing,
    required this.columns,
    required this.rows,
    required this.cardWidth,
    required this.cardHeight,
    required this.labelSpacing,
    required this.timestampFontSize,
  });
}

_TravelGridPlan _resolveGridPlan({
  required double width,
  required double height,
  required int itemCount,
  required ModuleVisualDensity density,
  required bool hasUpdatedLabel,
}) {
  final safeCount = itemCount.clamp(1, 12);
  final spacing = density == ModuleVisualDensity.compact ? 8.0 : 12.0;
  final labelHeight = hasUpdatedLabel ? (density == ModuleVisualDensity.compact ? 14.0 : 16.0) : 0.0;
  final labelSpacing = hasUpdatedLabel ? (density == ModuleVisualDensity.compact ? 6.0 : 10.0) : 0.0;
  final usableHeight = (height - labelHeight - labelSpacing).clamp(60.0, height).toDouble();
  final maxColumns = density == ModuleVisualDensity.expanded
      ? (width >= 900 ? 4 : width >= 600 ? 3 : 2)
      : (density == ModuleVisualDensity.medium
          ? (width >= 620 ? 3 : width >= 320 ? 2 : 1)
          : (width >= 320 ? 2 : 1));
  final minCardWidth = density == ModuleVisualDensity.compact ? 120.0 : 140.0;
  final minCardHeight = usableHeight < 110 ? 54.0 : 72.0;

  _TravelGridPlan? selected;

  for (var columns = maxColumns.clamp(1, safeCount); columns >= 1; columns--) {
    final rows = (safeCount / columns).ceil();
    final cardWidth = ((width - (spacing * (columns - 1))) / columns).clamp(96.0, width).toDouble();
    final cardHeight = ((usableHeight - (spacing * (rows - 1))) / rows).clamp(48.0, usableHeight).toDouble();
    final candidate = _TravelGridPlan(
      spacing: spacing,
      columns: columns,
      rows: rows,
      cardWidth: cardWidth,
      cardHeight: cardHeight,
      labelSpacing: labelSpacing,
      timestampFontSize: density == ModuleVisualDensity.compact ? 10 : 11,
    );

    if (cardWidth >= minCardWidth && cardHeight >= minCardHeight) {
      return candidate;
    }

    selected ??= candidate;
  }

  return selected ??
      _TravelGridPlan(
        spacing: spacing,
        columns: 1,
        rows: safeCount,
        cardWidth: width,
        cardHeight: (usableHeight / safeCount).clamp(48.0, usableHeight).toDouble(),
        labelSpacing: labelSpacing,
        timestampFontSize: density == ModuleVisualDensity.compact ? 10 : 11,
      );
}

Color _trafficColor(String value) {
  switch (value) {
    case 'red':
      return const Color(0xFFF87171);
    case 'orange':
      return const Color(0xFFFBBF24);
    case 'green':
      return const Color(0xFF34D399);
    default:
      return const Color(0xFF94A3B8);
  }
}

Color _modeColor(String value) {
  switch (value) {
    case 'bike':
      return const Color(0xFF38BDF8);
    case 'walk':
      return const Color(0xFF22C55E);
    case 'public_transport':
      return const Color(0xFFA78BFA);
    default:
      return const Color(0xFFF59E0B);
  }
}

String _modeLabel(String value, String locale) {
  switch (value) {
    case 'bike':
      return translateDisplayLabel('travel_bike', locale);
    case 'walk':
      return translateDisplayLabel('travel_walk', locale);
    case 'public_transport':
      return translateDisplayLabel('travel_transit', locale);
    default:
      return translateDisplayLabel('travel_car', locale);
  }
}

String _transitVehicleLabel(String vehicleType, String locale) {
  switch (vehicleType) {
    case 'BUS':
      return translateDisplayLabel('transit_bus', locale);
    case 'SUBWAY':
    case 'METRO_RAIL':
      return translateDisplayLabel('transit_tube', locale);
    case 'COMMUTER_TRAIN':
      return translateDisplayLabel('transit_suburban_train', locale);
    case 'TRAM':
    case 'LIGHT_RAIL':
      return translateDisplayLabel('transit_tram', locale);
    case 'FERRY':
      return translateDisplayLabel('transit_ferry', locale);
    case 'HIGH_SPEED_TRAIN':
    case 'LONG_DISTANCE_TRAIN':
    case 'HEAVY_RAIL':
    case 'RAIL':
    case 'TRAIN':
      return translateDisplayLabel('transit_train', locale);
    default:
      return '';
  }
}

String _formatTransitLineLabel(TransitLineDetail detail, String locale) {
  final vehicleLabel = _transitVehicleLabel(detail.vehicleType, locale);
  final rawLabel = detail.label.trim();
  if (rawLabel.isEmpty) {
    return vehicleLabel;
  }
  if (vehicleLabel.isEmpty) {
    return rawLabel;
  }

  final normalized = rawLabel.toLowerCase();
  final vehicleNormalized = vehicleLabel.toLowerCase();
  if (normalized.startsWith(vehicleNormalized)) {
    return rawLabel;
  }

  return '$vehicleLabel $rawLabel';
}

class _TravelTimeCompactCard extends StatelessWidget {
  final TravelTimeItem route;
  final ModuleVisualDensity density;
  final double cardHeight;
  final String locale;

  const _TravelTimeCompactCard({required this.route, required this.density, required this.cardHeight, required this.locale});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final effectiveHeight = constraints.maxHeight.isFinite ? constraints.maxHeight : cardHeight;
        final indicatorColor = _trafficColor(route.trafficSeverity);
        final modeColor = _modeColor(route.mode);
        final compact = density == ModuleVisualDensity.compact || effectiveHeight <= 120;
        final wideCompact = effectiveHeight <= 128;
        final ultraCompact = effectiveHeight <= 72;
        final titleStyle = Theme.of(context).textTheme.titleLarge?.copyWith(
              color: Colors.white,
              fontSize: ultraCompact ? 10.5 : (compact ? 12 : 16),
              fontWeight: FontWeight.w700,
            );
        final durationStyle = Theme.of(context).textTheme.displayLarge?.copyWith(
              color: route.trafficSeverity == 'neutral' ? Colors.white : indicatorColor,
              fontSize: ultraCompact ? 15 : (compact ? 22 : 34),
              fontWeight: FontWeight.w800,
              height: 0.95,
            );
        final transitLines = route.mode == 'public_transport'
            ? (route.lineDetailsDetailed.isNotEmpty
                ? route.lineDetailsDetailed.map((detail) => _formatTransitLineLabel(detail, locale)).where((entry) => entry.isNotEmpty).join(', ')
                : route.lineDetails.join(', '))
            : null;

        final durationText = route.durationMinutes != null ? '${route.durationMinutes}m' : '--';
        final footerText = transitLines ??
            (route.trafficDelayMinutes != null && route.trafficDelayMinutes! > 0
                ? '+${route.trafficDelayMinutes} min ${translateDisplayLabel('travel_traffic_delay', locale)}'
                : (route.status == 'unsupported_provider'
                    ? translateDisplayLabel('travel_provider_needed', locale)
                    : (route.status == 'missing_location'
                        ? translateDisplayLabel('travel_check_route', locale)
                        : translateDisplayLabel('travel_on_time', locale))));

        return Container(
          clipBehavior: Clip.antiAlias,
          padding: EdgeInsets.symmetric(
            horizontal: ultraCompact ? 8 : (compact ? 10 : 14),
            vertical: ultraCompact ? 6 : (compact ? 8 : 14),
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            color: Colors.white.withValues(alpha: 0.05),
            border: Border.all(color: indicatorColor.withValues(alpha: 0.45)),
          ),
          child: wideCompact
              ? _buildWideCompactCard(
                  context,
                  modeColor: modeColor,
                  indicatorColor: indicatorColor,
                  titleStyle: titleStyle,
                  durationStyle: durationStyle,
                  durationText: durationText,
                  footerText: footerText,
                  compactHeight: compact,
                  ultraCompact: ultraCompact,
                )
              : _buildRegularCard(
                  context,
                  modeColor: modeColor,
                  indicatorColor: indicatorColor,
                  titleStyle: titleStyle,
                  durationStyle: durationStyle,
                  durationText: durationText,
                  footerText: footerText,
                  ultraCompact: false,
                  compact: compact,
                ),
        );
      },
    );
  }

  Widget _buildRegularCard(
    BuildContext context, {
    required Color modeColor,
    required Color indicatorColor,
    required TextStyle? titleStyle,
    required TextStyle? durationStyle,
    required String durationText,
    required String footerText,
    required bool ultraCompact,
    required bool compact,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildModePill(context, modeColor, ultraCompact, compact),
                  SizedBox(height: ultraCompact ? 5 : (compact ? 6 : 10)),
                  Text(
                    route.label,
                    style: titleStyle,
                    maxLines: ultraCompact ? 1 : 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            _buildTrafficDot(indicatorColor, compact),
          ],
        ),
        const Spacer(),
        Text(durationText, style: durationStyle),
        SizedBox(height: ultraCompact ? 3 : (compact ? 6 : 10)),
        Text(
          footerText,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: route.status == 'unsupported_provider' || route.status == 'missing_location'
                    ? const Color(0xFFFDE68A)
                    : Colors.white70,
                fontSize: ultraCompact ? 9 : (compact ? 10 : 12),
              ),
          maxLines: ultraCompact ? 1 : 2,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }

  Widget _buildWideCompactCard(
    BuildContext context, {
    required Color modeColor,
    required Color indicatorColor,
    required TextStyle? titleStyle,
    required TextStyle? durationStyle,
    required String durationText,
    required String footerText,
    required bool compactHeight,
    required bool ultraCompact,
  }) {
    final subtitleStyle = Theme.of(context).textTheme.bodySmall?.copyWith(
          color: route.status == 'unsupported_provider' || route.status == 'missing_location'
              ? const Color(0xFFFDE68A)
              : Colors.white60,
          fontSize: ultraCompact ? 8.5 : 10,
        );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Row(
                children: [
                  Flexible(child: _buildModePill(context, modeColor, true, true)),
                  const SizedBox(width: 6),
                  _buildTrafficDot(indicatorColor, compactHeight),
                ],
              ),
              SizedBox(height: ultraCompact ? 4 : 6),
              Text(
                route.label,
                style: titleStyle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (!ultraCompact) ...[
                const SizedBox(height: 2),
                Text(
                  footerText,
                  style: subtitleStyle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ),
        const SizedBox(width: 8),
        ConstrainedBox(
          constraints: BoxConstraints(maxWidth: ultraCompact ? 54 : 72),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerRight,
            child: Text(durationText, style: durationStyle),
          ),
        ),
      ],
    );
  }

  Widget _buildModePill(BuildContext context, Color modeColor, bool ultraCompact, bool compact) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: ultraCompact ? 6 : (compact ? 7 : 9),
        vertical: ultraCompact ? 3 : (compact ? 4 : 5),
      ),
      decoration: BoxDecoration(
        color: modeColor.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: modeColor.withValues(alpha: 0.42)),
      ),
      child: Text(
        _modeLabel(route.mode, locale),
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: modeColor,
              fontSize: ultraCompact ? 9 : (compact ? 10 : 11),
              fontWeight: FontWeight.w700,
              letterSpacing: 0.1,
            ),
      ),
    );
  }

  Widget _buildTrafficDot(Color indicatorColor, bool compact) {
    return Container(
      width: compact ? 10 : 12,
      height: compact ? 10 : 12,
      decoration: BoxDecoration(
        color: indicatorColor,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: indicatorColor.withValues(alpha: 0.32),
            blurRadius: 10,
            spreadRadius: 1,
          ),
        ],
      ),
    );
  }
}
