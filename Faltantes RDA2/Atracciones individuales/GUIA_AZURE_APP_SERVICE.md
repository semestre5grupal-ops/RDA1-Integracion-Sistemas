# Subir el backend a Azure (lo que hicimos en RutaLibre)

Son dos partes: **lo que tienes que hacer tú a mano** (5 pasos) y **un prompt para tu Claude**, que hace el resto con la CLI de Azure. A nosotros nos quedó la API siempre encendida en `https://<app>.azurewebsites.net`, con *health* en menos de 1 s y despliegue automático en cada push a `main`.

---

## Parte 1: lo que haces tú (a mano)

**1. Activar Azure for Students.**
Entra a https://azure.microsoft.com/free/students con el correo de la universidad. Da 100 USD de crédito.

**2. Instalar la CLI de Azure.**
En PowerShell ejecuta:
```powershell
winget install Microsoft.AzureCLI
```
Después **cierra y vuelve a abrir** la terminal; si no, el comando `az` no se reconoce.

**3. Iniciar sesión.**
```powershell
az login
```
Se abre el navegador. En la terminal aparece una lista de universidades "sin suscripción" (es normal) y al final **Azure for Students**: escribe su número (`1`) y Enter.

Desde aquí tu Claude ya puede crear y configurar todo. Pásale el prompt de la Parte 2.

**4. Cargar los secretos (cuando Claude te lo pida).**
Portal de Azure → tu Web App → **Configuración → Variables de entorno → + Agregar**. Pon cada variable secreta que te indique (base de datos, claves, etc.):
- Si ya tienes el backend en Render, copia los **mismos valores** de Render → Environment.
- **No** marques "Deployment slot setting".
- Al terminar: **Aplicar → Confirmar**.

Si necesitas generar una clave nueva:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**5. Conectar GitHub (cuando Claude te lo pida).**
1. Portal → tu Web App → **Overview** → **Download publish profile**. Es una contraseña: no la subas ni la compartas.
2. GitHub → tu repo → **Settings → Secrets and variables → Actions → New repository secret**.
   - Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
   - Secret: abre el archivo descargado con el Bloc de notas y pega **todo** el contenido.
3. Avísale a Claude para que haga el push.

---

## Parte 2: prompt para tu Claude

Copia esto y cambia lo que está entre `< >`:

> Quiero desplegar el backend de este repo en **Azure App Service Linux, plan B1**, con despliegue automático desde GitHub Actions. Ya hice `az login` con la suscripción *Azure for Students* (en Windows la CLI está en `C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd`). Nombre de la app: `<nombre-app>`.
>
> Lo que nos funcionó en otro equipo (RutaLibre, NestJS / Node 22):
> 1. **Regiones:** la suscripción de estudiante solo permite algunas. Revísalas con `az policy assignment list` antes de crear nada y usa la más cercana a la base de datos. Registra el proveedor `Microsoft.Web`.
> 2. **Recursos:** grupo de recursos, plan **B1 Linux** (el F1 gratis no tiene Always On) y la Web App con el runtime del proyecto.
> 3. **Configuración:** Always On, HTTP/2, TLS 1.2, solo HTTPS, FTPS desactivado y health check en la ruta de salud. Comando de inicio: migraciones → seed (si existe) → API. La app debe escuchar en `process.env.PORT` y `0.0.0.0`.
> 4. **Variables públicas por CLI**, incluidas `SCM_DO_BUILD_DURING_DEPLOYMENT=false` (el paquete va ya compilado) y `WEBSITES_CONTAINER_START_TIME_LIMIT=600`. **Las secretas no me las pidas por el chat:** dime los nombres y yo las cargo en el portal; espera a que te avise.
> 5. **Primer despliegue:** zip precompilado con `dist` + `node_modules` de producción + los archivos que la app lee en tiempo de ejecución (contratos, `.proto`). En Windows **no uses `Compress-Archive`** (deja rutas con `\`); usa Python `zipfile` o Git Bash. Despliega con `az webapp deploy --type zip --async true`, verifica `/health` y revisa los logs (`az webapp log download`).
> 6. **CI/CD:** habilita la autenticación básica de SCM (`basicPublishingCredentialsPolicies`, `allow=true`); viene desactivada y sin ella el publish profile no sirve. Luego agrega al workflow un job `deploy-azure` que corra solo en push a `main` después de los tests: build → `npm prune --omit=dev` → zip → `azure/webapps-deploy@v3` con el secreto `AZURE_WEBAPP_PUBLISH_PROFILE` → esperar a que `/health` responda. Dime cuándo crear ese secreto en GitHub.
> 7. **gRPC:** nuestro backend es un **servidor gRPC** (puerto 50051). App Service solo expone 80/443, así que configúralo para gRPC sobre **HTTP/2 + TLS en el 443** (HTTP 2.0 Proxy = gRPC Only y `HTTP20_ONLY_PORT`, según la documentación de Microsoft "Configure gRPC on App Service"). Si no es viable, propón Azure Container Apps. Al final dime la dirección exacta (`host:puerto`, con o sin TLS) que deben usar las tiendas.
>
> Muéstrame cada comando antes de ejecutarlo.

---

**Ojo con el gRPC.** En Azure no se puede abrir el puerto 50051 como en Tailscale. Si el gRPC queda por el 443 con TLS, avísanos el `host:443` y nosotros cambiamos el cliente para conectar con TLS. Mientras tanto, el respaldo HTTP `POST /api/v3/inventory/stock` también nos sirve; hoy responde 404 en `rda1-backend-integracion-sistemas.onrender.com`.
