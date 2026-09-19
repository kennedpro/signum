# ─────────────────────────────────────────────────────────────
# SIGNUM · Creación asistida del archivo .env  (Windows)
#
#   powershell -ExecutionPolicy Bypass -File scripts/crear-env.ps1
#
# Resuelve los dos problemas típicos de Windows:
#   1) El Bloc de notas guarda "env.txt" en vez de ".env"
#   2) Guarda en UTF-8 con BOM y corrompe la primera variable
# ─────────────────────────────────────────────────────────────

Set-Location (Join-Path $PSScriptRoot "..")

function Cyan($m)   { Write-Host $m -ForegroundColor Cyan }
function Green($m)  { Write-Host $m -ForegroundColor Green }
function Yellow($m) { Write-Host $m -ForegroundColor Yellow }
function Red($m)    { Write-Host $m -ForegroundColor Red }

Cyan "==============================================="
Cyan "  SIGNUM - Crear archivo .env"
Cyan "==============================================="
Write-Host ""

# ── ¿Ya existe? ──────────────────────────────────────────────
if (Test-Path ".env") {
    Yellow "Ya existe un archivo .env en esta carpeta."
    $r = Read-Host "¿Desea reemplazarlo? (s/N)"
    if ($r -ne "s" -and $r -ne "S") {
        Write-Host "Operacion cancelada. Se conserva el .env actual."
        exit 0
    }
    Copy-Item ".env" ".env.backup" -Force
    Yellow "Copia de seguridad guardada como .env.backup"
    Write-Host ""
}

# ── Cadena de conexión ───────────────────────────────────────
Write-Host "Pegue la cadena de conexion de su base de datos."
Write-Host "  Neon:  postgresql://usuario:clave@ep-xxxx.neon.tech/neondb?sslmode=require" -ForegroundColor DarkGray
Write-Host "  Local: postgresql://postgres:clave@127.0.0.1:5432/signum" -ForegroundColor DarkGray
Write-Host ""
$dbUrl = Read-Host "DATABASE_URL"

# Limpieza: comillas, espacios y saltos accidentales
$dbUrl = $dbUrl.Trim().Trim('"').Trim("'").Trim()

if ([string]::IsNullOrWhiteSpace($dbUrl)) {
    Red "X No ingreso ninguna cadena. Abortado."
    exit 1
}
if ($dbUrl -notmatch '^postgres(ql)?://') {
    Red "X La cadena debe comenzar con postgresql:// o postgres://"
    Write-Host "  Recibido: $dbUrl"
    exit 1
}

# ── Secreto de sesión aleatorio ──────────────────────────────
$bytes = New-Object 'System.Byte[]' 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = [Convert]::ToBase64String($bytes).Replace('+','-').Replace('/','_').Replace('=','')

# ── Puerto / URL pública ─────────────────────────────────────
$appUrl = Read-Host "NEXT_PUBLIC_APP_URL (Enter para http://localhost:3000)"
if ([string]::IsNullOrWhiteSpace($appUrl)) { $appUrl = "http://localhost:3000" }

# ── Escritura SIN BOM ────────────────────────────────────────
$content = @"
# SIGNUM - Variables de entorno
# Generado por scripts/crear-env.ps1

DATABASE_URL=$dbUrl
NEXT_PUBLIC_APP_URL=$appUrl
SESSION_SECRET=$secret
NODE_ENV=development
"@

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$fullPath = Join-Path (Get-Location) ".env"
[System.IO.File]::WriteAllText($fullPath, $content, $utf8NoBom)

Write-Host ""
if (Test-Path ".env") {
    Green "OK  Archivo .env creado correctamente"
    Write-Host "    Ubicacion: $fullPath"
    Write-Host ""
    Write-Host "    Contenido (clave oculta):" -ForegroundColor DarkGray
    Get-Content ".env" | ForEach-Object {
        $line = $_ -replace '(://[^:]+:)([^@]+)(@)', '$1******$3'
        $line = $line -replace '(SESSION_SECRET=).*', '$1******'
        Write-Host "      $line" -ForegroundColor DarkGray
    }
    Write-Host ""
    Cyan "  Siguiente paso - verifique la conexion:"
    Write-Host "     npx tsx scripts/check-db.ts" -ForegroundColor White
    Write-Host ""
} else {
    Red "X No se pudo crear el archivo. Revise los permisos de la carpeta."
    exit 1
}
