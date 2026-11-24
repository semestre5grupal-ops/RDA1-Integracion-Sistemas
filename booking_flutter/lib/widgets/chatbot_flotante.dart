import 'dart:math';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../providers/auth_provider.dart';
import '../services/api_client.dart';
import '../services/booking_services.dart';
import '../theme/booking_colors.dart';

class _ChatMessage {
  final String text;
  final bool isUser;
  _ChatMessage({required this.text, required this.isUser});
}

class ChatbotFlotante extends StatefulWidget {
  const ChatbotFlotante({super.key});

  @override
  State<ChatbotFlotante> createState() => _ChatbotFlotanteState();
}

class _ChatbotFlotanteState extends State<ChatbotFlotante> {
  static const String _saludoInicial =
      '¡Hola! Soy el asistente de Booking. Puedo ayudarte a consultar vuelos, alojamientos, autos, atracciones o el estado de tu reserva.';

  bool _abierto = false;
  bool _cargando = false;
  String _sessionId = '';
  final List<_ChatMessage> _mensajes = [_ChatMessage(text: _saludoInicial, isUser: false)];
  final TextEditingController _inputCtrl = TextEditingController();
  final ScrollController _scrollCtrl = ScrollController();

  @override
  void initState() {
    super.initState();
    _initSession();
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  String _genSessionId() {
    final r = Random();
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return 'chat-${List.generate(12, (_) => chars[r.nextInt(chars.length)]).join()}';
  }

  Future<void> _initSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString('booking_chatbot_session');
      if (saved != null && saved.length >= 8) {
        _sessionId = saved;
      } else {
        _sessionId = _genSessionId();
        await prefs.setString('booking_chatbot_session', _sessionId);
      }
    } catch (_) {
      _sessionId = _genSessionId();
    }
  }

  Future<void> _nuevaConversacion() async {
    final nextId = _genSessionId();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('booking_chatbot_session', nextId);
    } catch (_) {}
    setState(() {
      _sessionId = nextId;
      _mensajes
        ..clear()
        ..add(_ChatMessage(text: _saludoInicial, isUser: false));
    });
  }

  Future<void> _enviar() async {
    final txt = _inputCtrl.text.trim();
    if (txt.isEmpty || _cargando) return;
    if (_sessionId.isEmpty) _sessionId = _genSessionId();

    _inputCtrl.clear();
    setState(() {
      _mensajes.add(_ChatMessage(text: txt, isUser: true));
      _cargando = true;
    });
    _scrollToBottom();

    try {
      final token = Provider.of<AuthProvider>(context, listen: false).token;
      final res = await BookingServices.chatbotEnviarMensaje(
        mensaje: txt,
        sessionId: _sessionId,
        idioma: 'es',
        token: token,
      );
      final reply = res['respuesta']?.toString() ??
          res['reply']?.toString() ??
          res['message']?.toString() ??
          'Recibí tu consulta. ¿En qué más te puedo ayudar?';
      if (mounted) {
        setState(() {
          _mensajes.add(_ChatMessage(text: reply, isUser: false));
          _cargando = false;
        });
        _scrollToBottom();
      }
    } catch (e) {
      if (mounted) {
        final msg = e is ApiException
            ? e.userMessage
            : 'El asistente no está disponible en este momento. Intenta de nuevo en unos segundos.';
        setState(() {
          _mensajes.add(_ChatMessage(text: msg, isUser: false));
          _cargando = false;
        });
        _scrollToBottom();
      }
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_abierto) {
      return Material(
        elevation: 6,
        color: BookingColors.primaryBlue,
        shape: const CircleBorder(),
        child: InkWell(
          onTap: () => setState(() => _abierto = true),
          customBorder: const CircleBorder(),
          child: const SizedBox(
            width: 50,
            height: 50,
            child: Icon(Icons.chat_bubble_outline, color: Colors.white, size: 22),
          ),
        ),
      );
    }

    final size = MediaQuery.of(context).size;
    final panelW = size.width < 420 ? size.width - 28 : 350.0;
    final panelH = size.height < 640 ? size.height * 0.62 : 470.0;

    return Material(
      elevation: 12,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: Container(
        width: panelW,
        height: panelH,
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          children: [
            Container(
              color: BookingColors.primaryBlue,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(
                children: [
                  const Icon(Icons.smart_toy_outlined, color: BookingColors.accentYellow, size: 20),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text('Asistente Booking', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                  ),
                  IconButton(
                    tooltip: 'Nueva conversación',
                    onPressed: _nuevaConversacion,
                    icon: const Icon(Icons.refresh, color: Colors.white, size: 18),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                  const SizedBox(width: 10),
                  IconButton(
                    tooltip: 'Minimizar',
                    onPressed: () => setState(() => _abierto = false),
                    icon: const Icon(Icons.close, color: Colors.white, size: 19),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView.builder(
                controller: _scrollCtrl,
                padding: const EdgeInsets.all(12),
                itemCount: _mensajes.length,
                itemBuilder: (_, i) {
                  final m = _mensajes[i];
                  return Align(
                    alignment: m.isUser ? Alignment.centerRight : Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      constraints: BoxConstraints(maxWidth: panelW * 0.78),
                      decoration: BoxDecoration(
                        color: m.isUser ? BookingColors.actionBlue : const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        m.text,
                        style: TextStyle(fontSize: 13, color: m.isUser ? Colors.white : BookingColors.textDark),
                      ),
                    ),
                  );
                },
              ),
            ),
            if (_cargando)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                child: LinearProgressIndicator(minHeight: 2),
              ),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(border: Border(top: BorderSide(color: Colors.grey.shade200))),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _inputCtrl,
                      onSubmitted: (_) => _enviar(),
                      decoration: const InputDecoration(
                        hintText: 'Escribe tu pregunta...',
                        border: OutlineInputBorder(),
                        isDense: true,
                        contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  IconButton(
                    onPressed: _cargando ? null : _enviar,
                    icon: const Icon(Icons.send, color: BookingColors.actionBlue),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

