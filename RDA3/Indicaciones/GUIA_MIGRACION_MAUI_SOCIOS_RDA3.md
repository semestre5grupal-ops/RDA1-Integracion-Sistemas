# 🔷 Guía Oficial de Migración Móvil en .NET MAUI para Socios B2B (RDA3)

> **Asignatura:** Integración de Sistemas — 6to Semestre  
> **Plataforma Integradora:** Booking Central  
> **Framework Asignado:** **Microsoft .NET MAUI (C# / XAML)**  
> **Destinatarios:** Socios Federados (Atracciones, Autos, Alojamientos, Vuelos)  
> **Instrucciones para el Estudiante:** Entrega este archivo completo a tu agente de IA (Cascade, Cursor, Copilot, Claude o ChatGPT). Tu agente tiene aquí todas las especificaciones necesarias para crear tu aplicación móvil sin poner en riesgo tu backend ni la integración con Booking Central.

---

## ⚠️ 1. REGLA DE ORO INVIOLABLE: PROHIBIDO MODIFICAR EL BACKEND

> [!CAUTION]
> ### 🛑 INSTRUCCIÓN CRÍTICA PARA EL AGENTE DE IA
> - **QUEDA ESTRICTAMENTE PROHIBIDO MODIFICAR, EDITAR O REFACTORIZAR CUALQUIER ARCHIVO DEL BACKEND EXISTENTE** (controladores, rutas, entidades de base de datos, DTOs, servicios o scripts de despliegue en Azure).
> - **NO MODIFICAR LOS CONTRATOS OPENAPI v3:** La integración B2B con Booking Central ya fue probada y aprobada en el RDA2. Cualquier cambio en rutas, payloads o modelos romperá las transacciones federadas (Sagas, cancelaciones, sincronización de cupos) y arruinará la calificación de ambos grupos.
> - **LA APLICACIÓN MÓVIL ES ÚNICAMENTE UN CLIENTE CONSUMIDOR:** Tu app móvil solo debe realizar peticiones HTTP (GET, POST, PATCH) a la API que ya está desplegada y funcionando en la nube (Azure Container Apps / Azure App Service).
> - **LA CONSOLA ADMINISTRATIVA NO SE MIGRA A MÓVIL:** Los paneles de administración, monitoreo y telemetría operativa se conservan en la aplicación Web de escritorio. La app móvil es **exclusiva para el cliente / turista final**.

### 1.1. Guardrails y Anti-Patrones Prohibidos para el Agente

> [!WARNING]
> ### 🚫 ANTI-PATRONES DETECTADOS EN PRUEBAS PILOTO (PROHIBIDO IMPLEMENTAR)
> 1. **PROHIBIDO EL "CARRITO DE COMPRAS" (Cart / Basket):**
>    - La arquitectura B2B de Booking Central y de los microservicios socios opera con **reservas atómicas individuales directas**.
>    - Cada reserva se confirma inmediatamente contra Azure enviando una cabecera `Idempotency-Key` (UUIDv4) y un timeout de 45 segundos.
>    - Si el agente implementa un carrito multi-ítem, romperá el flujo transaccional y la sincronización de inventario.
> 2. **PROHIBIDO USAR DATOS MOCKEADOS EN PRODUCCIÓN:**
>    - Queda prohibido hardcodear listas estáticas de atracciones, vehículos o alojamientos de respaldo (fallback mocks) si la API devuelve lista vacía o error.
>    - Si el backend devuelve `[]`, la app debe mostrar un estado visual de catálogo vacío ("No hay servicios disponibles en este momento") con un botón de recarga/reintento que llame nuevamente a Azure.
> 3. **PROHIBIDO MIGRAR LA CONSOLA ADMINISTRATIVA:**
>    - No añadas pestañas de CRUD de inventario de administradores, métricas de negocio ni gestión de proveedores. La app móvil es 100% para el turista o cliente final.

---

## 2. Ubicación y Aislamiento en tu Repositorio

Para evitar colisiones con tu código de servidor y garantizar un repositorio limpio:
1. Crea una carpeta dedicada en la raíz de tu repositorio (por ejemplo: `mi_app_maui/` o `MobileMauiApp/`).
2. Configura un archivo `.gitignore` dentro de esa carpeta para no subir artefactos temporales:
   ```gitignore
   bin/
   obj/
   .vs/
   *.user
   *.apk
   *.aab
   ```

---

## 3. Configuración Inicial del Proyecto (.NET MAUI)

Crea la solución MAUI orientada a .NET 8 con CLI de .NET o Visual Studio:

```bash
# 1. Crear proyecto MAUI
dotnet new maui -n SocioMobileApp

# 2. Navegar a la carpeta creada
cd SocioMobileApp

# 3. Instalar paquetes NuGet esenciales y probados
dotnet add package CommunityToolkit.Mvvm --version 8.2.2
dotnet add package QRCoder --version 1.6.0
```

---

## 4. Arquitectura de Código Recomendada (Patrón MVVM)

Organiza el proyecto bajo el patrón estándar de la industria **Model-View-ViewModel (MVVM)**:

```text
SocioMobileApp/
├── App.xaml / App.xaml.cs
├── AppShell.xaml / AppShell.xaml.cs # Navegación principal con pestañas
├── Models/
│   ├── ServicioModel.cs            # Entidad turística (Atracción, Auto, Hotel o Vuelo)
│   └── ReservaModel.cs             # Modelo de reserva con estado y fecha
├── Services/
│   └── ApiService.cs               # Cliente HttpClient centralizado con cabeceras de trazabilidad
├── ViewModels/
│   ├── CatalogoViewModel.cs        # Carga de catálogo y navegación a detalle
│   ├── DetalleViewModel.cs         # Selección de turnos/fechas y comando de reserva
│   └── MisReservasViewModel.cs     # Listado, cálculo de 24h y comando de cancelación
└── Views/
    ├── CatalogoPage.xaml           # CollectionView con tarjetas visuales y precios
    ├── DetallePage.xaml            # DatePicker, selector de horario y botón confirmar
    ├── MisReservasPage.xaml        # Historial de reservas con botón cancelar
    └── VoucherQrPage.xaml          # Renderizado de imagen QR para check-in
```

### 4.1. Modelado Resiliente y Deserialización Segura en C#

Dado que los distintos microservicios pueden retornar identificadores con nombres alternativos (`id`, `_id`, `auto_id`, `vehicle_id`, `alojamiento_id`), precios en formatos variados (número, string o sub-objeto) y fotos (lista o string único), implementa `Models/ServicioModel.cs` con propiedades tolerantes para evitar excepciones de deserialización (`JsonException` o `NullReferenceException`):

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SocioMobileApp.Models;

public class ServicioModel
{
    // Identificadores polimórficos
    [JsonPropertyName("id")]
    public string? RawId { get; set; }

    [JsonPropertyName("_id")]
    public string? RawMongoId { get; set; }

    [JsonPropertyName("auto_id")]
    public string? RawAutoId { get; set; }

    [JsonPropertyName("vehicle_id")]
    public string? RawVehicleId { get; set; }

    [JsonPropertyName("alojamiento_id")]
    public string? RawAlojamientoId { get; set; }

    [JsonIgnore]
    public string Id => !string.IsNullOrEmpty(RawId) ? RawId :
                        !string.IsNullOrEmpty(RawMongoId) ? RawMongoId :
                        !string.IsNullOrEmpty(RawAutoId) ? RawAutoId :
                        !string.IsNullOrEmpty(RawVehicleId) ? RawVehicleId :
                        !string.IsNullOrEmpty(RawAlojamientoId) ? RawAlojamientoId :
                        Guid.NewGuid().ToString();

    // Nombres y Títulos
    [JsonPropertyName("nombre")]
    public string? RawNombre { get; set; }

    [JsonPropertyName("name")]
    public string? RawName { get; set; }

    [JsonPropertyName("titulo")]
    public string? RawTitulo { get; set; }

    [JsonIgnore]
    public string Titulo => !string.IsNullOrEmpty(RawTitulo) ? RawTitulo :
                            !string.IsNullOrEmpty(RawNombre) ? RawNombre :
                            !string.IsNullOrEmpty(RawName) ? RawName : "Servicio Turístico";

    [JsonPropertyName("descripcion")]
    public string? Descripcion { get; set; }

    [JsonPropertyName("ciudad")]
    public string? Ciudad { get; set; }

    // Precios: Deserialización resiliente con JsonElement (soporta número, string u objeto con total/base)
    [JsonPropertyName("precio")]
    public JsonElement? RawPrecio { get; set; }

    [JsonPropertyName("precio_base")]
    public JsonElement? RawPrecioBase { get; set; }

    [JsonIgnore]
    public double Precio => ExtraerPrecio(RawPrecio) ?? ExtraerPrecio(RawPrecioBase) ?? 0.0;

    private static double? ExtraerPrecio(JsonElement? elemento)
    {
        if (!elemento.HasValue) return null;
        var el = elemento.Value;
        if (el.ValueKind == JsonValueKind.Number && el.TryGetDouble(out var num)) return num;
        if (el.ValueKind == JsonValueKind.String && double.TryParse(el.GetString(), out var strNum)) return strNum;
        if (el.ValueKind == JsonValueKind.Object)
        {
            if (el.TryGetProperty("total", out var totalEl) && totalEl.TryGetDouble(out var tVal)) return tVal;
            if (el.TryGetProperty("base", out var baseEl) && baseEl.TryGetDouble(out var bVal)) return bVal;
        }
        return null;
    }

    // Fotos: Deserialización resiliente (soporta array de urls o string único)
    [JsonPropertyName("fotos")]
    public JsonElement? RawFotos { get; set; }

    [JsonPropertyName("imagen")]
    public string? RawImagen { get; set; }

    [JsonIgnore]
    public string FotoPrincipal
    {
        get
        {
            if (RawFotos.HasValue)
            {
                var el = RawFotos.Value;
                if (el.ValueKind == JsonValueKind.Array && el.GetArrayLength() > 0)
                {
                    var first = el[0].GetString();
                    if (!string.IsNullOrEmpty(first)) return first;
                }
                else if (el.ValueKind == JsonValueKind.String)
                {
                    var str = el.GetString();
                    if (!string.IsNullOrEmpty(str)) return str;
                }
            }
            if (!string.IsNullOrEmpty(RawImagen)) return RawImagen;
            return "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800&q=80";
        }
    }
}
```

---

## 5. Implementación de Servicios y Conectividad HTTP

En `Services/ApiService.cs`, define la conexión con tu backend en Azure. **Incluye siempre las cabeceras estándar de trazabilidad (`X-Correlation-Id`, `Idempotency-Key`)**:

```csharp
using System.Net.Http.Json;
using System.Text.Json;

namespace SocioMobileApp.Services;

public class ApiService
{
    private readonly HttpClient _httpClient;

    // IMPORTANTE: Reemplazar con la URL HTTPS de tu API ya desplegada en Azure
    private const string BaseUrl = "https://tu-api-desplegada.azurewebsites.net/api/v3/";

    public ApiService()
    {
        _httpClient = new HttpClient { BaseAddress = new Uri(BaseUrl) };
        _httpClient.DefaultRequestHeaders.Add("Accept", "application/json");
    }

    private void InjectTraceHeaders(string? idempotencyKey = null)
    {
        _httpClient.DefaultRequestHeaders.Remove("X-Correlation-Id");
        _httpClient.DefaultRequestHeaders.Add("X-Correlation-Id", Guid.NewGuid().ToString());

        if (!string.IsNullOrEmpty(idempotencyKey))
        {
            _httpClient.DefaultRequestHeaders.Remove("Idempotency-Key");
            _httpClient.DefaultRequestHeaders.Add("Idempotency-Key", idempotencyKey);
        }
    }

    // 1. Obtener catálogo
    public async Task<List<T>> GetCatalogoAsync<T>(string endpoint = "atracciones")
    {
        InjectTraceHeaders();
        return await _httpClient.GetFromJsonAsync<List<T>>(endpoint) ?? new List<T>();
    }

    // 2. Crear reserva
    public async Task<HttpResponseMessage> CrearReservaAsync<T>(T payload, string endpoint = "reservas")
    {
        InjectTraceHeaders(Guid.NewGuid().ToString());
        return await _httpClient.PostAsJsonAsync(endpoint, payload);
    }

    // 3. Cancelar reserva
    public async Task<bool> CancelarReservaAsync(string reservaId)
    {
        InjectTraceHeaders();
        var response = await _httpClient.PostAsync($"reservas/{reservaId}/cancel", null);
        return response.IsSuccessStatusCode;
    }
}
```

---

## 6. Reglas de Negocio Esenciales en la App Móvil

### A. Regla Invariante de Cancelación (24h / 48h)
- En `ViewModels/MisReservasViewModel.cs`, **evalúa si faltan menos de 24 horas** (o 48 horas en atracciones reguladas) para el inicio del servicio y bloquea el comando de cancelación:
  ```csharp
  public bool PuedeCancelar(DateTime fechaServicio)
  {
      var horasRestantes = (fechaServicio - DateTime.Now).TotalHours;
      return horasRestantes >= 24; // 48 para atracciones si aplica tu regla
  }
  ```
- En XAML, enlaza la propiedad `IsVisible="{Binding PuedeCancelar}"` o `IsEnabled` en el botón de cancelar.

### B. Emisión de Voucher con Código QR para Check-in Offline
- Genera el código QR con la librería `QRCoder` y conviértelo a `ImageSource`:
  ```csharp
  using QRCoder;

  public ImageSource GenerarQr(string reservaId, string cliente)
  {
      var qrGenerator = new QRCodeGenerator();
      var qrCodeData = qrGenerator.CreateQrCode($"BOOKING-RESERVA:{reservaId}|CLIENTE:{cliente}", QRCodeGenerator.ECCLevel.Q);
      var qrCode = new PngByteQRCode(qrCodeData);
      byte[] qrCodeAsPngByteArr = qrCode.GetGraphic(20);
      return ImageSource.FromStream(() => new MemoryStream(qrCodeAsPngByteArr));
  }
  ```

### C. Refresco Inmediato tras Cancelación (Anti-Stale State)
- Al confirmarse la cancelación desde el backend, actualiza el estado local de la reserva a `'CANCELADA'` inmediatamente con `OnPropertyChanged()`, sin obligar al usuario a recargar la app manualmente.

### D. Sincronización en Vivo y Pull-to-Refresh
- Envuelve tu `CollectionView` de catálogo en `Views/CatalogoPage.xaml` con un control `RefreshView` enlazado a tu ViewModel para permitir al usuario deslizar hacia abajo y refrescar los ítems en tiempo real:
  ```xml
  <RefreshView IsRefreshing="{Binding IsRefreshing}"
               Command="{Binding RefreshCatalogoCommand}"
               RefreshColor="#003580">
      <CollectionView ItemsSource="{Binding Servicios}">
          <CollectionView.ItemTemplate>
              <DataTemplate>
                  <!-- Tarjeta visual del servicio -->
              </DataTemplate>
          </CollectionView.ItemTemplate>
      </CollectionView>
  </RefreshView>
  ```
- En `ViewModels/CatalogoViewModel.cs`, implementa el comando de refresco con `CommunityToolkit.Mvvm`:
  ```csharp
  [ObservableProperty]
  private bool isRefreshing;

  [RelayCommand]
  private async Task RefreshCatalogoAsync()
  {
      IsRefreshing = true;
      await CargarCatalogoAsync();
      IsRefreshing = false;
  }
  ```
- Opcionalmente, puedes inicializar un temporizador en segundo plano (`IDispatcherTimer`) con intervalo de 12 segundos para actualizar silenciosamente las capacidades y disponibilidad desde Azure.

---

## 7. Instrucciones Específicas por Tipo de Socio

Identifica cuál es tu servicio y aplica estas directrices particulares:

### 🎭 Si eres Socio de ATRACCIONES (Gloria, Dilan, Michael, Ariel, Alisson):
- **Time Slots y Aforo:** En `DetallePage.xaml`, muestra un selector interactivo de fechas que consulte los horarios disponibles (`time_slots`) y pinte botones con la **capacidad restante** en tiempo real.
- **Tickets:** Si manejas tarifas por edad (Adulto, Niño, Tercera Edad), incluye `Stepper` o botones `+ / -` independientes.

### 🚗 Si eres Socio de AUTOS (Esteban / Mateo - RutaLibre Autos):
- **Fechas y Días:** El usuario selecciona fecha/hora de retiro y fecha/hora de devolución; calcula el número de días y el costo total automáticamente.
- **Cooldown de 2 Horas:** En la ficha de detalle, muestra un indicador de estado del vehículo (disponible vs en período de inspección técnica de 2h tras entrega).

### 🏨 Si eres Socio de ALOJAMIENTOS:
- Permite seleccionar rango de fechas (Check-in / Check-out), calcula automáticamente las noches de estancia y permite elegir el Tipo de Habitación (Simple, Doble, Suite).

### ✈️ Si eres Socio de VUELOS:
- Permite seleccionar origen/destino, cantidad de pasajeros, clase (Económica / Ejecutiva) y muestra el estado del vuelo (A tiempo, En vuelo, Demorado).

---

## 8. Comandos para Probar y Compilar el APK

> [!NOTE]
> **Usuarios de Windows (PowerShell):** Ejecuta cada comando en una línea separada. En PowerShell 5.1 no encadenes instrucciones con `&&` ya que arrojará un error de sintaxis; usa `;` o ejecuta comando por comando.

```bash
# 1. Ubicarse en la carpeta móvil
cd SocioMobileApp

# 2. Restaurar dependencias NuGet
dotnet restore

# 3. Compilación y verificación estática obligatoria (garantiza cero errores de tipos)
dotnet build

# 4. Ejecutar en Windows o Emulador Android
dotnet build -t:Run -f net8.0-android

# 5. Generar archivo APK de Producción para entrega del Reto 3
dotnet publish -f net8.0-android -c Release -p:AndroidPackageFormat=apk
```
*El instalador APK final estará ubicado en:*  
`bin/Release/net8.0-android/publish/*.apk`

---

## 9. Prompt Copy-Paste para tu Agente de IA

Copia el siguiente recuadro y pégaselo directamente a tu asistente de IA (Cascade, Cursor, Copilot, ChatGPT, etc.):

```text
Hola agente. Estamos trabajando en la entrega del Reto 3 (RDA3) de la asignatura Integración de Sistemas.
Nuestro framework asignado para el cliente móvil es MICROSOFT .NET MAUI (C# / XAML con .NET 8).

INSTRUCCIONES OBLIGATORIAS Y REGLA DE ORO:
1. NO MODIFIQUES ningún archivo de nuestro backend existente ni toques controladores, entidades, DTOs ni rutas en Azure. El backend ya está funcionando y aprobado con Booking Central en el RDA2. Cualquier cambio en el backend romperá la integración.
2. Desarrolla la aplicación móvil en una carpeta nueva en la raíz de nuestro repositorio llamada 'SocioMobileApp' usando .NET MAUI y el patrón MVVM con CommunityToolkit.Mvvm.
3. La aplicación móvil se conectará como cliente HTTP a nuestra API ya desplegada en Azure, utilizando HttpClient con las cabeceras estándar 'Content-Type: application/json', 'Accept: application/json', 'X-Correlation-Id' e 'Idempotency-Key'.

GUARDRAILS Y ANTI-PATRONES OBLIGATORIOS (LO QUE NO DEBES HACER):
- PROHIBIDO CREAR UN CARRITO DE COMPRAS: Cada reserva se ejecuta de forma directa, atómica e individual enviando una cabecera 'Idempotency-Key' única (UUIDv4) con timeout de 45s. No agregues CartService ni vistas de carrito.
- PROHIBIDO USAR DATOS MOCKEADOS: Si la API responde con lista vacía o error, muestra un estado visual amigable con botón de reintento. Nunca inventes listas fijas hardcodeadas en producción.
- PROHIBIDO MIGRAR CONSOLA ADMIN: No agregues vistas de administración, gestión de inventario de administradores ni telemetría. La app es 100% para el cliente final.
- MODELADO RESILIENTE: En 'ServicioModel.cs', implementa propiedades tolerantes con JsonElement y fallbacks para identificadores ('id', '_id', 'auto_id', 'vehicle_id', 'alojamiento_id'), precios (número, string u objeto con total/base) y fotos (array o string) sin lanzar excepciones.

VISTAS ESENCIALES A IMPLEMENTAR:
1. Vista de Catálogo (CatalogoPage.xaml): Listado responsivo con Pull-to-Refresh (RefreshView sobre CollectionView), imágenes, títulos, precios en USD y botón de detalle.
2. Vista de Detalle (DetallePage.xaml): Ficha del servicio con selector de fechas/turnos, capacidad restante y botón para confirmar la reserva individual.
3. Vista de Mis Reservas (MisReservasPage.xaml): Historial de reservas con botón de cancelación (oculto si faltan menos de 24 horas para el servicio) y actualización reactiva inmediata del estado al cancelar.
4. Vista de Voucher QR (VoucherQrPage.xaml): Generación vectorial o PNG de código QR para check-in usando 'QRCoder'.

Deja el proyecto verificado con 'dotnet build' y listo para compilar con 'dotnet publish -f net8.0-android -c Release -p:AndroidPackageFormat=apk'.
```

