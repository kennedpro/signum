# ⚡ SIGNUM · Arranque en 10 minutos (Windows)

Guía directa. Para la documentación completa vea `README.md`.

---

## ⚡ Si ya tiene el proyecto: ejecución directa

```powershell
cd "C:\Users\Kenned\Downloads\Proyecto\SU_CARPETA"
npm install        # solo la primera vez o si faltan dependencias
npm run dev
```

Abra **http://localhost:3000** e ingrese con `admin` / `admin`.

En la primera ejecución aparece:

```text
[SIGNUM] Base «neondb» lista · esquema actualizado
```

Eso confirma que tablas y columnas se crearon/actualizaron solas contra Neon.
**No use el SQL Editor.** Si `npm run dev` dice “Cannot find module”, ejecute
`npm install` y repita.

---

## Paso 1 · Instalar los dos programas necesarios

| Programa | Enlace | Cómo confirmar |
|---|---|---|
| **Node.js 22 LTS** | <https://nodejs.org> → botón **LTS** | Abra PowerShell y escriba `node -v` |
| **Docker Desktop** | <https://www.docker.com/products/docker-desktop> | `docker -v` |

> Después de instalar **cierre y vuelva a abrir PowerShell**, si no los comandos no aparecen.
>
> ¿No quiere instalar Docker? Vea el **Plan B** al final.

---

## Paso 2 · Abrir la terminal en la carpeta del proyecto

1. Abra el **Explorador de archivos** en la carpeta que descomprimió
   (la que contiene `package.json`, `src`, `scripts`…)
2. Haga clic en la **barra de direcciones**, escriba `powershell` y presione **Enter**

Se abre una terminal ya ubicada en la carpeta correcta.

---

## Paso 3 · Ejecutar la instalación automática

Copie y pegue esta línea:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
```

El script hace todo solo: crea el `.env`, instala las dependencias, levanta
PostgreSQL, crea las tablas y carga los datos de ejemplo.
Tarda entre 3 y 5 minutos la primera vez.

---

## Paso 4 · Arrancar

```powershell
npm run dev
```

Cuando vea `✓ Ready`, abra en su navegador:

### 👉 <http://localhost:3000>

Para detener el servidor: **Ctrl + C** en la terminal.

---

## 🔑 Credenciales

### Inicio de sesión (pantalla `/login`)

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `admin` | Administrador — todos los privilegios |
| `carlos.gomez@entidad` | `admin` | Jefe de Gestión Documental |
| `andres.rios@entidad` | `admin` | Usuario |
| `camila.duarte@entidad` | `admin` | Usuario |

### Claves de firma (distintas del acceso)

| Para qué | Clave |
|---|---|
| Firmar como emisor | `FIRMA2026` |
| Firmantes de ejemplo | `DEMO-FIRM` |

> La contraseña de **acceso** entra a la consola.
> La clave de **firma** autoriza el estampado (segundo factor).

---

## ☁️ Ruta con Neon (sin Docker)

### Paso A · Crear el archivo `.env`

⚠️ Windows **no deja crear archivos que empiezan por punto** desde el Explorador,
y el Bloc de notas guarda `env.txt`. Use el generador (funciona siempre porque
`node` ya está instalado):

```powershell
node scripts/crear-env.mjs
```

Le pedirá la cadena de conexión, generará un `SESSION_SECRET` aleatorio y
escribirá el archivo con la codificación correcta.

También puede pasarla directamente en una sola línea:

```powershell
node scripts/crear-env.mjs "postgresql://neondb_owner:SU_CLAVE@ep-xxxx.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

**Compruebe que existe:**

```powershell
dir .env
```

### Paso B · Arrancar (sin SQL Editor ni migraciones manuales)

```powershell
npm run dev
```

Al iniciar, SIGNUM hace automáticamente y sin borrar datos:

1. Conecta a Neon/PostgreSQL (conexión directa o `-pooler`, ambas sirven).
2. Crea las tablas que no existan.
3. Actualiza esquemas antiguos agregando columnas, índices y triggers
   **sentencia por sentencia**: lo que ya existe se omite, nunca aborta.
4. Garantiza las cuentas `admin` y `carlos.gomez@entidad`.
5. Inicia la aplicación.

