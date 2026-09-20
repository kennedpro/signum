@echo off
setlocal
cd /d "%~dp0"
title SIGNUM - Preparar base de datos
color 0B

echo.
echo ======================================================
echo   SIGNUM - PREPARACION AUTOMATICA DE LA BASE
 echo ======================================================
echo.

if not exist ".env" (
  node scripts\crear-env.mjs
  if errorlevel 1 goto :error
)

if not exist "node_modules\tsx\package.json" (
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :error
)

call npx tsx scripts\bootstrap-db.ts
if errorlevel 1 goto :error

echo.
echo Todo listo. Ahora puede abrir INICIAR-SIGNUM.cmd
pause
exit /b 0

:error
color 0C
echo.
echo No se pudo completar la preparacion.
pause
exit /b 1
