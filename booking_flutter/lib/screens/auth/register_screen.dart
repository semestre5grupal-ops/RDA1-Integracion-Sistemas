import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../theme/booking_colors.dart';
import 'login_screen.dart';
import '../../utils/cedula_ecuador.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();

  final _nombreCtrl = TextEditingController();
  final _apellidoCtrl = TextEditingController();
  final _cedulaCtrl = TextEditingController();
  final _telefonoCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();

  String _tipoDocumento = 'CEDULA'; // 'CEDULA' o 'PASAPORTE'
  bool _obscurePassword = true;
  bool _submitting = false;

  // Errores específicos
  String? _errorNombre;
  String? _errorApellido;
  String? _errorCedula;
  String? _errorTelefono;
  String? _errorEmail;
  String? _errorPassword;
  String? _errorGeneral;
  String? _infoGeneral; // alta correcta que requiere confirmar el correo

  @override
  void dispose() {
    _nombreCtrl.dispose();
    _apellidoCtrl.dispose();
    _cedulaCtrl.dispose();
    _telefonoCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  // --- Algoritmo Oficial de Verificación de Cédula Ecuatoriana ---
  /// Módulo 10 compartido (utils/cedula_ecuador.dart).
  bool _validarCedulaEcuatoriana(String c) => cedulaValida(c);

  // --- Validación del Formulario ---
  bool _validarFormulario() {
    setState(() {
      _errorNombre = null;
      _errorApellido = null;
      _errorCedula = null;
      _errorTelefono = null;
      _errorEmail = null;
      _errorPassword = null;
      _errorGeneral = null;
      _infoGeneral = null;
    });

    bool isValid = true;

    // Nombre
    if (_nombreCtrl.text.trim().length < 3) {
      _errorNombre = 'El nombre debe tener al menos 3 letras.';
      isValid = false;
    }

    // Apellido
    if (_apellidoCtrl.text.trim().length < 3) {
      _errorApellido = 'El apellido debe tener al menos 3 letras.';
      isValid = false;
    }

    // Documento
    final doc = _cedulaCtrl.text.trim();
    if (_tipoDocumento == 'PASAPORTE') {
      if (!RegExp(r'^[A-Za-z0-9]{6,15}$').hasMatch(doc)) {
        _errorCedula = 'El pasaporte debe ser alfanumérico (6 a 15 caracteres).';
        isValid = false;
      }
    } else {
      if (!_validarCedulaEcuatoriana(doc)) {
        _errorCedula = 'La cédula es inválida (verifique los 10 dígitos).';
        isValid = false;
      }
    }

    // Teléfono
    final tel = _telefonoCtrl.text.trim();
    if (tel.length != 10 || !tel.startsWith('09') || RegExp(r'^09(\d)\1{7}$').hasMatch(tel)) {
      _errorTelefono = 'El celular debe tener 10 dígitos e iniciar con 09.';
      isValid = false;
    }

    // Email
    final em = _emailCtrl.text.trim();
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(em) || em.length > 30) {
      _errorEmail = 'Ingresa un correo electrónico válido (máximo 30 caracteres).';
      isValid = false;
    }

    // Contraseña
    final pass = _passwordCtrl.text;
    final reqLen = pass.length >= 8;
    final reqUpper = RegExp(r'[A-Z]').hasMatch(pass);
    final reqLower = RegExp(r'[a-z]').hasMatch(pass);
    final reqNum = RegExp(r'[0-9]').hasMatch(pass);
    final reqSpec = RegExp(r'[^A-Za-z0-9]').hasMatch(pass);

    if (!reqLen || !reqUpper || !reqLower || !reqNum || !reqSpec || pass.length > 30) {
      _errorPassword = 'Mín. 8 caracteres, con mayúscula, minúscula, número y símbolo.';
      isValid = false;
    }

    setState(() {});
    return isValid;
  }

  Future<void> _handleRegister() async {
    if (!_validarFormulario()) return;

    setState(() => _submitting = true);
    final auth = context.read<AuthProvider>();

    try {
      final resultado = await auth.register(
        nombre: _nombreCtrl.text.trim(),
        apellido: _apellidoCtrl.text.trim(),
        tipoDocumento: _tipoDocumento,
        cedula: _cedulaCtrl.text.trim(),
        telefono: _telefonoCtrl.text.trim(),
        email: _emailCtrl.text.trim(),
        password: _passwordCtrl.text,
      );

      if (resultado.ok && resultado.info != null && mounted) {
        // Sin sesión todavía: igual que RegisterPage.jsx, se avisa y NO se redirige.
        setState(() => _infoGeneral = resultado.info);
      } else if (resultado.ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('¡Cuenta creada exitosamente! Bienvenido, ${auth.user?.nombre}.'),
            backgroundColor: BookingColors.successGreen,
          ),
        );
        Navigator.pop(context);
      } else if (mounted) {
        setState(() {
          _errorGeneral = resultado.error ?? 'No se pudo crear la cuenta. Intente con otro correo.';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorGeneral = 'Error al registrar: $e';
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
        title: const Text('Crear Cuenta', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Encabezado
                  const Row(
                    children: [
                      Icon(Icons.person_add_alt_1_outlined, color: BookingColors.primaryBlue, size: 28),
                      SizedBox(width: 8),
                      Text(
                        'Regístrate en Booking Central',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: BookingColors.textDark,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Crea tu cuenta para gestionar reservas de hoteles, vuelos, autos y atracciones con facturación SRI.',
                    style: TextStyle(fontSize: 13, color: BookingColors.textMuted),
                  ),
                  const SizedBox(height: 20),

                  if (_infoGeneral != null)
                    Container(
                      padding: const EdgeInsets.all(12),
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: Colors.green.shade50,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: Colors.green.shade300),
                      ),
                      child: Text(_infoGeneral!, style: const TextStyle(color: BookingColors.successGreen, fontSize: 13)),
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

                  // Nombre y Apellido
                  Row(
                    children: [
                      Expanded(
                        child: _buildTextField(
                          controller: _nombreCtrl,
                          label: 'Nombre *',
                          hint: 'Tu nombre',
                          errorText: _errorNombre,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _buildTextField(
                          controller: _apellidoCtrl,
                          label: 'Apellido *',
                          hint: 'Tu apellido',
                          errorText: _errorApellido,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Tipo de documento selector
                  Row(
                    children: [
                      const Text('Documento:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                      const SizedBox(width: 12),
                      ChoiceChip(
                        label: const Text('Cédula'),
                        selected: _tipoDocumento == 'CEDULA',
                        selectedColor: BookingColors.primaryBlue,
                        labelStyle: TextStyle(
                          color: _tipoDocumento == 'CEDULA' ? Colors.white : BookingColors.textDark,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                        onSelected: (val) {
                          if (val) setState(() => _tipoDocumento = 'CEDULA');
                        },
                      ),
                      const SizedBox(width: 8),
                      ChoiceChip(
                        label: const Text('Pasaporte'),
                        selected: _tipoDocumento == 'PASAPORTE',
                        selectedColor: BookingColors.primaryBlue,
                        labelStyle: TextStyle(
                          color: _tipoDocumento == 'PASAPORTE' ? Colors.white : BookingColors.textDark,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                        onSelected: (val) {
                          if (val) setState(() => _tipoDocumento = 'PASAPORTE');
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),

                  // Número de Documento
                  _buildTextField(
                    controller: _cedulaCtrl,
                    label: _tipoDocumento == 'CEDULA' ? 'Cédula de Identidad (10 dígitos) *' : 'Número de Pasaporte *',
                    hint: _tipoDocumento == 'CEDULA' ? '1724567890' : 'A12345678',
                    keyboardType: _tipoDocumento == 'CEDULA' ? TextInputType.number : TextInputType.text,
                    errorText: _errorCedula,
                  ),
                  const SizedBox(height: 14),

                  // Teléfono celular
                  _buildTextField(
                    controller: _telefonoCtrl,
                    label: 'Teléfono Celular (10 dígitos) *',
                    hint: '0987654321',
                    keyboardType: TextInputType.phone,
                    errorText: _errorTelefono,
                  ),
                  const SizedBox(height: 14),

                  // Correo electrónico
                  _buildTextField(
                    controller: _emailCtrl,
                    label: 'Correo Electrónico *',
                    hint: 'ejemplo@correo.com',
                    keyboardType: TextInputType.emailAddress,
                    errorText: _errorEmail,
                  ),
                  const SizedBox(height: 14),

                  // Contraseña
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Contraseña *', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _passwordCtrl,
                        obscureText: _obscurePassword,
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(
                          hintText: 'Mínimo 8 caracteres',
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                          errorText: _errorPassword,
                          suffixIcon: IconButton(
                            icon: Icon(_obscurePassword ? Icons.visibility_off : Icons.visibility, size: 20),
                            onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: [
                          _passRulePill('8+ caracteres', _passwordCtrl.text.length >= 8),
                          _passRulePill('Mayúscula', RegExp(r'[A-Z]').hasMatch(_passwordCtrl.text)),
                          _passRulePill('Minúscula', RegExp(r'[a-z]').hasMatch(_passwordCtrl.text)),
                          _passRulePill('Número', RegExp(r'[0-9]').hasMatch(_passwordCtrl.text)),
                          _passRulePill('Símbolo', RegExp(r'[^A-Za-z0-9]').hasMatch(_passwordCtrl.text)),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Botón de registro
                  SizedBox(
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _submitting ? null : _handleRegister,
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
                          : const Text('Crear cuenta', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Enlace a Iniciar Sesión
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text('¿Ya tienes una cuenta? ', style: TextStyle(fontSize: 13, color: BookingColors.textMuted)),
                      InkWell(
                        onTap: () {
                          Navigator.pushReplacement(
                            context,
                            MaterialPageRoute(builder: (_) => const LoginScreen()),
                          );
                        },
                        child: const Text(
                          'Inicia sesión',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: BookingColors.actionBlue),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _passRulePill(String text, bool ok) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: ok ? const Color(0xFFF2FBEE) : const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ok ? BookingColors.successGreen : Colors.grey.shade300),
      ),
      child: Text(
        '${ok ? "✓" : "•"} $text',
        style: TextStyle(fontSize: 11, color: ok ? BookingColors.successGreen : BookingColors.textMuted, fontWeight: ok ? FontWeight.bold : FontWeight.normal),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required String hint,
    String? errorText,
    TextInputType keyboardType = TextInputType.text,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          decoration: InputDecoration(
            hintText: hint,
            errorText: errorText,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          ),
        ),
      ],
    );
  }
}