En la terminal debe aparecer:

```text
[SIGNUM] Base «neondb» lista · esquema actualizado
```

> **Nunca necesita el SQL Editor de Neon.** Si la base tenía tablas de una
> versión anterior (creadas por `drizzle-kit` o a mano), se actualizan solas.
> Si algo real fallara, el mensaje indica la sentencia exacta y la causa.

También puede hacer doble clic en **`INICIAR-SIGNUM.cmd`**: instala las
dependencias si faltan, prepara la base, inicia Next.js y abre el navegador.

Para revisar el estado sin borrar nada:

```powershell
npx tsx scripts/check-db.ts
```

`reset-db.mjs` queda únicamente para cuando quiera borrar todos los datos de
prueba y comenzar desde cero.

El primer comando es un **diagnóstico**: confirma la conexión y le indica
exactamente qué falta si algo no cuadra.

Abra <http://localhost:3000> e ingrese con `admin` / `admin`.

---

### Crear el `.env` a mano (alternativa)

Copie y pegue este bloque completo en PowerShell, cambiando la clave:

```powershell
@"
DATABASE_URL=postgresql://neondb_owner:SU_CLAVE@ep-xxxx.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require
NEXT_PUBLIC_APP_URL=http://localhost:3000
SESSION_SECRET=cadena-larga-aleatoria-de-al-menos-48-caracteres
"@ | Out-File -FilePath .env -Encoding utf8NoBOM
```

> **Nunca** use el Bloc de notas para este archivo: agrega `.txt` al nombre y un
> carácter invisible (BOM) que invalida la primera variable.

---

## ✍️ ¿Dónde está el botón para firmar?

Firmar **no** se hace desde el editor: el editor solo redacta. El flujo es:

1. En el **editor**, pulse **GUARDAR** (barra de herramientas, botón cian)
2. Arriba a la derecha pulse **FIRMAR Y DESPACHAR**
   *(también puede ir al **Expediente** y usar el botón del panel derecho)*
3. Se abre la ventana de despacho:
   - Active *"Estampar mi firma ahora"*
   - Dibuje su rúbrica en el recuadro blanco
   - Escriba la clave **`FIRMA2026`**
   - Pulse **DESPACHAR**
4. Aparecen el **enlace** y la **clave** de cada firmante restante → cópielos

> ⚠️ Solo puede estampar su firma si usted **fue designado como firmante** en el
> asistente de creación. Si configuró que firme otra persona, al despachar solo
> se emitirán las credenciales de esa persona.

---

## 🧪 Prueba completa del flujo de firma

1. **Nuevo documento** → elija *Acta* → complete los 5 pasos del asistente
2. En el editor pulse **Guardar**
3. Botón **Firmar y despachar** → dibuje su rúbrica → clave `FIRMA2026`
4. Aparece el **enlace** y la **clave** del otro firmante → cópielos
5. Abra ese enlace en una **ventana de incógnito** (Ctrl+Shift+N)
6. Complete los datos, acepte, firme con la clave copiada
7. Vuelva al expediente: verá la estampa inyectada y el certificado sellado

---

## 🌐 Compartir con otra persona (dominio de prueba)

Con `npm run dev` corriendo, abra **una segunda terminal** en la misma carpeta:

```powershell
npx localtunnel --port 3000
```

Le entrega una dirección pública tipo `https://algo-random.loca.lt`.
Envíesela a un compañero: podrá abrir el enlace de firma desde su propio equipo.

> La primera vez localtunnel muestra una pantalla pidiendo confirmar. Es normal:
> pulse **Click to Continue**. Al cerrar la terminal la dirección deja de existir.

Alternativa con Cloudflare (más estable):

```powershell
npx cloudflared tunnel --url http://localhost:3000
```

---

## 🐳 Plan B · Sin Docker

Si prefiere no instalar Docker, instale **PostgreSQL 16** desde
<https://www.postgresql.org/download/windows/> (anote la clave que le pida) y luego:

