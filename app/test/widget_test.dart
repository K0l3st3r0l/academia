import 'package:flutter_test/flutter_test.dart';
import 'package:academia_app/main.dart';

void main() {
  testWidgets('App renders without crashing', (WidgetTester tester) async {
    await tester.pumpWidget(const AcademIAApp());
    expect(find.byType(AcademIAApp), findsOneWidget);
  });
}
