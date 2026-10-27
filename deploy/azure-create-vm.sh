#!/usr/bin/env bash
# Crea la VM del backend en Azure (pensado para correr en Azure Cloud Shell, ya autenticado).
# Prueba varias regiones y tamaños porque "Azure for Students" restringe algunas combinaciones.
# Abre los puertos 80, 443 (HTTPS) y 50051 (gRPC) y deja la IP pública fija.
set -uo pipefail

VM=booking-backend
USUARIO=azureuser
REGIONES=(eastus2 eastus centralus southcentralus westus2 brazilsouth westus3)
TAMANOS=(Standard_B1s Standard_B2ats_v2 Standard_B1ms Standard_B2s)

az account show -o none 2>/dev/null || { echo "ERROR: no hay sesión de Azure. Ejecuta 'az login'."; exit 1; }
az provider register -n Microsoft.Compute --wait -o none 2>/dev/null || true
az provider register -n Microsoft.Network --wait -o none 2>/dev/null || true

for LOC in "${REGIONES[@]}"; do
  for SIZE in "${TAMANOS[@]}"; do
    RG="booking-rg-${LOC}"
    echo "==> Probando ${SIZE} en ${LOC} ..."
    az group create -n "$RG" -l "$LOC" -o none 2>/tmp/az_err || { tail -n 2 /tmp/az_err; break; }
    if az vm create -g "$RG" -n "$VM" -l "$LOC" --size "$SIZE" \
         --image Ubuntu2204 --admin-username "$USUARIO" --generate-ssh-keys \
         --public-ip-sku Standard --public-ip-address-allocation static \
         --os-disk-size-gb 30 --storage-sku StandardSSD_LRS -o none 2>/tmp/az_err; then
      echo "==> VM creada: ${SIZE} en ${LOC}"
      az vm open-port -g "$RG" -n "$VM" --port 80    --priority 1010 -o none
      az vm open-port -g "$RG" -n "$VM" --port 443   --priority 1020 -o none
      az vm open-port -g "$RG" -n "$VM" --port 50051 --priority 1030 -o none
      IP=$(az vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv)
      echo
      echo "=========================================================="
      echo " LISTO. IP pública: ${IP}"
      echo " Usuario SSH:       ${USUARIO}"
      echo " Grupo de recursos: ${RG}"
      echo " Tamaño / región:   ${SIZE} / ${LOC}"
      echo "=========================================================="
      exit 0
    fi
    echo "   No se pudo: $(grep -ioE '(RequestDisallowedByAzure|SkuNotAvailable|not available|quota|Quota)[^.]*' /tmp/az_err | head -n 1)"
    az group delete -n "$RG" -y --no-wait -o none 2>/dev/null || true
  done
done

echo "ERROR: ninguna región/tamaño funcionó. Último error:"
cat /tmp/az_err
exit 1