**1.** Cree la base de datos:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE signum;"
```

**2.** Cree el archivo de configuración:

```powershell
Copy-Item .env.example .env
notepad .env
```

Cambie la primera línea por (reemplace `SU_CLAVE` por la de PostgreSQL):

```env
DATABASE_URL=postgresql://postgres:SU_CLAVE@127.0.0.1:5432/signum
```

Guarde y cierre.

**3.** Instale y prepare:

```powershell
npm install
npx drizzle-kit push --force
npx tsx src/db/seed.ts
npm run dev
```

---

## 🛠️ Si algo falla

| Mensaje | Qué hacer |
|---|---|
| `node no se reconoce…` | Cierre y reabra PowerShell. Si sigue, reinstale Node.js |
| `no se puede cargar el archivo … scripts/setup.ps1` | Use exactamente la línea con `-ExecutionPolicy Bypass` |
| `DATABASE_URL is required` | No existe el `.env` → `node scripts/crear-env.mjs` |
| Creé el `.env` pero sigue fallando | Se guardó como `env.txt`. Verifique con `dir .env` y use `node scripts/crear-env.mjs` |
| `Selecciona una aplicación para abrir powershell` | Ya está DENTRO de PowerShell. Use `node scripts/crear-env.mjs` en su lugar |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL apagado → `docker compose up -d db` (y abra Docker Desktop) |
| `relation "documents" does not exist` | Faltan las tablas → `npx drizzle-kit push --force` |
| Abre pero sin documentos | Falta la semilla → `npx tsx src/db/seed.ts` |
| `Port 3000 is in use` | `npm run dev -- -p 3001` y abra el puerto 3001 |
| `error connecting to Docker` | Abra **Docker Desktop** y espere a que diga *Engine running* |
| `eval() is not supported…` | Ya corregido. Borre la carpeta `.next` y ejecute `npm run dev` de nuevo |
| `no pg_hba.conf entry` / `SSL required` | Falta `?sslmode=require` al final de la `DATABASE_URL` de Neon |
| No veo cómo firmar | Guarde y pulse **FIRMAR Y DESPACHAR** (vea la sección de arriba) |
| `No se pudo iniciar sesión.` | Esquema desactualizado → `node scripts/reset-db.mjs` |
| `Usuario o contraseña incorrectos` con `admin`/`admin` | Falta la semilla → `npx tsx src/db/seed.ts` |
| `No hay usuarios registrados` | Ejecute `npx tsx src/db/seed.ts` |

**Reinicio total de la base de datos** (borra y recarga todo, sirve con Neon y con Docker):

```powershell
node scripts/reset-db.mjs
```

---

## 🏢 Poner los datos de su entidad

Entre a **Organización** en el menú lateral y ajuste razón social, NIT, ciudad,
logo (URL `https`) y el perfil **Pública** o **Privada**. Ahí mismo puede cambiar
la contraseña de firma.

Para reemplazar los usuarios de ejemplo por los reales, vea la sección
*Configurar su organización* del `README.md`.

## Actualizar una instalación existente

1. Descarga el proyecto completo con el botón **Download** del entorno de desarrollo
   (obtienes un ZIP `signum-…zip`).
2. Cierra la ventana negra de SIGNUM si está abierta.
3. Clic derecho sobre el ZIP → **Extraer todo…** → como destino elige **tu carpeta SIGNUM**
   (la que contiene `package.json` y `.env`) y acepta **reemplazar** los archivos.
   Tu `.env` no está en el ZIP, así que se conserva.
4. Doble clic en **`ACTUALIZAR-SIGNUM.cmd`** (ahora estará en tu carpeta SIGNUM).
   Detecta que el código ya está en su sitio, elimina archivos obsoletos, borra `.next`
   y ejecuta `npm install` para las dependencias nuevas.
5. Doble clic en **`INICIAR-SIGNUM.cmd`**. Si olvidas el paso 4, lo detecta y te lo ofrece.

También funciona si extraes el ZIP en una subcarpeta dentro de SIGNUM o en otro lugar:
el asistente copia el código a tu carpeta SIGNUM (te pedirá la ruta si no la detecta) y
guarda un respaldo en `_respaldo\FECHA_HORA\`.

Cuando quieras, sube a GitHub el contenido actualizado (`src`, `scripts`, `package.json`,
`tsconfig.json`, `next.config.ts`, `INICIAR-SIGNUM.cmd`, `ACTUALIZAR-SIGNUM.cmd`).
