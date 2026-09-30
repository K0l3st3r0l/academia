import 'package:dio/dio.dart';

class ApiService {
  final Dio _dio;

  ApiService({required String baseUrl})
    : _dio = Dio(BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 8),
        receiveTimeout: const Duration(seconds: 8),
      ));

  Future<Map<String, dynamic>> getRoom(String code) async {
    final res = await _dio.get('/api/rooms/$code');
    return res.data as Map<String, dynamic>;
  }

  /// Returns `{ticket, student: {firstName, displayName}}`, or throws a
  /// [DioException] whose response carries `{error}` for the student.
  Future<Map<String, dynamic>> joinRoom(String code, String rut) async {
    final res = await _dio.post('/api/rooms/$code/join', data: {'rut': rut});
    return res.data as Map<String, dynamic>;
  }
}
