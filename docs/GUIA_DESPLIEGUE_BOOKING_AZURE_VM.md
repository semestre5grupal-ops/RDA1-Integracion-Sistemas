# Guía Oficial de Despliegue: Booking Prototipo en Azure Virtual Machine (IaaS)

> **Documento Técnico para:** Paúl Rosero (Booking Prototipo - Orquestador Central)  
> **Fecha:** 28 de Octubre de 2026  
> **Suscripción:** Azure for Students ($100 USD de crédito gratuito / 750 horas B1s)  
> **Puertos Expuestos:** `22` (SSH), `80` (HTTP), `443` (HTTPS/SSL), `3000` (API REST/Swagger/Webhooks), `50051` (gRPC Nativo TCP Inbound).

---

## 1. ¿Por qué una Máquina Virtual (VM) en lugar de App Service para Booking?

| Característica | Azure App Service (PaaS) | Azure Virtual Machine (IaaS) ✅ |
| :--- | :--- | :--- |
| **Rol de Booking** | Inadecuado para servidor gRPC Inbound | **Ideal para Orquestador Central** |
| **Puertos TCP personalizados** | ❌ Solo expone 80 y 443. Bloquea el puerto 50051. | ✅ Permite abrir **cualquier puerto TCP** (50051, 3000, etc.) en el NSG. |
| **Servidor gRPC Inbound** | ⚠️ Requiere configuraciones experimentales HTTP/2 proxy que interfieren con REST. | ✅ Servidor nativo gRPC HTTP/2 claro/TLS escuchando directo en `0.0.0.0:50051`. |
| **Compatibilidad con Tiendas** | Tiendas tendrían problemas para enviar gRPC puro. | ✅ Compatible al 100% con clientes gRPC nativos y con HTTP REST. |
| **Costo en Azure for Students** | Plan B1 descuenta crédito. | ✅ **Standard_B1s** tiene 750 horas gratis/mes en Azure for Students. |

---

## 2. Requisitos Previos en tu Computadora (Windows)

1. **Azure CLI instalada:**
   Verifica en PowerShell:
   ```powershell
   az --version
   ```
   *(Si no la tienes: `winget install Microsoft.AzureCLI`, luego cierra y abre una nueva PowerShell).*

2. **Iniciar sesión en Azure for Students:**
   ```powershell
   az login
   ```
   Selecciona el número correspondiente a **Azure for Students**.

3. **Verificar la suscripción activa:**
   ```powershell
   az account show --query "{Name:name, Id:id, State:state}" -o table
   ```

---

## 3. Despliegue Automatizado con Azure CLI

Ejecuta estos comandos en tu PowerShell local paso a paso:

### Paso 3.1: Definir variables y crear el Grupo de Recursos
```powershell
$RG = "rg-booking-puce"
$LOCATION = "eastus"        # Región recomendada (cercana a Supabase US-West/East)
$VM_NAME = "vm-booking-core"
$DNS_LABEL = "booking-puce" # Resultará en: booking-puce.eastus.cloudapp.azure.com
$ADMIN_USER = "azureuser"

# Crear el Resource Group
az group create --name $RG --location $LOCATION
```

### Paso 3.2: Crear la Dirección IP Pública Estática con DNS
```powershell
az network public-ip create `
  --resource-group $RG `
  --name pip-booking `
  --allocation-method Static `
  --sku Standard `
  --dns-name $DNS_LABEL
```
> 📌 Tu DNS público mundial será: `booking-puce.eastus.cloudapp.azure.com`

### Paso 3.3: Crear el Network Security Group (NSG) y abrir puertos
```powershell
# Crear el NSG
az network nsg create --resource-group $RG --name nsg-booking

# 1. SSH (Administración remota)
az network nsg rule create --resource-group $RG --nsg-name nsg-booking --name Allow-SSH `
  --priority 1000 --direction Inbound --access Allow --protocol Tcp `
  --source-address-prefixes '*' --source-port-ranges '*' `
  --destination-address-prefixes '*' --destination-port-ranges 22

# 2. HTTP (Web / Let's Encrypt)
az network nsg rule create --resource-group $RG --nsg-name nsg-booking --name Allow-HTTP `
  --priority 1010 --direction Inbound --access Allow --protocol Tcp `
  --source-address-prefixes '*' --source-port-ranges '*' `
  --destination-address-prefixes '*' --destination-port-ranges 80

# 3. HTTPS (SSL Web / API segura)
az network nsg rule create --resource-group $RG --nsg-name nsg-booking --name Allow-HTTPS `
  --priority 1020 --direction Inbound --access Allow --protocol Tcp `
  --source-address-prefixes '*' --source-port-ranges '*' `
  --destination-address-prefixes '*' --destination-port-ranges 443

# 4. REST API Directo (NestJS)
az network nsg rule create --resource-group $RG --nsg-name nsg-booking --name Allow-REST-3000 `
  --priority 1030 --direction Inbound --access Allow --protocol Tcp `
  --source-address-prefixes '*' --source-port-ranges '*' `
  --destination-address-prefixes '*' --destination-port-ranges 3000

