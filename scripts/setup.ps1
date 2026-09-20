# ─────────────────────────────────────────────────────────────
# SIGNUM · Instalación local automática (Windows PowerShell)
#
#   powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
# ─────────────────────────────────────────────────────────────

Set-Location (Join-Path $PSScriptRoot "..")

function Cyan($m)   { Write-Host $m -ForegroundColor Cyan }
function Green($m)  { Write-Host $m -ForegroundColor Green }
function Yellow($m) { Write-Host $m -ForegroundColor Yellow }
function Red($m)    { Write-Host $m -ForegroundColor Red }

Cyan "==============================================="
Cyan "  SIGNUM - Instalacion del entorno local"
Cyan "==============================================="
Write-Host ""

# ── 1. Node.js ───────────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Red "X Node.js no esta instalado."
    Write-Host "  Descarguelo (version LTS) en https://nodejs.org"
    Write-Host "  Luego CIERRE y vuelva a abrir PowerShell."
    exit 1
}
$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) {
    Red "X Se requiere Node.js 20 o superior (detectado: $(node -v))"
    exit 1
}
Green "OK  Node.js $(node -v)"

# ── 2. Archivo .env ──────────────────────────────────────────
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Green "OK  Archivo .env creado"
} else {
    Yellow "--  .env ya existe, se conserva"
}

# ── 3. Dependencias ──────────────────────────────────────────
Cyan "->  Instalando dependencias (puede tardar 2-3 minutos)..."
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
    Red "X Fallo la instalacion de dependencias."
    Write-Host "  Intente manualmente:  npm install"
    exit 1
}
Green "OK  Dependencias instaladas"

# ── 4. Base de datos ─────────────────────────────────────────
$dockerOk = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Cyan "->  Levantando PostgreSQL con Docker..."
        docker compose up -d db | Out-Null
        Write-Host "    esperando a que la base acepte conexiones" -NoNewline
        for ($i = 0; $i -lt 40; $i++) {
            docker compose exec -T db pg_isready -U signum -d signum 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host ""
                Green "OK  PostgreSQL listo en 127.0.0.1:5432"
                $dockerOk = $true
                break
            }
            Write-Host "." -NoNewline
            Start-Sleep -Seconds 1
        }
        if (-not $dockerOk) {
            Write-Host ""
            Yellow "--  La base no respondio a tiempo. Revise Docker Desktop."
        }
    } else {
        Yellow "--  Docker esta instalado pero no se esta ejecutando."
        Write-Host "    Abra Docker Desktop, espere a que diga 'Engine running' y repita."
    }
} else {
    Yellow "--  Docker no detectado."
    Write-Host "    Se usara la base de datos indicada en el archivo .env"
}

# ── 5. Esquema ───────────────────────────────────────────────
Cyan "->  Creando las tablas..."
npx drizzle-kit push --force
if ($LASTEXITCODE -ne 0) {
    Red "X No se pudo conectar a la base de datos."
    Write-Host ""
    Write-Host "  Revise que:"
    Write-Host "   1) Docker Desktop este abierto  ->  docker compose up -d db"
    Write-Host "   2) DATABASE_URL en .env sea correcta"
    Write-Host ""
    exit 1
}
Green "OK  Tablas creadas"

# ── 6. Datos de demostracion ─────────────────────────────────
Cyan "->  Cargando datos de demostracion..."
npx tsx src/db/seed.ts | Out-Null
if ($LASTEXITCODE -ne 0) {
    Yellow "--  No se pudieron cargar los datos. Ejecute:  npx tsx src/db/seed.ts"
} else {
    Green "OK  Datos cargados"
}

Write-Host ""
Green "==============================================="
Green "  TODO LISTO"
Green "==============================================="
Write-Host ""
Write-Host "  Arranque el servidor:"
Write-Host "     npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "  Luego abra en el navegador:"
Write-Host "     http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "  Clave de firma del emisor:   FIRMA2026" -ForegroundColor Yellow
Write-Host "  Clave de firmantes de prueba: DEMO-FIRM" -ForegroundColor Yellow
Write-Host ""
