import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';

/// 123456785 → 12.345.678-5 while the student types.
class RutInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    var clean = newValue.text.replaceAll(RegExp(r'[^0-9kK]'), '').toUpperCase();
    if (clean.length > 10) clean = clean.substring(0, 10);
    var formatted = clean;
    if (clean.length >= 2) {
      final body = clean.substring(0, clean.length - 1).replaceAllMapped(
        RegExp(r'\B(?=(\d{3})+(?!\d))'),
        (_) => '.',
      );
      formatted = '$body-${clean.substring(clean.length - 1)}';
    }
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}

class JoinScreen extends StatefulWidget {
  final String? initialCode;
  const JoinScreen({super.key, this.initialCode});

  @override
  State<JoinScreen> createState() => _JoinScreenState();
}

class _JoinScreenState extends State<JoinScreen> {
  final _codeCtrl = TextEditingController();
  final _rutCtrl = TextEditingController();
  Map<String, dynamic>? _room;
  Map<String, dynamic>? _identified;
  bool _loading = false;
  String? _error;

  late ApiService _api;

  @override
  void initState() {
    super.initState();
    _api = ApiService(baseUrl: const String.fromEnvironment('BACKEND_URL', defaultValue: 'https://games.laravas.com'));
    if (widget.initialCode != null) {
      _codeCtrl.text = widget.initialCode!.toUpperCase();
      _loadRoom(widget.initialCode!);
    }
  }

  Future<void> _loadRoom(String code) async {
    setState(() { _loading = true; _error = null; _room = null; _identified = null; });
    try {
      final data = await _api.getRoom(code.toUpperCase().trim());
      setState(() { _room = data['room'] as Map<String, dynamic>?; });
    } catch (e) {
      setState(() { _error = 'Sala no encontrada o cerrada'; });
    } finally {
      setState(() { _loading = false; });
    }
  }

  Future<void> _identify() async {
    final room = _room;
    if (room == null || _rutCtrl.text.length < 3) return;
    setState(() { _loading = true; _error = null; });
    try {
      final data = await _api.joinRoom(room['code'] as String, _rutCtrl.text);
      setState(() { _identified = data; });
    } on DioException catch (e) {
      final body = e.response?.data;
      setState(() {
        _error = body is Map && body['error'] != null
          ? body['error'] as String
          : 'No pudimos revisar tu RUT. Inténtalo de nuevo.';
      });
    } finally {
      setState(() { _loading = false; });
    }
  }

  Future<void> _join() async {
    final room = _room;
    final identified = _identified;
    if (room == null || identified == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('room_ticket', identified['ticket'] as String);
    await prefs.setString('student_name', (identified['student'] as Map)['displayName'] as String);

    if (mounted) {
      context.go('/game/${room['code']}');
    }
  }

  void _backToRut() {
    setState(() { _identified = null; _error = null; _rutCtrl.clear(); });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 24),
              RichText(text: TextSpan(
                children: [
                  TextSpan(text: 'Academ', style: Theme.of(context).textTheme.headlineLarge?.copyWith(fontSize: 48)),
                  TextSpan(text: 'IA', style: Theme.of(context).textTheme.headlineLarge?.copyWith(fontSize: 48, color: AppColors.gold)),
                ],
              )),
              const SizedBox(height: 8),
              Text('Ingresa el código de tu sala', style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: 32),

              // Code input
              TextField(
                controller: _codeCtrl,
                textCapitalization: TextCapitalization.characters,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, letterSpacing: 8, color: AppColors.gold),
                decoration: InputDecoration(
                  filled: true,
                  fillColor: AppColors.surface,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                  hintText: 'XXXXXX',
                  hintStyle: TextStyle(color: AppColors.textSecondary.withValues(alpha: 0.3), letterSpacing: 8, fontSize: 32),
                ),
                maxLength: 6,
                onSubmitted: (v) => _loadRoom(v),
              ),

              if (_room == null)
                ElevatedButton(
                  onPressed: _loading ? null : () => _loadRoom(_codeCtrl.text),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: _loading
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text('Buscar sala', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
                ),

              if (_room != null && _identified == null) ...[
                const SizedBox(height: 8),
                Text('${_room!['course_name']} · ${_room!['subject']}',
                  style: Theme.of(context).textTheme.bodyMedium, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                Text('Escribe tu RUT', style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
                const SizedBox(height: 12),
                TextField(
                  controller: _rutCtrl,
                  autofocus: true,
                  autocorrect: false,
                  enableSuggestions: false,
                  textAlign: TextAlign.center,
                  inputFormatters: [RutInputFormatter()],
                  style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: AppColors.textPrimary),
                  decoration: InputDecoration(
                    filled: true,
                    fillColor: AppColors.surface,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                    hintText: '12.345.678-9',
                    hintStyle: TextStyle(color: AppColors.textSecondary.withValues(alpha: 0.3), fontSize: 28),
                    helperText: 'Si no lo sabes, pídeselo a tu profesor',
                  ),
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (_) => _identify(),
                ),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: (_loading || _rutCtrl.text.length < 3) ? null : _identify,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.correct,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: _loading
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text('Continuar', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Colors.white)),
                ),
              ],

              if (_identified != null) ...[
                const SizedBox(height: 16),
                Text('¿Eres tú?', style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
                const SizedBox(height: 8),
                Text(
                  (_identified!['student'] as Map)['displayName'] as String,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: AppColors.brandLight),
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: _join,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.correct,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: const Text('¡Sí, entrar!', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Colors.white)),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: _backToRut,
                  child: const Text('No, corregir mi RUT', style: TextStyle(color: AppColors.textSecondary)),
                ),
              ],

              if (_error != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: AppColors.wrong.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(12)),
                  child: Text(_error!, style: const TextStyle(color: AppColors.wrong), textAlign: TextAlign.center),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _codeCtrl.dispose();
    _rutCtrl.dispose();
    super.dispose();
  }
}
