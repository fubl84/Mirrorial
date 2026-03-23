import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../layout/layout_helpers.dart';
import '../../services/context_service.dart';
import '../../services/display_preferences.dart';

class DailyBriefModule extends ConsumerWidget {
  final Map config;
  final ModuleLayoutData? layoutData;
  final Map<String, dynamic>? rootConfig;

  const DailyBriefModule({super.key, required this.config, this.layoutData, this.rootConfig});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final snapshotAsync = ref.watch(contextSnapshotProvider);
    final density = layoutData?.density ?? ModuleVisualDensity.medium;
    final locale = resolveDisplayLocale(rootConfig);
    final use24HourFormat = resolveUse24HourFormat(config, rootConfig);

    return snapshotAsync.when(
      data: (snapshot) {
        return LayoutBuilder(
          builder: (context, constraints) {
            final pageSize = _pageSizeForLayout(constraints.maxHeight, density, config);
            final householdView = snapshot.brief.householdView.trim();
            final tripLine = _buildTripLine(snapshot.activeTrip, locale);
            final showTripLine = tripLine.isNotEmpty && tripLine != householdView;
            final items = <_BriefItem>[
              if (householdView.isNotEmpty) _BriefItem(type: _BriefItemType.primary, text: householdView),
              if (showTripLine) _BriefItem(type: _BriefItemType.secondary, text: tripLine),
              ...snapshot.brief.bullets
                  .where((bullet) => bullet.trim().isNotEmpty)
                  .map((bullet) => _BriefItem(type: _BriefItemType.bullet, text: bullet)),
            ];

            final pages = _chunkItems(items, pageSize);
            final updatedLabel = snapshot.updatedAt != null
                ? '${translateDisplayLabel('updated', locale)} ${formatClockTime(DateTime.parse(snapshot.updatedAt!).toLocal(), locale, use24HourFormat: use24HourFormat)}'
                : null;

            return _BriefPager(
              headline: snapshot.brief.headline,
              pages: pages,
              updatedLabel: updatedLabel,
              emptyLabel: translateDisplayLabel('no_brief', locale),
              density: density,
              pageSeconds: ((config['pageSeconds'] as num?)?.toInt() ?? 10).clamp(5, 30),
            );
          },
        );
      },
      loading: () => const Center(
        child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (error, stackTrace) => const Icon(Icons.error_outline, color: Colors.red),
    );
  }

  int _pageSizeForLayout(double height, ModuleVisualDensity density, Map config) {
    final configured = (config['maxItems'] as num?)?.toInt() ?? 3;
    if (density == ModuleVisualDensity.compact) {
      return 1;
    }

    final estimated = ((height - 90) / (density == ModuleVisualDensity.expanded ? 72 : 84)).floor().clamp(1, 4).toInt();
    return configured.clamp(1, estimated).toInt();
  }

  String _buildTripLine(TripContext? trip, String locale) {
    if (trip == null) {
      return '';
    }

    if (_looksLikeAddress(trip.destination) && !shouldAllowAddressLikeLocation(trip.destination, rootConfig)) {
      return '';
    }

    final extras = <String>[
      if (trip.transportLifecycleLabel.isNotEmpty) trip.transportLifecycleLabel,
      if (trip.weatherLabel != null && trip.weatherLabel!.isNotEmpty) trip.weatherLabel!,
      if (trip.currentTime != null && trip.currentTime!.isNotEmpty) 'Local time ${trip.currentTime!}',
    ];

    final start = DateTime.tryParse(trip.start);
    final end = DateTime.tryParse(trip.end);
    final dateLabel = (start != null && end != null)
        ? '${formatCalendarDate(start, locale)} - ${formatCalendarDate(end, locale)}'
        : trip.destination;
    final suffix = extras.isEmpty ? '' : ' • ${extras.join(' • ')}';
    return '${trip.destination} • $dateLabel$suffix';
  }
}

class _BriefPager extends StatefulWidget {
  final String headline;
  final List<List<_BriefItem>> pages;
  final String? updatedLabel;
  final String emptyLabel;
  final ModuleVisualDensity density;
  final int pageSeconds;

