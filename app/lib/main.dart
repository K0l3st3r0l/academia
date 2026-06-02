import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'screens/join_screen.dart';
import 'screens/game_screen.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  runApp(const AcademIAApp());
}

final _router = GoRouter(
  initialLocation: '/join',
  routes: [
    GoRoute(path: '/join', builder: (_, __) => const JoinScreen()),
    GoRoute(
      path: '/join/:code',
      builder: (_, state) => JoinScreen(initialCode: state.pathParameters['code']),
    ),
    GoRoute(
      path: '/game/:code',
      builder: (_, state) => GameScreen(roomCode: state.pathParameters['code']!),
    ),
  ],
);

class AcademIAApp extends StatelessWidget {
  const AcademIAApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'AcademIA',
      theme: AppTheme.dark,
      routerConfig: _router,
      debugShowCheckedModeBanner: false,
    );
  }
}