# 5. gRPC Inbound (Inventario y Stock de Tiendas)
az network nsg rule create --resource-group $RG --nsg-name nsg-booking --name Allow-gRPC-50051 `
  --priority 1040 --direction Inbound --access Allow --protocol Tcp `
  --source-address-prefixes '*' --source-port-ranges '*' `
  --destination-address-prefixes '*' --destination-port-ranges 50051
```

### Paso 3.4: Crear la Tarjeta de Red (NIC) vinculando IP y NSG
```powershell
# Crear VNet y Subred
az network vnet create --resource-group $RG --name vnet-booking `
  --address-prefixes 10.0.0.0/16 --subnet-name subnet-booking --subnet-prefixes 10.0.1.0/24

# Crear NIC
az network nic create --resource-group $RG --name nic-booking `
  --vnet-name vnet-booking --subnet subnet-booking `
  --network-security-group nsg-booking `
  --public-ip-address pip-booking
```

### Paso 3.5: Crear la Máquina Virtual (Ubuntu 22.04 LTS - B1s)
```powershell
az vm create `
  --resource-group $RG `
  --name $VM_NAME `
  --nics nic-booking `
  --image Ubuntu2204 `
  --size Standard_B1s `
  --admin-username $ADMIN_USER `
  --generate-ssh-keys
```
> 💡 *Nota:* Si requieres mayor memoria para compilar cómodamente en la VM sin swap, puedes usar `--size Standard_B2s` (2 vCPU, 4GB RAM) que rinde perfectamente dentro de los $100 USD de crédito estudiantil.

---

## 4. Configuración Interna de la Máquina Virtual

### Paso 4.1: Conectarte a la VM por SSH
Desde tu terminal de PowerShell:
```powershell
ssh azureuser@booking-puce.eastus.cloudapp.azure.com
```

### Paso 4.2: Script de Aprovisionamiento Rápido (Node 22, Git, PM2, Caddy)
Una vez dentro de la VM en Ubuntu, copia y pega este bloque:
```bash
sudo apt update && sudo apt upgrade -y

# 1. Configurar 2GB de Memoria Swap (esencial para estabilidad en VMs B1s de 1GB)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 2. Instalar herramientas base
sudo apt install -y git curl wget build-essential debian-keyring debian-archive-keyring apt-transport-https

# 3. Instalar Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 4. Instalar PM2 globalmente
sudo npm install -g pm2

# 5. Instalar Caddy (Servidor Web con HTTPS y Let's Encrypt automático)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

---

## 5. Aprovisionar CloudAMQP (RabbitMQ Gestionado en la Nube - Little Lemur Free)

El orquestador Booking y los microservicios utilizan RabbitMQ para el bus de eventos asíncronos (`booking.events`, colas transaccionales y Dead Letter Queue). En lugar de sobrecargar la VM de Azure instalando Erlang/RabbitMQ, se utiliza la nube de **CloudAMQP** (Plan gratuito **Little Lemur**):

