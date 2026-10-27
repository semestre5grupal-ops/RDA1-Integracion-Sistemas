#!/usr/bin/env bash
# Prepara una VM Debian/Ubuntu nueva (e2-micro) para el backend de Booking.
# Uso, dentro de la VM:  bash setup-vm.sh
set -euo pipefail

echo "==> Instalando Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"

echo "==> Creando 2 GB de swap (la e2-micro solo tiene 1 GB de RAM)"
if ! sudo swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "==> Carpeta de despliegue ~/booking"
mkdir -p ~/booking/logs
cd ~/booking
for f in docker-compose.yml Caddyfile; do
  if [ ! -f "$f" ]; then
    curl -fsSL "https://raw.githubusercontent.com/semestre5grupal-ops/rda1-integracion-sistemas/main/deploy/$f" -o "$f" || true
  fi
done
if [ ! -f .env ]; then
  IP=$(curl -fsSL -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip || echo "0.0.0.0")
  DASH=${IP//./-}
  cat > .env <<EOF
# Dominios (sslip.io resuelve a la IP de la VM, sin comprar dominio)
API_DOMAIN=api.${DASH}.sslip.io
GRPC_DOMAIN=grpc.${DASH}.sslip.io

# Pega aquí TODAS las variables de entorno que hoy tienes en Render
# (DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY, ADMIN_EMAILS, SMTP_*, GROQ_*, WEBHOOK_SECRET_*...)
NODE_ENV=production

# Claves gRPC por nodo (ver respuestas a las aerolíneas)
GRPC_NODE_KEYS={}
EOF
  echo "==> Se creó ~/booking/.env: complétalo con las variables de Render."
fi

echo
echo "Listo. Cierra sesión SSH y vuelve a entrar para usar docker sin sudo."
echo "API:  https://api.${DASH:-<ip>}.sslip.io/api"
echo "gRPC: grpc.${DASH:-<ip>}.sslip.io:50051 (TLS)"
