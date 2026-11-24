import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../theme/booking_colors.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  final String? redirectMessage;

  const LoginScreen({super.key, this.redirectMessage});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();

  bool _obscurePassword = true;
  bool _submitting = false;
  String? _errorEmail;
  String? _errorPassword;
  String? _errorGeneral;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  void _handleEmailChange(String val) {
    if (val.length > 30) {
      _emailCtrl.text = val.substring(0, 30);
      _emailCtrl.selection = TextSelection.fromPosition(const TextPosition(offset: 30));
    }
    final emailRegex = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
    if (_emailCtrl.text.isNotEmpty && !emailRegex.hasMatch(_emailCtrl.text.trim())) {
      setState(() => _errorEmail = 'Ingresa un correo electrónico válido');
    } else {
      setState(() {
        _errorEmail = null;
        _errorGeneral = null;
      });
    }
  }

  Future<void> _handleLogin() async {
    final email = _emailCtrl.text.trim();
    final pass = _passwordCtrl.text;

    setState(() {
      _errorEmail = null;
      _errorPassword = null;
      _errorGeneral = null;
    });

    if (email.isEmpty) {
      setState(() => _errorEmail = 'Por favor ingresa tu correo electrónico');
      return;
    }
    if (pass.isEmpty) {
      setState(() => _errorPassword = 'Por favor ingresa tu contraseña');
      return;
    }

    setState(() => _submitting = true);
    final auth = context.read<AuthProvider>();

    try {
      final success = await auth.login(email, pass);
      if (success && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('¡Bienvenido, ${auth.user?.displayName ?? "Usuario"}!'),
            backgroundColor: BookingColors.successGreen,
          ),
        );
        Navigator.pop(context);
      } else if (mounted) {
        setState(() {
          _errorGeneral = 'Credenciales incorrectas. Verifique su correo y contraseña.';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorGeneral = 'Error de conexión: $e';
        });
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Iniciar Sesión', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Icono / Logo
            Center(
              child: Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: BookingColors.primaryBlue,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(Icons.travel_explore, size: 36, color: Colors.white),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Inicia sesión en Booking Central',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: BookingColors.textDark,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Accede para gestionar tus reservas de vuelos, hoteles, autos y tours.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: BookingColors.textMuted),
            ),
            const SizedBox(height: 24),

            if (widget.redirectMessage != null)
              Container(
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: const Color(0xFFEAF2FD),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: BookingColors.actionBlue.withOpacity(0.4)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline, color: BookingColors.actionBlue, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        widget.redirectMessage!,
                        style: const TextStyle(fontSize: 13, color: BookingColors.primaryBlue, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),

            if (_errorGeneral != null)
              Container(
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: Colors.red.shade300),
                ),
                child: Text(_errorGeneral!, style: const TextStyle(color: BookingColors.errorRed, fontSize: 13)),
              ),

            // Email
            const Text('Correo Electrónico *', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 6),
            TextField(
              controller: _emailCtrl,
              keyboardType: TextInputType.emailAddress,
              onChanged: _handleEmailChange,
              decoration: InputDecoration(
                hintText: 'ejemplo@correo.com',
                errorText: _errorEmail,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              ),
            ),
            const SizedBox(height: 16),

            // Contraseña
            const Text('Contraseña *', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 6),
            TextField(
              controller: _passwordCtrl,
              obscureText: _obscurePassword,
              decoration: InputDecoration(
                hintText: 'Tu contraseña',
                errorText: _errorPassword,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                suffixIcon: IconButton(
                  icon: Icon(_obscurePassword ? Icons.visibility_off : Icons.visibility, size: 20),
                  onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Botón de Inicio de sesión
            SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: _submitting ? null : _handleLogin,
                style: ElevatedButton.styleFrom(
                  backgroundColor: BookingColors.actionBlue,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                ),
                child: _submitting
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Iniciar sesión', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ),
            ),
            const SizedBox(height: 20),

            // Enlace a Registro
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text('¿No tienes una cuenta? ', style: TextStyle(fontSize: 13, color: BookingColors.textMuted)),
                InkWell(
                  onTap: () {
                    Navigator.pushReplacement(
                      context,
                      MaterialPageRoute(builder: (_) => const RegisterScreen()),
                    );
                  },
                  child: const Text(
                    'Regístrate aquí',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: BookingColors.actionBlue),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