1. **Crear cuenta:** Ingresa a [https://customer.cloudamqp.com/signup](https://customer.cloudamqp.com/signup) y regístrate con tu correo o cuenta de GitHub.
2. **Crear nueva instancia:** Haz clic en **Create New Instance**.
   - **Name:** `booking-rabbitmq-puce`
   - **Plan:** `Little Lemur (Free)` ($0/month, 1M msgs/mes, 100 queues, 20 conexiones).
   - **Data center:** Selecciona el proveedor `Amazon Web Services (AWS)` y región `US East (N. Virginia)` (cercano a Azure `eastus` y Supabase).
3. **Copiar URL de Conexión:**
   - Una vez creada, entra a la instancia en el dashboard de CloudAMQP.
   - En la sección **Details**, copia el valor de **AMQP URL** (tiene el formato: `amqps://usuario:password@lemur.cloudamqp.com/vhost`).
   - Esta URL la pegarás en la variable `RABBITMQ_URL` de tu `.env`.

---

## 6. Instalación y Puesta en Marcha del Proyecto en la VM

### Paso 6.1: Clonar el Repositorio
```bash
cd ~
git clone https://github.com/semestre5grupal-ops/RDA1-Integracion-Sistemas.git booking
cd booking
```

### Paso 6.2: Crear el Archivo de Entorno `.env`
Crea el archivo `.env` en la raíz de la carpeta `booking`:
```bash
nano .env
```
Pega la configuración de producción (incluyendo la conexión a Supabase y llaves de los nodos):
```ini
# Servidor y Entorno
PORT=3000
NODE_ENV=production
TELEMETRY_SINK=none
GRPC_AUTH_MODE=NONE

# Bus de Eventos CloudAMQP (RabbitMQ Gestionado - Little Lemur)
EVENT_BUS_MODE=rabbitmq
RABBITMQ_URL=amqps://<usuario>:<password>@<servidor>.cloudamqp.com/<vhost>

# Base de Datos PostgreSQL Supabase (con pooler activo)
DATABASE_URL=postgresql://postgres.owseuntgcgvflqpnmwcc:7r2K3XoP4qRtY!s8@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true
SUPABASE_URL=https://owseuntgcgvflqpnmwcc.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# URLs de Microservicios Socios
TIENDA_AUTOS_URL=https://rutalibre-autos-api.azurewebsites.net/api/v3
TIENDA_AUTOS_API_KEY=LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA

TIENDA_AUTOS_MATEO_URL=https://maneja-de-una-v3-api.onrender.com/api/v3
TIENDA_AUTOS_MATEO_API_KEY=Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=

TIENDA_ATRACCIONES_URL=http://100.67.28.33:3000/api/v3

# Llaves gRPC para nodos socios (en formato JSON)
GRPC_NODE_KEYS={"NODE_AUT_DANIEL":"LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA","NODE_AUT_MATEO":"Irsuf7pF+8E89Lrmo6w2no/uTODQDhm2k5EFXTF0jq0=","NODE_ATR_ALISSON":"API_KEY_ALISSON"}
```
*(Guarda con `Ctrl + O`, Enter, y sal con `Ctrl + X`).*

### Paso 6.3: Instalar Dependencias y Compilar
```bash
npm ci
npm run build
```

### Paso 6.4: Iniciar con PM2 (Daemon y Arranque Automático)
```bash
# Iniciar la aplicación NestJS
pm2 start dist/main.js --name booking-core

# Guardar configuración para que inicie sola si la VM se reinicia
pm2 startup
# (Ejecuta el comando `sudo env PATH=...` que te indique la terminal)
pm2 save
```

---

## 7. Configuración de Dominio y Certificado SSL con Caddy

Caddy redirige automáticamente el tráfico HTTP y HTTPS hacia el puerto `3000` de NestJS con certificado Let's Encrypt gratuito e instantáneo:

Edita `/etc/caddy/Caddyfile`:
```bash
sudo nano /etc/caddy/Caddyfile
```
Reemplaza todo su contenido por:
```caddy
booking-puce.eastus.cloudapp.azure.com {
    reverse_proxy localhost:3000
}
```
Recarga Caddy:
```bash
sudo systemctl reload caddy
```

---

## 8. Verificación del Despliegue

### 1. Probar Conexión con CloudAMQP (RabbitMQ):
Revisa los logs de arranque de PM2:
```bash
pm2 logs booking-core --lines 40
```
Deberás ver la línea verde de confirmación:
`✅ [RabbitMQ] Conectado exitosamente y topologías declaradas (Topic Exchange: booking.events + DLQ).`
*Y en el dashboard web de CloudAMQP verás la conexión activa y las colas creadas automáticamente.*

### 2. Probar API REST con HTTPS en el navegador o terminal:
```bash
curl -I https://booking-puce.eastus.cloudapp.azure.com/api/v3/health
```
Respuesta esperada: `HTTP/2 200` con estado del orquestador.

### 3. Probar Swagger UI:
Abre en tu navegador:
`https://booking-puce.eastus.cloudapp.azure.com/api/docs`

### 4. Probar el Endpoint de Respaldo HTTP REST de Stock:
```bash
curl -X POST https://booking-puce.eastus.cloudapp.azure.com/api/v3/inventory/stock \
  -H "Content-Type: application/json" \
  -H "X-API-Key: LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA" \
  -d '{
    "item_id": "auto-daniel-001",
    "available_units": 5,
    "date": "2026-10-28",
    "time_slot": "DEFAULT"
  }'
```
Respuesta esperada:
```json
{
  "success": true,
  "acknowledged": true,
  "message": "Stock sincronizado exitosamente en Booking Prototipo para auto-daniel-001: 5 unidades disponibles.",
  "service_id": "NODE_AUT_DANIEL",
  "available_units": 5,
  "source": "HTTP_REST"
}
```

### 5. Probar Puerto gRPC Nativo (Puerto 50051):
Desde cualquier máquina con `grpcurl` o desde los clientes de tus compañeros:
```bash
nc -zv booking-puce.eastus.cloudapp.azure.com 50051
```
Respuesta: `Connection to booking-puce.eastus.cloudapp.azure.com 50051 port [tcp/*] succeeded!`

---

## 9. Resumen de Direcciones para tus Compañeros

| Canal | Dirección Oficial de Booking en Azure | Protocolo / Auth |
| :--- | :--- | :--- |
| **REST API Base** | `https://booking-puce.eastus.cloudapp.azure.com/api/v3` | HTTPS / JSON |
| **Health Check** | `https://booking-puce.eastus.cloudapp.azure.com/api/v3/health` | GET público |
| **Push Stock REST (Respaldo)** | `https://booking-puce.eastus.cloudapp.azure.com/api/v3/inventory/stock` | POST / Header `X-API-Key` |
| **gRPC Server Nativo** | `booking-puce.eastus.cloudapp.azure.com:50051` | gRPC TCP (Insecure/Cleartext o con TLS según cliente) |
| **Swagger Documentación** | `https://booking-puce.eastus.cloudapp.azure.com/api/docs` | Web Browser |
