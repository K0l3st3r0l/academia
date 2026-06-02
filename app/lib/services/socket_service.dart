import 'package:socket_io_client/socket_io_client.dart' as io;

typedef EventCallback = void Function(dynamic data);

class SocketService {
  io.Socket? _socket;
  final String url;

  SocketService({required this.url});

  void connect() {
    _socket = io.io(url, io.OptionBuilder()
      .setTransports(['websocket'])
      .enableReconnection()
      .setReconnectionAttempts(10)
      .setReconnectionDelay(1000)
      .build());
  }

  void on(String event, EventCallback cb) => _socket?.on(event, cb);

  void emit(String event, [dynamic data]) => _socket?.emit(event, data);

  void off(String event) => _socket?.off(event);

  void disconnect() => _socket?.disconnect();

  bool get connected => _socket?.connected ?? false;
}
