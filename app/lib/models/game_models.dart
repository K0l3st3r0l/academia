class Student {
  final String id;
  final String displayName;
  int score;

  Student({required this.id, required this.displayName, this.score = 0});

  factory Student.fromJson(Map<String, dynamic> j) => Student(
    id: j['studentId'] ?? j['id'] ?? '',
    displayName: j['name'] ?? j['displayName'] ?? '',
    score: j['score'] ?? 0,
  );
}

class Question {
  final int questionIndex;
  final int totalQuestions;
  final String text;
  final List<String> options;
  final int timeMs;
  final bool alreadyAnswered;

  Question({
    required this.questionIndex,
    required this.totalQuestions,
    required this.text,
    required this.options,
    required this.timeMs,
    this.alreadyAnswered = false,
  });

  factory Question.fromJson(Map<String, dynamic> j) => Question(
    questionIndex: j['questionIndex'] ?? 0,
    totalQuestions: j['totalQuestions'] ?? 1,
    text: j['text'] ?? '',
    options: List<String>.from(j['options'] ?? []),
    timeMs: j['timeMs'] ?? 25000,
    alreadyAnswered: j['alreadyAnswered'] ?? false,
  );
}

class RevealResult {
  final String studentId;
  final String name;
  final bool correct;
  final int? timeTakenMs;
  final int tokensEarned;

  RevealResult({
    required this.studentId,
    required this.name,
    required this.correct,
    this.timeTakenMs,
    required this.tokensEarned,
  });

  factory RevealResult.fromJson(Map<String, dynamic> j) => RevealResult(
    studentId: j['studentId'] ?? '',
    name: j['name'] ?? '',
    correct: j['correct'] ?? false,
    timeTakenMs: j['timeTakenMs'],
    tokensEarned: j['tokensEarned'] ?? 0,
  );
}
