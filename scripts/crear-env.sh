#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# SIGNUM · Creación asistida del archivo .env  (Linux / macOS)
#   bash scripts/crear-env.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

cyan()  { printf "\033[36m%s\033[0m\n" "$1"; }
green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

cyan "╔══════════════════════════════════════════════╗"
cyan "║  SIGNUM · Crear archivo .env                 ║"
cyan "╚══════════════════════════════════════════════╝"
echo

if [ -f .env ]; then
  read -r -p "Ya existe .env. ¿Reemplazarlo? (s/N) " r
  [[ "$r" =~ ^[sS]$ ]] || { echo "Cancelado."; exit 0; }
  cp .env .env.backup
  echo "Copia guardada como .env.backup"
  echo
fi

echo "Pegue la cadena de conexión:"
echo "  Neon:  postgresql://usuario:clave@ep-xxxx.neon.tech/neondb?sslmode=require"
echo "  Local: postgresql://postgres:clave@127.0.0.1:5432/signum"
echo
read -r -p "DATABASE_URL: " DB_URL
DB_URL="$(echo "$DB_URL" | tr -d '"'"'" | xargs)"

if [[ ! "$DB_URL" =~ ^postgres(ql)?:// ]]; then
  red "✗ La cadena debe comenzar con postgresql://"
  exit 1
fi

read -r -p "NEXT_PUBLIC_APP_URL [http://localhost:3000]: " APP_URL
APP_URL="${APP_URL:-http://localhost:3000}"

SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")"

cat > .env <<EOF
# SIGNUM - Variables de entorno
# Generado por scripts/crear-env.sh

DATABASE_URL=$DB_URL
NEXT_PUBLIC_APP_URL=$APP_URL
SESSION_SECRET=$SECRET
NODE_ENV=development
EOF

green "✓ Archivo .env creado"
echo
cyan "  Siguiente paso — verifique la conexión:"
echo "     npx tsx scripts/check-db.ts"
echo
