import 'package:flutter/material.dart';

class AppColors {
  static const background = Color(0xFF0F172A);
  static const surface = Color(0xFF1E293B);
  static const card = Color(0xFF1E293B);
  static const brand = Color(0xFF6366F1);
  static const brandLight = Color(0xFFA5B4FC);
  static const gold = Color(0xFFF59E0B);
  static const correct = Color(0xFF22C55E);
  static const wrong = Color(0xFFEF4444);
  static const textPrimary = Color(0xFFF1F5F9);
  static const textSecondary = Color(0xFF94A3B8);

  static const optionColors = [
    Color(0xFF2563EB), // blue
    Color(0xFFEA580C), // orange
    Color(0xFF16A34A), // green
    Color(0xFFDC2626), // red
  ];
}

class AppTheme {
  static ThemeData get dark => ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: AppColors.background,
    colorScheme: const ColorScheme.dark(
      primary: AppColors.brand,
      secondary: AppColors.gold,
      surface: AppColors.surface,
      error: AppColors.wrong,
    ),
    textTheme: const TextTheme(
      headlineLarge: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w900),
      headlineMedium: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800),
      titleLarge: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700),
      bodyLarge: TextStyle(color: AppColors.textPrimary),
      bodyMedium: TextStyle(color: AppColors.textSecondary),
    ),
  );
}
