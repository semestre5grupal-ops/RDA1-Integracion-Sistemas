# Despliegue del backend en Google Cloud (gratis, con gRPC)

**Arquitectura:** una VM `e2-micro` (nivel Always Free) con Docker.
- **Caddy** pone HTTPS automático.
- **REST** queda en `https://api.<ip>.sslip.io/api`.
- **gRPC con TLS** queda en `grpc.<ip>.sslip.io:50051`.
- Cada push a `main` despliega solo, mediante GitHub Actions.

La base de datos sigue en Supabase y el frontend sigue en Vercel.

## 1. Crear la VM (una sola vez)
En Google Cloud Console, ve a **Compute Engine → Instancias de VM → Crear instancia** y configura:
- **Región:** `us-central1` (Iowa), `us-east1` o `us-west1`. Solo estas son gratis.
- **Tipo de máquina:** `e2-micro`.
- **Disco de arranque:** Debian 12 o Ubuntu 24.04, **disco estándar** de 30 GB (no balanceado ni SSD).
- **Firewall:** marca *Permitir tráfico HTTP* y *Permitir tráfico HTTPS*.

Después:
1. En **Red de VPC → Direcciones IP**, reserva como **estática** la IP externa de la VM. Así no cambia al reiniciar.
2. En **Red de VPC → Firewall → Crear regla**, permite la entrada por el puerto TCP `50051` desde `0.0.0.0/0`.

## 2. Preparar la VM
Entra con el botón **SSH** de la consola y ejecuta:
```bash
curl -fsSL https://raw.githubusercontent.com/semestre5grupal-ops/rda1-integracion-sistemas/main/deploy/setup-vm.sh | bash
nano ~/booking/.env
```
En `.env` pega **todas** las variables que hoy tienes en Render (Environment): `DATABASE_URL`, `SUPABASE_*`, `ADMIN_EMAILS`, `SMTP_*`, `GROQ_*`, `WEBHOOK_SECRET_*`, etc. Deja también `API_DOMAIN` y `GRPC_DOMAIN`, que el script ya rellenó.

## 3. Conectar GitHub (despliegue automático)
1. En tu PC, genera una llave solo para el despliegue:
   ```bash
   ssh-keygen -t ed25519 -f booking-deploy -N ""
   ```
2. En la VM, autoriza la llave pública. Pega el contenido de `booking-deploy.pub` en lugar del marcador:
   ```bash
   echo "CONTENIDO_DE_booking-deploy.pub" >> ~/.ssh/authorized_keys
   ```
3. En GitHub, ve a **Settings → Secrets and variables → Actions** y crea estos secretos:
   - `GCP_VM_HOST`: la IP estática de la VM.
   - `GCP_VM_USER`: tu usuario en la VM (el que muestra `whoami`).
   - `GCP_VM_SSH_KEY`: el contenido completo del archivo privado `booking-deploy`.
4. Haz merge a `main`, o lanza **Actions → Deploy backend a Google Cloud → Run workflow**. El primer despliegue tarda unos 5 minutos.

## 4. Comprobar
- Abre `https://api.<ip>.sslip.io/api/docs` en el navegador.
- Desde la VM, revisa los logs con `cd ~/booking && docker compose logs -f app`.
- En **Vercel**, cambia `VITE_API_URL` a `https://api.<ip>.sslip.io/api/v1` y vuelve a desplegar el frontend.
- A las aerolíneas dales `grpc.<ip>.sslip.io:50051` (con TLS) y, en `GRPC_NODE_KEYS`, su `x-api-key`.

## Límites del nivel gratuito
- **RAM:** 1 GB. El contenedor está limitado a 700 MB y el script crea 2 GB de swap.
- **Tráfico de salida:** 1 GB al mes desde Norteamérica. Alcanza para pruebas de clase.
- **Disco:** debe ser *estándar*. Un disco balanceado o SSD sí cobra.
