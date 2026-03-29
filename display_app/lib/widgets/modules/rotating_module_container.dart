import 'package:flutter/material.dart';

import '../../layout/layout_helpers.dart';
import '../../module_registry.dart';

class RotatingModuleContainer extends StatefulWidget {
  final Map<String, dynamic> config;
  final ModuleLayoutData? layoutData;
  final Map<String, dynamic>? rootConfig;

  const RotatingModuleContainer({
    super.key,
    required this.config,
    this.layoutData,
    this.rootConfig,
  });

  @override
  State<RotatingModuleContainer> createState() => _RotatingModuleContainerState();
}

class _RotatingModuleContainerState extends State<RotatingModuleContainer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _progressController;
  int _activeIndex = 0;

  @override
  void initState() {
    super.initState();
    _progressController = AnimationController(vsync: this);
    _progressController.addStatusListener((status) {
      if (status == AnimationStatus.completed && mounted) {
        final pageCount = _pages.length;
        if (pageCount <= 1) {
          _progressController.value = 1;
          return;
        }

        setState(() {
          _activeIndex = (_activeIndex + 1) % pageCount;
        });
        _progressController.forward(from: 0);
      }
    });
    _syncProgressController();
  }

  @override
  void didUpdateWidget(covariant RotatingModuleContainer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_activeIndex >= _pages.length) {
      _activeIndex = 0;
    }
    _syncProgressController();
  }

  @override
  void dispose() {
    _progressController.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> get _pages {
    final rawPages = (widget.config['modules'] as List? ?? [])
        .whereType<Map>()
        .map((entry) => entry.cast<String, dynamic>())
        .toList();

    if (rawPages.isEmpty) {
      return const [
        {
          'id': 'rotator_clock_fallback',
          'type': 'clock',
          'align': 'stretch',
          'config': <String, dynamic>{},
        },
      ];
    }

    return rawPages
        .take(3)
        .map((page) => {
              'id': page['id']?.toString() ?? 'rotator_page',
              'type': page['type']?.toString() ?? 'clock',
              'align': switch (page['align']?.toString()) {
                'start' => 'start',
                'center' => 'center',
                'end' => 'end',
                _ => 'stretch',
              },
              'config': (page['config'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{},
            })
        .toList();
  }

  Duration get _rotationDuration => Duration(
        seconds: ((widget.config['rotationSeconds'] as num?)?.toInt() ?? 10).clamp(3, 120),
      );

  String get _animationType => switch (widget.config['animation']?.toString()) {
        'blend' => 'blend',
        'lift' => 'lift',
        'none' => 'none',
        _ => 'swipe',
      };

  void _syncProgressController() {
    _progressController.duration = _rotationDuration;
    if (_pages.length <= 1) {
      _progressController.stop();
      _progressController.value = 1;
      return;
    }

    if (!_progressController.isAnimating) {
      _progressController.forward(from: 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pages = _pages;
    final activePage = pages[_activeIndex % pages.length];
    final childLayoutData = widget.layoutData?.copyWith(
      align: activePage['align']?.toString() ?? 'stretch',
    );
    final activeChild = buildModuleFromRegistry(
      activePage['type']?.toString() ?? 'clock',
      activePage['config'] as Map<String, dynamic>? ?? <String, dynamic>{},
      layoutData: childLayoutData,
      rootConfig: widget.rootConfig,
    );

    return Stack(
      children: [
        Positioned.fill(
          child: AnimatedSwitcher(
            duration: _animationType == 'none'
                ? Duration.zero
                : const Duration(milliseconds: 420),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            transitionBuilder: (child, animation) =>
                _buildTransition(animation, child),
            layoutBuilder: (currentChild, previousChildren) => Stack(
              fit: StackFit.expand,
              children: [
                ...previousChildren,
                if (currentChild != null) currentChild,
              ],
            ),
            child: KeyedSubtree(
              key: ValueKey('${activePage['id']}-$_activeIndex'),
              child: activeChild,
            ),
          ),
        ),
        if (pages.length > 1)
          Positioned(
            left: 0,
            right: 0,
            bottom: 6,
            child: IgnorePointer(
              child: AnimatedBuilder(
                animation: _progressController,
                builder: (context, _) => _RotatorPageIndicator(
                  count: pages.length,
                  activeIndex: _activeIndex,
                  progress: _progressController.value,
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildTransition(Animation<double> animation, Widget child) {
    switch (_animationType) {
      case 'blend':
        return FadeTransition(opacity: animation, child: child);
      case 'lift':
        return FadeTransition(
          opacity: animation,
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.96, end: 1.0).animate(
              CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
            ),
            child: child,
          ),
        );
      case 'none':
        return child;
      case 'swipe':
      default:
        return FadeTransition(
          opacity: animation,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0.12, 0),
              end: Offset.zero,
            ).animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic)),
            child: child,
          ),
        );
    }
  }
}

class _RotatorPageIndicator extends StatelessWidget {
  final int count;
  final int activeIndex;
  final double progress;

  const _RotatorPageIndicator({
    required this.count,
    required this.activeIndex,
    required this.progress,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(count, (index) {
        final isActive = index == activeIndex;
        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 3),
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: Colors.white.withValues(alpha: 0.06),
            border: Border.all(
              color: Colors.white.withValues(alpha: isActive ? 0.52 : 0.18),
            ),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: Align(
              alignment: Alignment.centerLeft,
              child: FractionallySizedBox(
                widthFactor: isActive ? progress.clamp(0.0, 1.0) : 0,
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.82),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
            ),
          ),
        );
      }),
    );
  }
}