  const _BriefPager({
    required this.headline,
    required this.pages,
    required this.updatedLabel,
    required this.emptyLabel,
    required this.density,
    required this.pageSeconds,
  });

  @override
  State<_BriefPager> createState() => _BriefPagerState();
}

class _BriefPagerState extends State<_BriefPager> {
  Timer? _timer;
  int _pageIndex = 0;

  @override
  void initState() {
    super.initState();
    _syncTimer();
  }

  @override
  void didUpdateWidget(covariant _BriefPager oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.pages.length != oldWidget.pages.length || widget.pageSeconds != oldWidget.pageSeconds) {
      _pageIndex = 0;
      _syncTimer();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _syncTimer() {
    _timer?.cancel();
    if (widget.pages.length <= 1) {
      return;
    }

    _timer = Timer.periodic(Duration(seconds: widget.pageSeconds), (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _pageIndex = (_pageIndex + 1) % widget.pages.length;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final safeIndex = widget.pages.isEmpty ? 0 : (_pageIndex < widget.pages.length ? _pageIndex : 0);
    final currentPage = widget.pages.isEmpty ? const <_BriefItem>[] : widget.pages[safeIndex];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (widget.density != ModuleVisualDensity.compact) ...[
          Text(
            widget.headline,
            style: Theme.of(context).textTheme.titleLarge,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 10),
        ],
        Expanded(
          child: currentPage.isEmpty
              ? Align(
                  alignment: Alignment.topLeft,
                  child: Text(
                    widget.emptyLabel,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                )
              : AnimatedSwitcher(
                  duration: const Duration(milliseconds: 350),
                  child: _BriefPage(
                    key: ValueKey('page-$_pageIndex-${currentPage.map((item) => item.text).join('|')}'),
                    items: currentPage,
                    density: widget.density,
                  ),
                ),
        ),
        if (widget.updatedLabel != null || widget.pages.length > 1) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              if (widget.updatedLabel != null)
                Expanded(
                  child: Text(
                    widget.updatedLabel!,
                    style: Theme.of(context).textTheme.bodyMedium,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              if (widget.pages.length > 1) ...[
                const SizedBox(width: 8),
                Text(
                  '${safeIndex + 1}/${widget.pages.length}',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ],
          ),
        ],
      ],
    );
  }
}

class _BriefPage extends StatelessWidget {
  final List<_BriefItem> items;
  final ModuleVisualDensity density;

  const _BriefPage({
    super.key,
    required this.items,
    required this.density,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      key: key,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: items.map((item) {
        final isPrimary = item.type == _BriefItemType.primary;
        final isSecondary = item.type == _BriefItemType.secondary;
        final isBullet = item.type == _BriefItemType.bullet;

        return Padding(
          padding: EdgeInsets.only(bottom: isPrimary ? 10 : 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (isBullet) ...[
                Padding(
                  padding: const EdgeInsets.only(top: 7),
                  child: Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: Theme.of(context).iconTheme.color,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: Text(
                  item.text,
                  maxLines: isPrimary ? (density == ModuleVisualDensity.compact ? 3 : 4) : (isSecondary ? 2 : 3),
                  overflow: TextOverflow.ellipsis,
                  style: isPrimary
                      ? Theme.of(context).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600)
                      : (isSecondary
                          ? Theme.of(context).textTheme.bodyMedium
                          : Theme.of(context).textTheme.bodyLarge),
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}

List<List<_BriefItem>> _chunkItems(List<_BriefItem> items, int pageSize) {
  if (items.isEmpty) {
    return const [];
  }

  final pages = <List<_BriefItem>>[];
  for (var index = 0; index < items.length; index += pageSize) {
    final end = (index + pageSize) > items.length ? items.length : (index + pageSize);
    pages.add(items.sublist(index, end));
  }
  return pages;
}

bool _looksLikeAddress(String value) {
  final normalized = value.trim().toLowerCase();
  return RegExp(r'\b\d{1,5}[a-z]?\b').hasMatch(normalized)
      || normalized.contains('straße')
      || normalized.contains('strasse')
      || normalized.contains('street');
}

class _BriefItem {
  final _BriefItemType type;
  final String text;

  const _BriefItem({required this.type, required this.text});
}

enum _BriefItemType {
  primary,
  secondary,
  bullet,
}
