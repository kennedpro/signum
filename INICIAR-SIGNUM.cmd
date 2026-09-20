@echo off
setlocal
cd /d "%~dp0"
title SIGNUM - Inicio automatico
color 0B

echo.
echo ======================================================
echo   SIGNUM - INICIO AUTOMATICO
echo ======================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  color 0C
  echo ERROR: Node.js no esta instalado.
  echo Descargue Node.js LTS desde https://nodejs.org
  echo.
  pause
  exit /b 1
)

REM -- Actualizacion descomprimida pero sin aplicar (ZIP extraido en esta carpeta) --
set "PENDIENTE="
if exist "actualizacion\" if not exist "actualizacion\APLICADA.txt" set "PENDIENTE=%~dp0APLICAR-ACTUALIZACION.cmd"
if exist "signum-actualizacion\actualizacion\" if not exist "signum-actualizacion\actualizacion\APLICADA.txt" set "PENDIENTE=%~dp0signum-actualizacion\APLICAR-ACTUALIZACION.cmd"
REM Descarga completa (boton Download) descomprimida dentro de esta carpeta
for /d %%D in ("signum*") do (
  if exist "%%~fD\ACTUALIZAR-SIGNUM.cmd" if not exist "%%~fD\APLICADA.txt" set "PENDIENTE=%%~fD\ACTUALIZAR-SIGNUM.cmd"
)
REM Descarga completa extraida DIRECTAMENTE sobre esta carpeta: faltan dependencias nuevas
if exist "ACTUALIZAR-SIGNUM.cmd" if not exist "APLICADA.txt" if exist "node_modules\" (
  if not exist "node_modules\pdfmake\package.json" set "PENDIENTE=%~dp0ACTUALIZAR-SIGNUM.cmd"
)
if defined PENDIENTE if exist "%PENDIENTE%" (
  color 0E
  echo Se detecto una ACTUALIZACION descargada que aun no se ha aplicado.
  echo Debe aplicarse antes de iniciar para que los cambios se vean.
  echo.
  choice /c SN /n /m "Aplicar la actualizacion ahora? [S/N]: "
  if errorlevel 2 (
    color 0B
    echo Continuando sin aplicar la actualizacion...
    echo.
  ) else (
    call "%PENDIENTE%"
    color 0B
    echo.
  )
)

if not exist ".env" (
  echo No existe el archivo .env.
  echo Se abrira el asistente para crearlo.
  echo.
  node scripts\crear-env.mjs
  if errorlevel 1 (
    color 0C
    echo No se pudo crear .env.
    pause
    exit /b 1
  )
)

if not exist "node_modules\next\package.json" (
  echo Instalando dependencias. Esto puede tardar unos minutos...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    color 0C
    echo ERROR: no se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

echo [1/2] Verificando y actualizando la base de datos...
call npx tsx scripts\bootstrap-db.ts
if errorlevel 1 (
  color 0C
  echo.
  echo La aplicacion no puede iniciar hasta corregir la conexion.
  echo Para reemplazarla, elimine .env y ejecute este archivo de nuevo.
  echo.
  pause
  exit /b 1
)

echo.
echo [2/2] Iniciando SIGNUM...
echo.
echo Abra en el navegador: http://localhost:3000
set "SIGNUM_URL=http://localhost:3000"
start "" cmd /c "timeout /t 7 /nobreak >nul && start %SIGNUM_URL%"
echo Para detener el servidor, presione Ctrl+C.
echo.

call npm run dev

endlocal
pause
