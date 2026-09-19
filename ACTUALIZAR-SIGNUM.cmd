@echo off
setlocal EnableExtensions
title SIGNUM - Actualizar instalacion local
color 0B

echo.
echo ======================================================
echo   SIGNUM - ACTUALIZAR INSTALACION LOCAL
echo ======================================================
echo.
echo  Este asistente aplica el codigo nuevo, descargado con el
echo  boton "Download", sobre tu carpeta SIGNUM.
echo  NO toca tu archivo .env ni tus datos.
echo.
echo  Antes de continuar, CIERRA la ventana negra de SIGNUM
echo  (el servidor iniciado con INICIAR-SIGNUM.cmd).
echo.
pause

set "ORIGEN=%~dp0"
set "DESTINO="
set "MODO="

REM ---- CASO A: el ZIP se extrajo DIRECTAMENTE sobre la carpeta SIGNUM ----
REM      (aqui mismo hay .env y node_modules: el codigo nuevo ya esta en su sitio)
if exist "%ORIGEN%.env" (
  set "DESTINO=%ORIGEN%"
  set "MODO=ENSITIO"
)

REM ---- CASO B: el ZIP se extrajo en una SUBCARPETA dentro de SIGNUM ----
if not defined DESTINO (
  pushd "%ORIGEN%.."
  if exist "package.json" if exist ".env" set "DESTINO=%CD%\"
  popd
  if defined DESTINO set "MODO=COPIAR"
)

REM ---- CASO C: preguntar la ruta ----
if not defined DESTINO (
  echo.
  echo No se detecto la carpeta SIGNUM de forma automatica.
  echo Escribe o pega la ruta de tu carpeta SIGNUM, la que contiene package.json y .env,
  echo Ejemplo:  C:\Users\Kenned\Descargas\Proyecto\P SIGNUM
  echo y pulsa ENTER:
  set /p "DESTINO=> "
  set "MODO=COPIAR"
)
call :normaliza
if not exist "%DESTINO%package.json" (
  color 0C
  echo.
  echo [ERROR] En "%DESTINO%" no hay un proyecto SIGNUM: falta package.json.
  pause
  exit /b 1
)

echo.
echo Carpeta SIGNUM: %DESTINO%
if "%MODO%"=="ENSITIO" (
  echo Modo: el codigo nuevo ya esta en esta carpeta. Se limpiara y prepararan las dependencias.
) else (
  echo Origen del codigo nuevo: %ORIGEN%
)
echo.

REM ---- 1. Respaldo (solo cuando se va a copiar sobre otra carpeta) ----
if "%MODO%"=="COPIAR" (
  call :marca
  echo [1/4] Respaldo del codigo actual en: %DESTINO%_respaldo\%MARCA%
  mkdir "%DESTINO%_respaldo\%MARCA%" >nul 2>&1
  if exist "%DESTINO%src\" xcopy "%DESTINO%src" "%DESTINO%_respaldo\%MARCA%\src\" /E /I /Q /Y >nul
  if exist "%DESTINO%scripts\" xcopy "%DESTINO%scripts" "%DESTINO%_respaldo\%MARCA%\scripts\" /E /I /Q /Y >nul
  for %%F in (package.json tsconfig.json next.config.ts INICIAR-SIGNUM.cmd PREPARAR-SIGNUM.cmd) do (
    if exist "%DESTINO%%%F" copy /y "%DESTINO%%%F" "%DESTINO%_respaldo\%MARCA%\%%F" >nul
  )
  echo [2/4] Copiando el codigo nuevo...
  if exist "%DESTINO%src\" rd /s /q "%DESTINO%src"
  xcopy "%ORIGEN%src" "%DESTINO%src\" /E /I /Q /Y >nul
  if errorlevel 1 goto :copyerr
  if exist "%DESTINO%scripts\" rd /s /q "%DESTINO%scripts"
  xcopy "%ORIGEN%scripts" "%DESTINO%scripts\" /E /I /Q /Y >nul
  if errorlevel 1 goto :copyerr
  for %%F in (package.json tsconfig.json next.config.ts INICIAR-SIGNUM.cmd PREPARAR-SIGNUM.cmd drizzle.config.ts postcss.config.mjs eslint.config.mjs README.md EMPEZAR-AQUI.md Dockerfile docker-compose.yml ACTUALIZAR-SIGNUM.cmd) do (
    if exist "%ORIGEN%%%F" copy /y "%ORIGEN%%%F" "%DESTINO%%%F" >nul
  )
  echo       Tu archivo .env se conservo intacto.
) else (
  echo [1/4] Sin respaldo: los archivos ya fueron reemplazados al extraer el ZIP.
  echo [2/4] Eliminando archivos obsoletos que la extraccion no borra...
  if exist "%DESTINO%src\components\editor\font-size-mark.ts" del /f /q "%DESTINO%src\components\editor\font-size-mark.ts"
  if exist "%DESTINO%src\types\html2pdf.d.ts" del /f /q "%DESTINO%src\types\html2pdf.d.ts"
  if exist "%DESTINO%src\types\" rd "%DESTINO%src\types" >nul 2>&1
)

REM ---- 3. Limpiar compilacion anterior ----
echo [3/4] Limpiando la compilacion anterior, carpeta .next ...
if exist "%DESTINO%.next\" rd /s /q "%DESTINO%.next" >nul 2>&1
if exist "%DESTINO%.next\" (
  color 0E
  echo [AVISO] No se pudo borrar .next porque SIGNUM sigue abierto. Cierralo y borra la carpeta .next a mano.
  color 0B
)

REM ---- 4. Dependencias ----
echo [4/4] Instalando dependencias con npm install. Puede tardar unos minutos...
pushd "%DESTINO%"
call npm install --no-audit --no-fund
set "NPMERR=%ERRORLEVEL%"
popd
if not "%NPMERR%"=="0" (
  color 0C
  echo.
  echo [ERROR] npm install fallo. Revisa la conexion a internet y ejecuta de nuevo este archivo.
  pause
  exit /b 1
)

> "%ORIGEN%APLICADA.txt" echo Aplicada el %DATE% %TIME%
echo.
echo ======================================================
echo   SIGNUM ACTUALIZADO CORRECTAMENTE
echo ======================================================
echo   Ahora abre INICIAR-SIGNUM.cmd en: %DESTINO%
echo.
pause
exit /b 0

REM ================= subrutinas =================
:normaliza
REM quita comillas y asegura la barra final (seguro con espacios en la ruta)
set "DESTINO=%DESTINO:"=%"
if not defined DESTINO goto :eof
if not "%DESTINO:~-1%"=="\" set "DESTINO=%DESTINO%\"
goto :eof

:marca
set "MARCA=%DATE%_%TIME%"
set "MARCA=%MARCA:/=-%"
set "MARCA=%MARCA::=%"
set "MARCA=%MARCA:.=%"
set "MARCA=%MARCA:,=%"
set "MARCA=%MARCA: =%"
goto :eof

:copyerr
color 0C
echo.
echo [ERROR] No se pudieron copiar los archivos. Cierra SIGNUM y reintenta.
pause
exit /b 1
