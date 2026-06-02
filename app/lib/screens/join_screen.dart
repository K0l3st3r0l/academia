import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';

class JoinScreen extends StatefulWidget {
  final String? initialCode;
  const JoinScreen({super.key, this.initialCode});

  @override
  State<JoinScreen> createState() => _JoinScreenState();
}

class _JoinScreenState extends State<JoinScreen> {
  final _codeCtrl = TextEditingController();
  List<Map<String, dynamic>> _students = [];
  Map<String, dynamic>? _room;
  String? _selectedStudentId;
  String? _selectedStudentName;
  bool _loadingRoom = false;
  bool _joining = false;
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
    setState(() { _loadingRoom = true; _error = null; _room = null; _students = []; });
    try {
      final data = await _api.getRoom(code.toUpperCase().trim());
      setState(() {
        _room = data['room'];
        _students = List<Map<String, dynamic>>.from(data['students'] ?? []);
      });
    } catch (e) {
      setState(() { _error = 'Sala no encontrada o cerrada'; });
    } finally {
      setState(() { _loadingRoom = false; });
    }
  }

  Future<void> _join() async {
    if (_selectedStudentId == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('student_id', _selectedStudentId!);
    await prefs.setString('student_name', _selectedStudentName!);

    if (mounted) {
      context.go('/game/${_codeCtrl.text.toUpperCase().trim()}');
    }
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
              Text('Academ', style: Theme.of(context).textTheme.headlineLarge?.copyWith(fontSize: 48)),
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
                  hintStyle: TextStyle(color: AppColors.textSecondary.withOpacity(0.3), letterSpacing: 8, fontSize: 32),
                ),
                maxLength: 6,
                onSubmitted: (v) => _loadRoom(v),
              ),

              ElevatedButton(
                onPressed: _loadingRoom ? null : () => _loadRoom(_codeCtrl.text),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                child: _loadingRoom
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text('Buscar sala', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
              ),

              if (_error != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: AppColors.wrong.withOpacity(0.2), borderRadius: BorderRadius.circular(12)),
                  child: Text(_error!, style: const TextStyle(color: AppColors.wrong), textAlign: TextAlign.center),
                ),
              ],

              if (_students.isNotEmpty) ...[
                const SizedBox(height: 24),
                Text('Selecciona tu nombre', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 12),
                Expanded(
                  child: ListView.builder(
                    itemCount: _students.length,
                    itemBuilder: (context, i) {
                      final s = _students[i];
                      final id = s['id'] as String;
                      final name = '${s['first_name']} ${s['last_name']}';
                      final selected = _selectedStudentId == id;
                      return GestureDetector(
                        onTap: () => setState(() { _selectedStudentId = id; _selectedStudentName = name; }),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                          decoration: BoxDecoration(
                            color: selected ? AppColors.brand.withOpacity(0.3) : AppColors.surface,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: selected ? AppColors.brand : Colors.transparent, width: 2),
                          ),
                          child: Text(name, style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: selected ? AppColors.brandLight : AppColors.textPrimary,
                          )),
                        ),
                      );
                    },
                  ),
                ),

                ElevatedButton(
                  onPressed: (_selectedStudentId != null && !_joining) ? _join : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.correct,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: const Text('¡Unirme!', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Colors.white)),
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
    super.dispose();
  }
}
