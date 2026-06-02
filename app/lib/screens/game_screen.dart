import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/game_models.dart';
import '../services/socket_service.dart';
import '../theme/app_theme.dart';

enum GamePhase { waiting, question, answered, reveal, paused, ended }

class GameScreen extends StatefulWidget {
  final String roomCode;
  const GameScreen({super.key, required this.roomCode});

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  late SocketService _socket;
  GamePhase _phase = GamePhase.waiting;
  String _displayName = '';
  int _score = 0;
  Question? _question;
  String? _selectedAnswer;
  String? _correctAnswer;
  String? _hint;
  RevealResult? _myResult;
  List<Student> _leaderboard = [];
  int _timeLeft = 0;
  Timer? _timer;
  bool _confirmLeave = false;

  static const _optionIcons = ['▲', '●', '■', '✦'];

  @override
  void initState() {
    super.initState();
    _initSocket();
  }

  Future<void> _initSocket() async {
    final prefs = await SharedPreferences.getInstance();
    final studentId = prefs.getString('student_id') ?? '';
    _displayName = prefs.getString('student_name') ?? 'Alumno';

    if (studentId.isEmpty) {
      if (mounted) context.go('/join');
      return;
    }

    _socket = SocketService(url: const String.fromEnvironment('BACKEND_URL', defaultValue: 'https://games.laravas.com'));
    _socket.connect();

    _socket.on('room:joined', (data) {
      if (data['reconnected'] == true) {
        setState(() { _score = data['score'] ?? 0; });
      } else {
        setState(() { _phase = GamePhase.waiting; });
      }
    });

    _socket.on('game:started', (_) => setState(() { _phase = GamePhase.waiting; }));

    _socket.on('game:question', (data) {
      final q = Question.fromJson(data as Map<String, dynamic>);
      _startTimer(q.timeMs);
      setState(() {
        _question = q;
        _selectedAnswer = null;
        _myResult = null;
        _correctAnswer = null;
        _hint = null;
        _phase = q.alreadyAnswered ? GamePhase.answered : GamePhase.question;
      });
    });

    _socket.on('game:paused', (data) {
      _timer?.cancel();
      final remaining = (data['timeRemaining'] as num?)?.toInt() ?? _timeLeft * 1000;
      setState(() { _phase = GamePhase.paused; _timeLeft = (remaining / 1000).ceil(); });
    });

    _socket.on('game:resumed', (data) {
      final remaining = (data['timeRemaining'] as num?)?.toInt() ?? 0;
      _startTimer(remaining);
      setState(() { _phase = _selectedAnswer != null ? GamePhase.answered : GamePhase.question; });
    });

    _socket.on('game:reveal', (data) {
      _timer?.cancel();
      final results = (data['results'] as List?)?.map((r) => RevealResult.fromJson(r as Map<String, dynamic>)).toList() ?? [];
      final myRes = results.where((r) => r.name == _displayName).firstOrNull;
      final lb = (data['leaderboard'] as List?)?.map((s) => Student.fromJson(s as Map<String, dynamic>)).toList() ?? [];
      setState(() {
        _correctAnswer = data['correctAnswer'];
        _hint = data['hint'];
        _myResult = myRes;
        _leaderboard = lb;
        if (myRes != null) _score += myRes.tokensEarned;
        _phase = GamePhase.reveal;
      });
    });

    _socket.on('game:end', (data) {
      _timer?.cancel();
      final lb = (data['leaderboard'] as List?)?.map((s) => Student.fromJson(s as Map<String, dynamic>)).toList() ?? [];
      setState(() { _leaderboard = lb; _phase = GamePhase.ended; });
    });

    _socket.on('error', (data) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(data['message'] ?? 'Error')));
        context.go('/join');
      }
    });

    _socket.emit('student:join', {
      'roomCode': widget.roomCode,
      'studentDbId': studentId,
      'displayName': _displayName,
    });
  }

  void _startTimer(int timeMs) {
    _timer?.cancel();
    setState(() { _timeLeft = (timeMs / 1000).ceil(); });
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_timeLeft <= 1) { t.cancel(); setState(() { _timeLeft = 0; }); return; }
      setState(() { _timeLeft--; });
    });
  }

  void _submitAnswer(String answer) {
    if (_phase != GamePhase.question || _selectedAnswer != null) return;
    setState(() { _selectedAnswer = answer; _phase = GamePhase.answered; });
    _socket.emit('game:answer', {'roomCode': widget.roomCode, 'answer': answer});
  }

  void _leave() {
    _socket.disconnect();
    if (mounted) context.go('/join');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _buildHeader(),
                  const SizedBox(height: 12),
                  Expanded(child: _buildPhaseContent()),
                ],
              ),
            ),
            if (_confirmLeave) _buildLeaveDialog(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(_displayName, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          Row(children: [
            const Icon(Icons.monetization_on, color: AppColors.gold, size: 18),
            const SizedBox(width: 4),
            Text('$_score tokens', style: const TextStyle(color: AppColors.gold, fontWeight: FontWeight.w900, fontSize: 18)),
          ]),
        ]),
        Row(children: [
          Text('Sala ', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          Text(widget.roomCode, style: const TextStyle(color: AppColors.gold, fontWeight: FontWeight.w900, letterSpacing: 3)),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () {
              if (_phase == GamePhase.waiting || _phase == GamePhase.ended) { _leave(); return; }
              setState(() { _confirmLeave = true; });
            },
            child: const Icon(Icons.close, color: AppColors.textSecondary, size: 22),
          ),
        ]),
      ],
    );
  }

  Widget _buildPhaseContent() {
    return switch (_phase) {
      GamePhase.waiting => _buildWaiting(),
      GamePhase.question || GamePhase.answered => _buildQuestion(),
      GamePhase.paused => _buildPaused(),
      GamePhase.reveal => _buildReveal(),
      GamePhase.ended => _buildEnd(),
    };
  }

  Widget _buildWaiting() => Center(
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      const Text('⏳', style: TextStyle(fontSize: 64)),
      const SizedBox(height: 16),
      Text('Esperando al docente…', style: Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height: 8),
      Text('La actividad comenzará pronto', style: Theme.of(context).textTheme.bodyMedium),
      const SizedBox(height: 24),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16)),
        child: Text(_displayName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.brandLight)),
      ),
    ]),
  );

  Widget _buildPaused() => Center(
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      const Text('⏸', style: TextStyle(fontSize: 64)),
      const SizedBox(height: 16),
      const Text('El docente pausó el juego', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.gold)),
      const SizedBox(height: 8),
      const Text('Espera a que reanude la actividad', style: TextStyle(color: AppColors.textSecondary)),
      if (_question != null) ...[
        const SizedBox(height: 24),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16)),
          child: Text(_question!.text, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold), textAlign: TextAlign.center),
        ),
      ],
    ]),
  );

  Widget _buildQuestion() {
    if (_question == null) return const SizedBox();
    final totalSecs = (_question!.timeMs / 1000).ceil();
    return Column(
      children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('${_question!.questionIndex + 1} / ${_question!.totalQuestions}', style: const TextStyle(color: AppColors.textSecondary)),
          Text('${_timeLeft}s', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: _timeLeft <= 5 ? AppColors.wrong : AppColors.gold)),
        ]),
        const SizedBox(height: 8),
        // Timer bar
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: totalSecs > 0 ? _timeLeft / totalSecs : 0,
            minHeight: 6,
            backgroundColor: AppColors.surface,
            valueColor: const AlwaysStoppedAnimation(AppColors.gold),
          ),
        ),
        const SizedBox(height: 16),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16)),
          child: Text(_question!.text, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold), textAlign: TextAlign.center),
        ),
        const SizedBox(height: 16),
        Expanded(
          child: GridView.count(
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            children: List.generate(_question!.options.length, (i) {
              final opt = _question!.options[i];
              final isSelected = _selectedAnswer == opt;
              final isAnswered = _phase == GamePhase.answered;
              return GestureDetector(
                onTap: () => _submitAnswer(opt),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  decoration: BoxDecoration(
                    color: AppColors.optionColors[i],
                    borderRadius: BorderRadius.circular(16),
                    border: isSelected ? Border.all(color: Colors.white, width: 4) : null,
                    boxShadow: isSelected ? [BoxShadow(color: Colors.white.withOpacity(0.3), blurRadius: 12)] : null,
                  ),
                  child: Opacity(
                    opacity: isAnswered && !isSelected ? 0.4 : 1.0,
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Text(_optionIcons[i], style: const TextStyle(fontSize: 32, color: Colors.white70)),
                      const SizedBox(height: 8),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        child: Text(opt, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white), textAlign: TextAlign.center),
                      ),
                    ]),
                  ),
                ),
              );
            }),
          ),
        ),
        if (_phase == GamePhase.answered)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('✓ Respuesta enviada — esperando al resto…', style: TextStyle(color: AppColors.textSecondary)),
          ),
      ],
    );
  }

  Widget _buildReveal() {
    final isCorrect = _myResult?.correct ?? false;
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: (isCorrect ? AppColors.correct : AppColors.wrong).withOpacity(0.2),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: isCorrect ? AppColors.correct : AppColors.wrong, width: 2),
          ),
          child: Column(children: [
            Text(isCorrect ? '✅' : '❌', style: const TextStyle(fontSize: 56)),
            const SizedBox(height: 8),
            Text(isCorrect ? '¡Correcto!' : '¡Incorrecto!', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: isCorrect ? AppColors.correct : AppColors.wrong)),
            if (isCorrect && _myResult != null)
              Text('+${_myResult!.tokensEarned} tokens', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: AppColors.gold)),
            if (!isCorrect && _correctAnswer != null)
              Text('Respuesta: $_correctAnswer', style: const TextStyle(fontSize: 16, color: AppColors.correct)),
          ]),
        ),
        if (_hint != null) ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12)),
            child: Text('💡 $_hint', style: const TextStyle(color: AppColors.textSecondary), textAlign: TextAlign.center),
          ),
        ],
        const SizedBox(height: 12),
        const Text('La siguiente pregunta comienza pronto…', style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
      ],
    );
  }

  Widget _buildEnd() {
    final myRank = _leaderboard.where((s) => s.displayName == _displayName).firstOrNull;
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Text('🏆', style: TextStyle(fontSize: 72)),
        const SizedBox(height: 8),
        Text('¡Terminó!', style: Theme.of(context).textTheme.headlineLarge),
        const SizedBox(height: 16),
        if (myRank != null)
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16)),
            child: Column(children: [
              const Text('Tu posición', style: TextStyle(color: AppColors.textSecondary)),
              Text('#${_leaderboard.indexOf(myRank) + 1}', style: const TextStyle(fontSize: 56, fontWeight: FontWeight.w900, color: AppColors.gold)),
              Text('$_score tokens', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.gold)),
            ]),
          ),
        const SizedBox(height: 16),
        ..._leaderboard.take(5).map((s) {
          final rank = _leaderboard.indexOf(s) + 1;
          final isMe = s.displayName == _displayName;
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: isMe ? AppColors.brand.withOpacity(0.2) : AppColors.surface,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text('#$rank ${s.displayName}', style: TextStyle(color: isMe ? AppColors.brandLight : AppColors.textPrimary, fontWeight: FontWeight.w600)),
              Text('${s.score}🪙', style: const TextStyle(color: AppColors.gold, fontWeight: FontWeight.bold)),
            ]),
          );
        }),
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: () => context.go('/join'),
          style: ElevatedButton.styleFrom(backgroundColor: AppColors.brand, padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 32), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
          child: const Text('Volver al inicio', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
        ),
      ],
    );
  }

  Widget _buildLeaveDialog() => Container(
    color: Colors.black54,
    child: Center(
      child: Container(
        margin: const EdgeInsets.all(32),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(20)),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('⚠️', style: TextStyle(fontSize: 40)),
          const SizedBox(height: 8),
          const Text('¿Salir del juego?', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          const Text('Perderás las preguntas que faltan y los tokens que podrías ganar.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.textSecondary)),
          const SizedBox(height: 20),
          Row(children: [
            Expanded(child: OutlinedButton(
              onPressed: () => setState(() { _confirmLeave = false; }),
              style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
              child: const Text('Quedarme'),
            )),
            const SizedBox(width: 12),
            Expanded(child: ElevatedButton(
              onPressed: _leave,
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.wrong, padding: const EdgeInsets.symmetric(vertical: 14)),
              child: const Text('Salir', style: TextStyle(color: Colors.white)),
            )),
          ]),
        ]),
      ),
    ),
  );

  @override
  void dispose() {
    _timer?.cancel();
    _socket.disconnect();
    super.dispose();
  }
}
