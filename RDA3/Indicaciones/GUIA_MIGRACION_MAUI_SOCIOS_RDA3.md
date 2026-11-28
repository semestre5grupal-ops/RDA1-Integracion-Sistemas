# 🔷 Guía Oficial de Migración Móvil en .NET MAUI para Socios B2B (RDA3)

> **Asignatura:** Integración de Sistemas — 6to Semestre  
> **Plataforma Integradora:** Booking Central  
> **Framework Asignado:** **Microsoft .NET MAUI (C# / XAML)**  
> **Destinatarios:** Socios Federados (Atracciones, Autos, Alojamientos, Vuelos)  
> **Instrucciones para el Estudiante:** Entrega este archivo completo a tu agente de IA (Cascade, Cursor, Copilot, Claude o ChatGPT). Contiene todo lo necesario para construir tu app móvil como **cliente** de tu API ya desplegada en Azure, sin poner en riesgo tu backend ni la integración con Booking Central.

---

## ⚠️ 1. REGLA DE ORO INVIOLABLE: PROHIBIDO MODIFICAR EL BACKEND

> [!CAUTION]
> ### 🛑 INSTRUCCIÓN CRÍTICA PARA EL AGENTE DE IA
> - **QUEDA ESTRICTAMENTE PROHIBIDO MODIFICAR, EDITAR, REFACTORIZAR, FORMATEAR O "ARREGLAR" CUALQUIER ARCHIVO DEL BACKEND EXISTENTE** (controladores, rutas, entidades, DTOs, servicios, migraciones, variables de entorno, `Dockerfile` o scripts de despliegue en Azure). Tampoco se ejecutan despliegues ni migraciones de base de datos.
> - **NO MODIFICAR LOS CONTRATOS OPENAPI v3:** La integración B2B con Booking Central se probó y aprobó en el RDA2. Cambiar una ruta, un campo o un código de estado rompe las transacciones federadas (Sagas, cancelaciones, sincronización de cupos) y afecta la calificación de **ambos** grupos.
> - **NO INVENTAR ENDPOINTS:** La app solo consume rutas que **ya existen** en tu backend (ver §2.1). Si una vista necesita un dato que la API no expone, la vista se simplifica; la API no se cambia.
> - **LA APLICACIÓN MÓVIL ES ÚNICAMENTE UN CLIENTE CONSUMIDOR:** solo realiza peticiones HTTP a la API ya desplegada en Azure (App Service / Container Apps).
> - **LA CONSOLA ADMINISTRATIVA NO SE MIGRA A MÓVIL:** paneles de administración, monitoreo y telemetría se quedan en la web. La app es **exclusiva para el cliente / turista final**.

### 1.1 Anti-Patrones Prohibidos para el Agente de IA (Lo que NUNCA debe implementar)

> [!WARNING]
> 1. **🚫 PROHIBIDO EL CARRITO DE COMPRAS (Cart / Basket):** La integración B2B con Booking Central opera **solo con reservas atómicas individuales y directas**: el usuario confirma **una** reserva y la app hace **un** `POST` a la ruta de reservas de tu backend, con cabecera `Idempotency-Key` (UUIDv4, `Guid.NewGuid()`) y timeout de **45 segundos**. No existen `CartService`, `CartViewModel`, `CartPage`, `BasketService`, "Agregar al carrito" ni checkout multi-ítem. Un carrito rompe la orquestación transaccional y la sincronización de inventario.
> 2. **🚫 PROHIBIDO USAR MOCKS ESTÁTICOS:** Nunca devuelvas listas falsas desde un `catch` ni como "respaldo" cuando la API responde `[]`. La app debe reflejar **en vivo** lo que existe en Azure: los profesores crearán datos durante la evaluación y deben verlos aparecer. Si la API devuelve `[]` → `EmptyView` **"No hay servicios disponibles"** con botón **Reintentar**. Si falla → mensaje de error con **Reintentar**. Esto incluye **valores inventados**: no rellenes un precio ausente con `25` ni un aforo ausente con `10`, ni una foto ausente con una imagen de stock; muestra "Precio no disponible" / un ícono de marcador de posición.
> 3. **🚫 PROHIBIDO MIGRAR LA CONSOLA DE ADMINISTRACIÓN:** Cero dashboards, métricas, gestión de proveedores, CRUD de inventario o vistas de "crear/editar servicio". Solo flujos del cliente final: explorar, ver detalle, reservar, ver/cancelar sus reservas y mostrar su voucher.
> 4. **🚫 PROHIBIDO INVENTAR NAVEGACIÓN:** No agregues pestañas (`TabBar`) ni elementos de menú con secciones que no existen ("Facturas", "Admin", "Ofertas"…). Navegación mínima con `Shell` y rutas registradas: **Catálogo → Detalle → Confirmación/Voucher**, con un `ToolbarItem` **"Mis Reservas"**.

---

## 2. Ubicación y Aislamiento en tu Repositorio

1. Crea una carpeta dedicada en la raíz de tu repositorio, por ejemplo `SocioMobileApp/`. **No** muevas ni renombres nada del backend, y **no** agregues el proyecto MAUI a la solución (`.sln`) del backend.
2. Agrega un `.gitignore` dentro de esa carpeta:
   ```gitignore
   bin/
   obj/
   .vs/
   *.user
   *.apk
   *.aab
   ```

### 2.1 Descubre tu contrato real ANTES de escribir código (solo lectura)

> [!IMPORTANT]
> Las rutas que aparecen en los ejemplos de esta guía (`catalogo`, `reservas`, `reservas/{id}/cancel`) son **marcadores de posición**. El agente debe **leer (sin editar)** el backend del repositorio —controladores y, si existe, el `openapi.yaml`/Swagger— y completar esta tabla **antes** de programar. Si una fila no se puede llenar con una ruta existente, esa función no se implementa.

| Función en la app | Método + ruta real en TU backend | Campos del body / query | Forma de la respuesta |
| :--- | :--- | :--- | :--- |
| Listar catálogo | `GET /...` | filtros opcionales | ¿`[...]` o `{ data: [...] }`? |
| Detalle de un servicio | `GET /.../{id}` | — | objeto |
| Disponibilidad (turnos, fechas, cupos) | `GET /...` | `date`, … | lista |
| Crear reserva | `POST /...` | campos exactos del DTO | id / código / estado |
| Listar mis reservas | `GET /...` | `email` / cédula / token | lista |
| Cancelar reserva | `POST` o `PATCH /...` | `reason`, … | estado |

---

## 3. Configuración Inicial del Proyecto (.NET MAUI)

> [!WARNING]
> **Versión de .NET:** usa el SDK de .NET **10 (LTS)**. MAUI sobre .NET 8 ya no recibe soporte y sus plantillas fallan con los workloads actuales. Los comandos de esta guía usan el *target* `net10.0-android`; si tu `.csproj` muestra otro en `<TargetFrameworks>`, **usa el de tu `.csproj`** en todos los comandos.

Ejecuta **un comando por línea** (en PowerShell 5.1 no uses `&&`):

```powershell
# 1. Comprobar el SDK (debe empezar por 10.)
dotnet --version

# 2. Instalar el workload de MAUI para Android (una sola vez por equipo)
dotnet workload install maui-android

# 3. Crear el proyecto MAUI
dotnet new maui -n SocioMobileApp

# 4. Entrar a la carpeta
cd SocioMobileApp

# 5. Paquetes NuGet (MVVM y QR)
dotnet add package CommunityToolkit.Mvvm --version 8.4.0
dotnet add package QRCoder --version 1.6.0
```

> [!NOTE]
> La plantilla de MAUI ya declara el permiso `INTERNET` en `Platforms/Android/AndroidManifest.xml`; no lo borres. Usa siempre la URL **HTTPS** de Azure: Android bloquea `http://` en release.

---

## 4. Arquitectura de Código Recomendada (Patrón MVVM)

```text
SocioMobileApp/
├── MauiProgram.cs                 # Registro DI: ApiService (singleton), ViewModels y Pages
├── App.xaml / AppShell.xaml        # Shell con rutas registradas (sin TabBar)
├── Models/
│   ├── JsonCampos.cs              # Helpers tolerantes sobre JsonElement
│   ├── ServicioModel.cs           # Servicio (Atracción, Auto, Hotel o Vuelo)
│   └── ReservaModel.cs            # Reserva con fecha, estado y regla de cancelación
├── Services/
│   └── ApiService.cs              # HttpClient: cabeceras por petición, timeouts, RFC 7807
├── ViewModels/
│   ├── CatalogoViewModel.cs       # Carga, refresh, sondeo y navegación a detalle
│   ├── DetalleViewModel.cs        # Fechas/turnos y comando de reserva (Idempotency-Key)
│   └── MisReservasViewModel.cs    # Listado, regla de 24 h y cancelación
└── Views/
    ├── CatalogoPage.xaml          # RefreshView + CollectionView + EmptyView
    ├── DetallePage.xaml           # DatePicker/TimePicker, turnos y "Reservar"
    ├── MisReservasPage.xaml       # Historial y cancelación
    └── VoucherQrPage.xaml         # Imagen QR para check-in
```

### 4.1 Modelado Resiliente y Deserialización Polimórfica (`ServicioModel.cs`)

Los microservicios de los socios no comparten nombres ni tipos: `id` vs `_id` vs `auto_id`, precios como `45`, `"45.00"` o `{ "total": 45 }`, fotos como lista de textos, lista de objetos `{ "url": ... }` o un texto suelto.

> [!CAUTION]
> Con `System.Text.Json`, declarar `public string? Id` y recibir `"id": 7` (número) **lanza `JsonException`** y se pierde toda la lista. Por eso el modelo **no** declara propiedades tipadas para los campos del socio: captura **todos** los campos como `JsonElement` con `[JsonExtensionData]` y expone propiedades calculadas que nunca lanzan.

```csharp
// Models/JsonCampos.cs
using System.Globalization;
using System.Text.Json;

namespace SocioMobileApp.Models;

public static class JsonCampos
{
    /// <summary>Primer valor no vacío entre <paramref name="claves"/>, como texto (acepta números).</summary>
    public static string? Texto(IReadOnlyDictionary<string, JsonElement> campos, params string[] claves)
    {
        foreach (var k in claves)
        {
            if (!campos.TryGetValue(k, out var el)) continue;
            var s = el.ValueKind switch
            {
                JsonValueKind.String => el.GetString(),
                JsonValueKind.Number => el.GetRawText(),
                _ => null,
            };
            if (!string.IsNullOrWhiteSpace(s)) return s.Trim();
        }
        return null;
    }

    /// <summary>Número desde 45, "45.00", "$1,250.50" u objeto {total|amount|adult|value}. null si no se puede.</summary>
    public static double? Numero(JsonElement el)
    {
        switch (el.ValueKind)
        {
            case JsonValueKind.Number:
                return el.TryGetDouble(out var n) ? n : null;
            case JsonValueKind.String:
                var limpio = new string((el.GetString() ?? "").Where(c => char.IsDigit(c) || c is '.' or '-').ToArray());
                return double.TryParse(limpio, NumberStyles.Float, CultureInfo.InvariantCulture, out var s) ? s : null;
            case JsonValueKind.Object:
                foreach (var k in new[] { "total", "amount", "adult", "value", "precio", "price" })
                    if (el.TryGetProperty(k, out var sub) && Numero(sub) is double v) return v;
                return null;
            default:
                return null;
        }
    }

    public static double? Numero(IReadOnlyDictionary<string, JsonElement> campos, params string[] claves)
    {
        foreach (var k in claves)
            if (campos.TryGetValue(k, out var el) && Numero(el) is double v) return v;
        return null;
    }

    /// <summary>Elementos de una respuesta `[...]`, `{data:[...]}`, `{items:[...]}` o `{results:[...]}`.</summary>
    public static IEnumerable<JsonElement> Lista(JsonElement raiz)
    {
        var lista = raiz;
        if (raiz.ValueKind == JsonValueKind.Object)
        {
            foreach (var k in new[] { "data", "items", "results", "content" })
                if (raiz.TryGetProperty(k, out var sub) && sub.ValueKind == JsonValueKind.Array) { lista = sub; break; }
        }
        if (lista.ValueKind != JsonValueKind.Array) yield break;
        foreach (var item in lista.EnumerateArray())
            if (item.ValueKind == JsonValueKind.Object) yield return item;
    }
}
```

```csharp
// Models/ServicioModel.cs
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SocioMobileApp.Models;

public class ServicioModel
{
    /// <summary>TODOS los campos del socio, sin importar nombre ni tipo. Nunca lanza JsonException.</summary>
    [JsonExtensionData]
    public Dictionary<string, JsonElement> Campos { get; set; } = new();

    // 1. Identificador tolerante (numérico o texto). "" si no viene: nunca un Guid aleatorio.
    public string Id => JsonCampos.Texto(Campos, "id", "_id", "auto_id", "vehicle_id", "vehiculo_id",
        "alojamiento_id", "atraccion_id", "offer_id", "offerId", "vuelo_id") ?? "";

    public string Titulo => JsonCampos.Texto(Campos, "nombre", "name", "titulo", "title", "vehiculo", "modelo")
        ?? "Servicio sin nombre";

    public string? Ciudad => JsonCampos.Texto(Campos, "ciudad", "city", "destino");

    // 2. Precio tolerante. null = "Precio no disponible" (no se inventa).
    public double? Precio
    {
        get
        {
            var p = JsonCampos.Numero(Campos, "precio", "price", "precio_diario", "precio_por_noche",
                "precio_por_dia", "tarifa", "precio_base");
            return p is > 0 ? p : null;
        }
    }

    public string PrecioTexto => Precio is double p ? $"US$ {p:0.00}" : "Precio no disponible";

    // 3. Aforo/stock. null = el socio no lo informa.
    public int? CuposDisponibles => JsonCampos.Numero(Campos, "cupos_disponibles", "cupos", "stock", "available_spots")
        is double c ? (int)Math.Round(c) : null;

    // 4. Foto: lista de textos, lista de objetos {url} o campo directo. null = mostrar marcador de posición.
    public string? FotoPrincipal
    {
        get
        {
            foreach (var k in new[] { "photos", "fotos", "imagenes" })
            {
                if (!Campos.TryGetValue(k, out var el) || el.ValueKind != JsonValueKind.Array || el.GetArrayLength() == 0) continue;
                var primera = el[0];
                var url = primera.ValueKind switch
                {
                    JsonValueKind.String => primera.GetString(),
                    JsonValueKind.Object when primera.TryGetProperty("url", out var u) && u.ValueKind == JsonValueKind.String => u.GetString(),
                    _ => null,
                };
                if (url?.StartsWith("http") == true) return url;
            }
            var directa = JsonCampos.Texto(Campos, "foto_url", "imagen_url", "image_url", "imagen", "image");
            return directa?.StartsWith("http") == true ? directa : null;
        }
    }

    // 5. Proveedor: objeto {nombre|name} o texto plano
    public string? Proveedor
    {
        get
        {
            if (Campos.TryGetValue("proveedor", out var p) && p.ValueKind == JsonValueKind.Object)
            {
                var anidado = p.EnumerateObject().ToDictionary(x => x.Name, x => x.Value);
                return JsonCampos.Texto(anidado, "nombre", "name");
            }
            return JsonCampos.Texto(Campos, "proveedor", "proveedor_nombre", "company");
        }
    }
}
```

> [!NOTE]
> Si un ítem trae un campo con un nombre que no está en estas listas, **agrega el nombre a la lista**; nunca descartes el ítem ni lo reemplaces por un mock.

---

## 5. Implementación de Servicios y Conectividad HTTP

> [!CAUTION]
> **No modifiques `HttpClient.DefaultRequestHeaders` por petición.** Ese objeto lo comparten todas las peticiones: con el sondeo y una reserva en paralelo, las cabeceras se mezclan y la `Idempotency-Key` de una reserva viaja en la siguiente petición. Las cabeceras variables van en cada `HttpRequestMessage`.

`Services/ApiService.cs` (registrado como singleton en `MauiProgram.cs`: `builder.Services.AddSingleton<ApiService>();`):

```csharp
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using SocioMobileApp.Models;

namespace SocioMobileApp.Services;

public class ApiException(int status, string mensaje) : Exception(mensaje)
{
    public int Status { get; } = status;
}

public class ApiService
{
    // IMPORTANTE: la URL HTTPS de tu API ya desplegada en Azure, terminada en "/"
    public const string BaseUrl = "https://tu-api-desplegada.azurewebsites.net/api/v3/";
    private static readonly TimeSpan TimeoutLectura = TimeSpan.FromSeconds(20);
    private static readonly TimeSpan TimeoutReserva = TimeSpan.FromSeconds(45); // reservas y cancelaciones

    private readonly HttpClient _http = new() { BaseAddress = new Uri(BaseUrl), Timeout = Timeout.InfiniteTimeSpan };

    private async Task<JsonElement> EnviarAsync(HttpMethod metodo, string ruta, object? cuerpo, string? idempotencyKey, TimeSpan timeout)
    {
        using var req = new HttpRequestMessage(metodo, ruta);
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        req.Headers.Add("X-Correlation-Id", Guid.NewGuid().ToString());
        if (idempotencyKey is not null) req.Headers.Add("Idempotency-Key", idempotencyKey);
        if (cuerpo is not null)
            req.Content = new StringContent(JsonSerializer.Serialize(cuerpo), Encoding.UTF8, "application/json");

        using var cts = new CancellationTokenSource(timeout);
        HttpResponseMessage res;
        try
        {
            res = await _http.SendAsync(req, cts.Token);
        }
        catch (OperationCanceledException)
        {
            throw new ApiException(0, "El servidor tardó demasiado en responder.");
        }
        catch (HttpRequestException)
        {
            throw new ApiException(0, "No se pudo conectar con el servidor. Revisa tu conexión.");
        }

        using (res)
        {
            var texto = await res.Content.ReadAsStringAsync();
            JsonElement json = default;
            try { if (!string.IsNullOrWhiteSpace(texto)) json = JsonDocument.Parse(texto).RootElement.Clone(); } catch (JsonException) { }

            if (res.IsSuccessStatusCode) return json;

            // ProblemDetails RFC 7807: { title, detail, status }
            var mensaje = $"Error del servidor (HTTP {(int)res.StatusCode}).";
            if (json.ValueKind == JsonValueKind.Object)
                foreach (var k in new[] { "detail", "message", "title" })
                    if (json.TryGetProperty(k, out var m) && m.ValueKind == JsonValueKind.String) { mensaje = m.GetString()!; break; }
            throw new ApiException((int)res.StatusCode, mensaje);
        }
    }

    /// <summary>Catálogo. Lanza ApiException: la VISTA decide qué mostrar. Un ítem malformado se omite.</summary>
    public async Task<List<ServicioModel>> GetCatalogoAsync()
    {
        var raiz = await EnviarAsync(HttpMethod.Get, "catalogo", null, null, TimeoutLectura); // ← ruta real (§2.1)
        var items = new List<ServicioModel>();
        foreach (var el in JsonCampos.Lista(raiz))
        {
            try { if (el.Deserialize<ServicioModel>() is { } s) items.Add(s); }
            catch (JsonException) { }
        }
        return items;
    }

    /// <summary>Reserva atómica con la clave de idempotencia del intento actual (ver §5.1).</summary>
    public Task<JsonElement> CrearReservaAsync(object payload, string idempotencyKey) =>
        EnviarAsync(HttpMethod.Post, "reservas", payload, idempotencyKey, TimeoutReserva); // ← ruta real (§2.1)

    public Task<JsonElement> CancelarReservaAsync(string reservaId, string motivo, string idempotencyKey) =>
        EnviarAsync(HttpMethod.Post, $"reservas/{Uri.EscapeDataString(reservaId)}/cancel", // ← ruta real (§2.1)
            new { reason = motivo }, idempotencyKey, TimeoutReserva);
}
```

### 5.1 Uso correcto de la `Idempotency-Key`

> [!IMPORTANT]
> La clave identifica **una intención de compra**, no una petición HTTP. Genérala **una vez** cuando el usuario abre la confirmación y **reutilízala** si reintenta tras un timeout o un error de red: así el backend devuelve la misma reserva en vez de crear dos (y no descuenta dos cupos). Genera una nueva solo cuando la reserva terminó con éxito o el usuario cambia los datos (fecha, turno, cantidades).

```csharp
public partial class DetalleViewModel(ApiService api) : ObservableObject
{
    // Una por intento; se renueva solo tras el éxito o si cambian los datos de la reserva.
    private string _idempotencyKey = Guid.NewGuid().ToString();

    [ObservableProperty] private string? error;

    [RelayCommand(AllowConcurrentExecutions = false)] // el botón se deshabilita mientras se ejecuta: no hay doble toque
    private async Task ReservarAsync()
    {
        Error = null;
        try
        {
            var reserva = await api.CrearReservaAsync(ConstruirPayload(), _idempotencyKey);
            _idempotencyKey = Guid.NewGuid().ToString();
            await Shell.Current.GoToAsync("voucher", new Dictionary<string, object> { ["reserva"] = reserva });
        }
        catch (ApiException e)
        {
            Error = $"{e.Message} Reintenta: no se duplicará tu reserva.";
        }
    }

    private object ConstruirPayload() => new { /* campos exactos del DTO de tu backend (§2.1) */ };
}
```

### 5.2 Autenticación, Supabase y URLs vigentes (si tu API protege rutas)

> [!WARNING]
> - **URL y variables vigentes:** coloca en `BaseUrl` la URL HTTPS actual de tu API en Azure (no uses URLs viejas de pruebas o servidores obsoletos en Render). Recuerda que los `.env` / secretos no se suben a GitHub: revisa las variables vigentes de tu despliegue web.
> - **Ante un `401 Unauthorized`, NO toques el backend:** queda prohibido desactivar guards/middlewares de autenticación en el servidor. Implementa el login en MAUI o agrega `req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);` en `HttpRequestMessage`.
> - **PROHIBIDO usar `service_role` o secretos en móvil:** un APK se puede decompilar. Si tu app usa Supabase Auth, usa **solo** `SUPABASE_URL` y `ANON_KEY` vigentes de tu web de producción (nunca `service_role` ni secretos de BD).

---

## 6. Reglas de Negocio Esenciales en la App Móvil

### A. Regla de Cancelación (24 h)
- El **backend decide** si una cancelación procede; la app solo **refleja** la regla para no ofrecer un botón que fallará. Usa la misma ventana que tu backend (24 h en el RDA2, salvo que tu política diga otra cosa) y, si el backend rechaza igualmente, muestra su mensaje (`ApiException.Message`).
  ```csharp
  // En ReservaModel: propiedad calculada para enlazar desde XAML.
  public bool PuedeCancelar => (FechaServicio - DateTime.Now).TotalHours >= 24;
  ```
  ```xml
  <Button Text="Cancelar reserva" IsVisible="{Binding PuedeCancelar}"
          Command="{Binding Source={RelativeSource AncestorType={x:Type vm:MisReservasViewModel}}, Path=CancelarCommand}"
          CommandParameter="{Binding .}" />
  ```

### B. Voucher con Código QR para Check-in
- El contenido del QR es el **identificador real** que devolvió tu backend (código/PNR), no uno inventado. `QRCoder` genera un PNG que se muestra como `ImageSource`:
  ```csharp
  using QRCoder;

  public static ImageSource GenerarQr(string codigoReserva)
  {
      using var generador = new QRCodeGenerator();
      using var datos = generador.CreateQrCode($"BOOKING-RESERVA:{codigoReserva}", QRCodeGenerator.ECCLevel.Q);
      var png = new PngByteQRCode(datos).GetGraphic(20);
      return ImageSource.FromStream(() => new MemoryStream(png));
  }
  ```

### C. Refresco Inmediato tras Cancelar (Anti-Stale State)
- Si el backend confirma la cancelación, cambia el `Estado` de la reserva a `CANCELADA` (propiedad `[ObservableProperty]`, que notifica a la vista) **y** recarga la lista desde la API para mostrar lo que el servidor registró.
- Oculta el botón **"Cancelar"** cuando el estado ya sea `CANCELADA` o `ASISTIDA` / `CONFIRMED_ATTENDED`.
- **Evita el rebote de estado con el sondeo:** incrementa un contador de versión (`_epoch++`) al cancelar o refrescar y descarta cualquier respuesta de sondeo que haya iniciado antes de esa acción (para que un `GET` lento en vuelo no vuelva a pintar `CONFIRMED` sobre una tarjeta recién cancelada).

### D. Sincronización en Vivo y Pull-to-Refresh

`Views/CatalogoPage.xaml` con los cuatro estados (cargando, error, vacío, datos). `RefreshView` pone `IsRefreshing = true` al deslizar, por eso el enlace es `TwoWay`; el `EmptyView` muestra el estado vacío o el error con **Reintentar**.

```xml
<?xml version="1.0" encoding="utf-8" ?>
<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui"
             xmlns:x="http://schemas.microsoft.com/winfx/2009/xaml"
             xmlns:vm="clr-namespace:SocioMobileApp.ViewModels"
             xmlns:m="clr-namespace:SocioMobileApp.Models"
             x:Class="SocioMobileApp.Views.CatalogoPage"
             x:DataType="vm:CatalogoViewModel"
             Title="Catálogo">
    <ContentPage.ToolbarItems>
        <ToolbarItem Text="Mis Reservas" Command="{Binding IrAMisReservasCommand}" />
    </ContentPage.ToolbarItems>

    <RefreshView IsRefreshing="{Binding IsRefreshing, Mode=TwoWay}"
                 Command="{Binding RefreshCatalogoCommand}"
                 RefreshColor="#003580">
        <CollectionView x:Name="ListaCatalogo"
                        ItemsSource="{Binding Servicios}"
                        SelectionMode="Single"
                        SelectionChangedCommand="{Binding VerDetalleCommand}"
                        SelectionChangedCommandParameter="{Binding SelectedItem, Source={RelativeSource Self}}">
            <CollectionView.EmptyView>
                <VerticalStackLayout Padding="32" Spacing="12" HorizontalOptions="Center" VerticalOptions="Center">
                    <ActivityIndicator IsRunning="{Binding Cargando}" IsVisible="{Binding Cargando}" />
                    <Label Text="{Binding MensajeVacio}" HorizontalTextAlignment="Center" />
                    <Button Text="Reintentar" Command="{Binding RefreshCatalogoCommand}" />
                </VerticalStackLayout>
            </CollectionView.EmptyView>
            <CollectionView.ItemTemplate>
                <DataTemplate x:DataType="m:ServicioModel">
                    <Grid Padding="12" ColumnDefinitions="64,*" ColumnSpacing="12">
                        <Image Source="{Binding FotoPrincipal}" WidthRequest="64" HeightRequest="64" Aspect="AspectFill" />
                        <VerticalStackLayout Grid.Column="1">
                            <Label Text="{Binding Titulo}" FontAttributes="Bold" />
                            <Label Text="{Binding PrecioTexto}" />
                        </VerticalStackLayout>
                    </Grid>
                </DataTemplate>
            </CollectionView.ItemTemplate>
        </CollectionView>
    </RefreshView>
</ContentPage>
```

`ViewModels/CatalogoViewModel.cs` con `CommunityToolkit.Mvvm`: comando de refresco, sondeo silencioso cada 12 s que **arranca en `OnAppearing` y se detiene en `OnDisappearing`**, y sin solapar peticiones.

```csharp
using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SocioMobileApp.Models;
using SocioMobileApp.Services;

namespace SocioMobileApp.ViewModels;

public partial class CatalogoViewModel(ApiService api) : ObservableObject
{
    private IDispatcherTimer? _sondeo;
    private bool _enCurso;

    public ObservableCollection<ServicioModel> Servicios { get; } = new();

    [ObservableProperty] private bool isRefreshing;
    [ObservableProperty] private bool cargando = true;
    [ObservableProperty] private string mensajeVacio = "Cargando…";

    [RelayCommand]
    private async Task RefreshCatalogoAsync()
    {
        try { await CargarAsync(silencioso: false); }
        finally { IsRefreshing = false; }
    }

    private async Task CargarAsync(bool silencioso)
    {
        if (_enCurso) return; // no solapar peticiones
        _enCurso = true;
        try
        {
            var items = await api.GetCatalogoAsync();
            Servicios.Clear();
            foreach (var s in items) Servicios.Add(s);
            MensajeVacio = "No hay servicios disponibles en este momento.";
        }
        catch (ApiException e)
        {
            // En el sondeo se conserva lo último real; en carga explícita se informa.
            if (!silencioso) MensajeVacio = $"No se pudo cargar el catálogo. {e.Message}";
        }
        finally
        {
            _enCurso = false;
            Cargando = false;
        }
    }

    /// <summary>Llamar desde CatalogoPage.OnAppearing.</summary>
    public async Task IniciarAsync(IDispatcher dispatcher)
    {
        await CargarAsync(silencioso: false);
        _sondeo ??= dispatcher.CreateTimer();
        _sondeo.Interval = TimeSpan.FromSeconds(12);
        _sondeo.Tick -= OnTick;
        _sondeo.Tick += OnTick;
        _sondeo.Start();
    }

    /// <summary>Llamar desde CatalogoPage.OnDisappearing: sin esto sigue llamando a la API.</summary>
    public void Detener() => _sondeo?.Stop();

    private async void OnTick(object? sender, EventArgs e) => await CargarAsync(silencioso: true);

    [RelayCommand]
    private Task VerDetalleAsync(ServicioModel? servicio) =>
        servicio is null ? Task.CompletedTask
            : Shell.Current.GoToAsync("detalle", new Dictionary<string, object> { ["servicio"] = servicio });

    [RelayCommand]
    private Task IrAMisReservasAsync() => Shell.Current.GoToAsync("misreservas");
}
```

```csharp
// Views/CatalogoPage.xaml.cs
public partial class CatalogoPage : ContentPage
{
    private readonly CatalogoViewModel _vm;
    public CatalogoPage(CatalogoViewModel vm) { InitializeComponent(); BindingContext = _vm = vm; }
    protected override async void OnAppearing()
    {
        base.OnAppearing();
        ListaCatalogo.SelectedItem = null; // permite volver a tocar el mismo ítem al regresar de Detalle
        await _vm.IniciarAsync(Dispatcher);
    }
    protected override void OnDisappearing() { base.OnDisappearing(); _vm.Detener(); }
}
```

---

## 7. Instrucciones Específicas por Tipo de Socio

> [!NOTE]
> Los nombres de campo de cada vertical salen de **tu** backend (§2.1). Las listas de opciones (tipos de habitación, clases, categorías) se obtienen de la API; **no** se escriben a mano en la app.

### 🎭 Si eres Socio de ATRACCIONES (Gloria, Dilan, Michael, Ariel, Alisson)
- **Turnos (`time_slots`) y aforo:** al elegir fecha (`DatePicker` con `MinimumDate` = hoy) consulta la ruta de disponibilidad de tu backend y pinta un botón tipo chip por turno con su **aforo restante** (`"10:00 · 6 cupos"`) en un `CollectionView` horizontal. Turno con 0 cupos o estado `AGOTADO` → `IsEnabled="False"`. Refresca los turnos cada 10–12 s mientras la vista esté abierta.
- **Tickets por edad:** `Stepper` (o botones `−/+`) independientes para Adulto y Niño (y Tercera Edad/Infante si tu API los admite) con al menos 1 adulto, y **suma total ≤ aforo del turno**. Total = Σ (cantidad × precio de su categoría).
- **Tarifa única:** si tu API no distingue edades, muestra **un solo** `Stepper` "Personas (Entrada General)" y envía el total como adultos.

### 🚗 Si eres Socio de AUTOS (Esteban / Mateo — RutaLibre Autos)
- **Rango fecha/hora:** `DatePicker` + `TimePicker` para retiro y para devolución; la devolución debe ser **posterior** al retiro.
- **Días y tarifa automáticos:** `dias = max(1, ceil(horas / 24))` y `total = dias × precio_diario` (más los recargos que tu API devuelva). Muestra el desglose antes de confirmar.
  ```csharp
  public static int DiasRenta(DateTime retiro, DateTime devolucion)
  {
      var horas = (devolucion - retiro).TotalHours;
      return horas <= 24 ? 1 : (int)Math.Ceiling(horas / 24);
  }
  ```
- **Cooldown de 2 horas (inspección técnica):** tras cada entrega el vehículo queda 2 h en limpieza/inspección. Muestra un badge **"Disponible"** o **"En inspección técnica — disponible a las 14:30"** a partir del estado/fecha que **tu API** expone (p. ej. `estado: "EN_LIMPIEZA"` o una marca de fin de cooldown) y deshabilita "Reservar" mientras dure. No simules el cooldown en la app si la API no lo informa.

### 🏨 Si eres Socio de ALOJAMIENTOS
- **Check-in / Check-out:** dos `DatePicker` (el de salida con `MinimumDate` = check-in + 1 día).
- **Noches:** `noches = Math.Max(1, (checkOut.Date - checkIn.Date).Days)`. **Total** = noches × precio por noche del tipo elegido × habitaciones.
- **Tipo de habitación (Simple, Doble, Suite…):** `Picker` construido con los tipos que devuelve tu API (nombre, capacidad, precio, disponibilidad). Tipo sin disponibilidad → no seleccionable.

### ✈️ Si eres Socio de VUELOS
- **Origen/Destino:** `Picker` de códigos IATA con validación **origen ≠ destino**.
- **Pasajeros:** `Stepper` con al menos 1 adulto y bebés ≤ adultos.
- **Clase (Económica / Ejecutiva):** solo las clases con disponibilidad que traiga la oferta.
- **Badge de estado:** mapea el estado de tu API a un `Border` de color: `SCHEDULED/ON_TIME` → "A tiempo" (verde), `DELAYED` → "Demorado" (ámbar), `IN_FLIGHT/DEPARTED` → "En vuelo" (azul), `CANCELLED` → "Cancelado" (rojo); un estado desconocido se muestra tal cual.

---

## 8. Comandos para Verificar y Compilar el APK

> [!NOTE]
> **Windows (PowerShell 5.1):** ejecuta **un comando por línea**. No uses `&&` (en PowerShell 5.1 es un error de sintaxis); si necesitas encadenar, usa `;`. Sustituye `net10.0-android` por el *target* de tu `.csproj` si es distinto.

```powershell
# 1. Entrar a la carpeta de la app
cd SocioMobileApp

# 2. Restaurar paquetes NuGet
dotnet restore

# 3. Verificación estática OBLIGATORIA: debe terminar con "0 Error(s)" antes de publicar
dotnet build -f net10.0-android

# 4. Ejecutar en el emulador o celular Android conectado
dotnet build -t:Run -f net10.0-android

# 5. APK de producción para la entrega
dotnet publish -f net10.0-android -c Release -p:AndroidPackageFormat=apk
```

*El APK firmado queda en:* `bin\Release\net10.0-android\publish\` (archivo `*-Signed.apk`). Instálalo en un celular real y confirma que el catálogo carga con la URL de Azure.

---

## 9. Prompt Copy-Paste para tu Agente de IA

> [!IMPORTANT]
> **Copia o adjunta el archivo `.md` completo, no solo este recuadro.** Así tu agente podrá consultar las secciones **§2.1** (descubrimiento de rutas reales), **§4.1** (`JsonCampos` y `ServicioModel`), **§5** (`ApiService` e `Idempotency-Key`), **§6.D** (`CatalogoPage` y `CatalogoViewModel`) y **§7** (reglas de tu vertical).

```text
Hola agente. Trabajamos en el Reto 3 (RDA3) de Integración de Sistemas. Framework asignado: .NET MAUI (C# / XAML, .NET 10).
Vas a construir una app móvil que es SOLO un cliente HTTP de nuestra API ya desplegada en Azure.

REGLA DE ORO (NO NEGOCIABLE):
1. NO modifiques, formatees ni "arregles" NINGÚN archivo del backend (controladores, rutas, DTOs, entidades, migraciones, appsettings, Dockerfile, scripts de Azure). No despliegues nada y no agregues el proyecto MAUI a la solución del backend. El backend y sus contratos OpenAPI ya están aprobados con Booking Central (RDA2); cualquier cambio rompe la integración.
2. NO inventes endpoints. Primero LEE (sin editar) el backend del repositorio y escríbeme una tabla con las rutas reales para: listar catálogo, detalle, disponibilidad, crear reserva, listar mis reservas y cancelar (método, ruta, body, forma de la respuesta). Usa solo esas rutas.
3. Crea la app en una carpeta nueva 'SocioMobileApp' en la raíz con .NET MAUI, MVVM (CommunityToolkit.Mvvm) e inyección de dependencias en MauiProgram.cs.

PROHIBIDO:
- Carrito de compras (CartService, CartViewModel, CartPage). Cada reserva es individual y directa: un POST con cabecera 'Idempotency-Key' (Guid) y timeout de 45 s. La clave se genera UNA vez por intento en el ViewModel y se reutiliza en los reintentos.
- Mocks o datos inventados: nada de listas falsas en un catch, ni precio/cupos/fotos por defecto. Si la API devuelve [] muestra EmptyView "No hay servicios disponibles" con botón Reintentar; si falla, el error con Reintentar.
- Consola de administración, dashboards, métricas o CRUD de inventario. La app es solo para el cliente final.
- TabBar o menús con secciones inexistentes. Navegación con Shell: Catálogo → Detalle → Voucher, y ToolbarItem "Mis Reservas".
- Desactivar la autenticación del backend ante un 401 o incrustar claves privadas (service_role, secretos). Usa la URL HTTPS vigente en Azure y, si tu API exige login/Supabase, usa la ANON_KEY vigente de tu web y envía 'Authorization: Bearer <token>'.

OBLIGATORIO:
- ServicioModel con [JsonExtensionData] Dictionary<string, JsonElement> y propiedades calculadas que nunca lanzan: ids ('id','_id','auto_id','vehicle_id','alojamiento_id','atraccion_id','offer_id', numéricos o texto), precios (número, texto u objeto {total|amount}), fotos (lista de textos, lista de {url} o texto) y respuestas [ ] o {data:[ ]}. Nada de 'public string? Id' tipado (un id numérico lanza JsonException). El Id nunca es un Guid aleatorio.
- HttpClient singleton con cabeceras por petición en HttpRequestMessage (nunca modificar DefaultRequestHeaders): 'Accept: application/json', 'X-Correlation-Id', 'Idempotency-Key' cuando aplique; errores mostrando 'detail' del ProblemDetails.
- Catálogo con RefreshView (IsRefreshing TwoWay) sobre CollectionView con EmptyView, limpia SelectedItem = null al volver (OnAppearing) para poder reabrir el mismo ítem, RelayCommand de refresco y sondeo IDispatcherTimer de 12 s que arranca en OnAppearing y se detiene en OnDisappearing, sin borrar datos si falla.
- Mis Reservas: cancelación solo si faltan >= 24 h (el backend tiene la última palabra) y refresco inmediato del estado.
- Voucher con QRCoder usando el código real devuelto por la API.
- Sigue la implementación de referencia de las secciones 2.1, 4.1, 5, 6.D y las reglas de mi vertical de la sección 7 de la guía.

ENTREGA: 'dotnet build -f net10.0-android' con 0 errores y APK generado con 'dotnet publish -f net10.0-android -c Release -p:AndroidPackageFormat=apk'. En Windows PowerShell no uses '&&': un comando por línea.
```

---

## 10. Checklist de Aceptación (revísalo antes de entregar)

- [ ] `git status` no muestra cambios fuera de `SocioMobileApp/` (el backend y su `.sln` están intactos).
- [ ] La tabla de §2.1 está completa y la app usa solo esas rutas.
- [ ] Con la API devolviendo `[]` se ve el `EmptyView` con **Reintentar** (no datos falsos).
- [ ] Un ítem creado en Azure aparece en la app sin reinstalarla (pull-to-refresh o sondeo).
- [ ] Un doble toque en "Reservar" crea **una sola** reserva.
- [ ] No existe ningún archivo, servicio o vista de carrito ni de administración.
- [ ] `dotnet build -f net10.0-android` termina con 0 errores y el APK carga datos en un celular real.
