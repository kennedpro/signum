#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# SIGNUM · Instalación local automática (Linux / macOS)
#   bash scripts/setup.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

cyan() { printf "\033[36m%s\033[0m\n" "$1"; }
green() { printf "\033[32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
red() { printf "\033[31m%s\033[0m\n" "$1"; }

cd "$(dirname "$0")/.."

cyan "╔══════════════════════════════════════════════╗"
cyan "║  SIGNUM · Instalación del entorno local      ║"
cyan "╚══════════════════════════════════════════════╝"
echo

# ── 1. Node.js ───────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  red "✗ Node.js no está instalado. Descárguelo en https://nodejs.org"
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  red "✗ Se requiere Node.js 20 o superior (detectado: $(node -v))"
  exit 1
fi
green "✓ Node.js $(node -v)"

# ── 2. Variables de entorno ──────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  green "✓ Archivo .env creado a partir de .env.example"
else
  yellow "• .env ya existe, se conserva"
fi

# ── 3. Dependencias ──────────────────────────────────────────
cyan "→ Instalando dependencias (puede tardar 2-3 minutos)…"
npm install --no-audit --no-fund
green "✓ Dependencias instaladas"

# ── 4. Base de datos ─────────────────────────────────────────
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  cyan "→ Levantando PostgreSQL con Docker…"
  docker compose up -d db >/dev/null
  printf "  esperando a que la base acepte conexiones"
  for _ in $(seq 1 30); do
    if docker compose exec -T db pg_isready -U signum -d signum >/dev/null 2>&1; then
      echo
      green "✓ PostgreSQL listo en 127.0.0.1:5432"
      break
    fi
    printf "."
    sleep 1
  done
else
  yellow "• Docker no detectado: se usará la base indicada en DATABASE_URL"
fi

# ── 5. Esquema y datos ───────────────────────────────────────
cyan "→ Creando las tablas…"
if ! npx drizzle-kit push --force >/dev/null 2>&1; then
  red "✗ No se pudo conectar a la base de datos."
  echo "  Revise que PostgreSQL esté activo y que DATABASE_URL en .env sea correcta."
  exit 1
fi
green "✓ Tablas creadas"

cyan "→ Cargando datos de demostración…"
npx tsx src/db/seed.ts >/dev/null
green "✓ Datos cargados"

echo
green "╔══════════════════════════════════════════════╗"
green "║  Todo listo                                  ║"
green "╚══════════════════════════════════════════════╝"
echo
echo "  Arranque el servidor con:   npm run dev"
echo "  Abra:                       http://localhost:3000"
echo
echo "  Clave de firma del emisor:  FIRMA2026"
echo "  Clave de firmantes semilla: DEMO-FIRM"
echo
