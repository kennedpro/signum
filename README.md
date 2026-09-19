# SIGNUM · Consola de gestión documental y firma digital

Plataforma para producir documentos institucionales con **configuración previa de
partes**, **cabecera corporativa**, **normas APA 7**, **firma digital con estampa
en contenedor protegido**, **doble sellado SHA-256** y **auditoría encadenada**.

Cumple los tres pilares del **Decreto 2364 de 2012** (Colombia): autenticidad
(segundo factor), integridad (doble huella) y no repudio (bitácora encadenada).

---

## 📋 Requisitos

| Software | Versión mínima | Verificar |
|---|---|---|
| **Node.js** | 20 (recomendado 22 LTS) | `node -v` |
| **npm** | 10 | `npm -v` |
| **PostgreSQL** | 14 (recomendado 16) | `psql --version` |
| **Docker** *(opcional)* | 24 | `docker -v` |

> Descargue Node.js en <https://nodejs.org> y Docker Desktop en <https://docker.com>.

---

## 🚀 Instalación local en 5 pasos

### 1. Obtener el código

Descargue el proyecto (ZIP o `git clone`) y entre a la carpeta:

```bash
cd signum
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Levantar PostgreSQL

**Opción A — con Docker (más rápido, recomendado):**

```bash
docker compose up -d db
```

Esto crea la base `signum` con usuario `signum` y clave `signum` en el puerto 5432.

**Opción B — con PostgreSQL instalado en su máquina:**

```bash
psql -U postgres -c "CREATE DATABASE signum;"
psql -U postgres -c "CREATE USER signum WITH PASSWORD 'signum';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE signum TO signum;"
psql -U postgres -d signum -c "GRANT ALL ON SCHEMA public TO signum;"
```

### 3.b Alternativa sin Docker — Neon (PostgreSQL en la nube, gratis)

Cree un proyecto en <https://neon.tech>, copie la **Connection string** y úsela
como `DATABASE_URL`. No necesita instalar nada más:

```env
DATABASE_URL=postgresql://usuario:clave@ep-xxxx.aws.neon.tech/neondb?sslmode=require
```

El cliente detecta Neon, Supabase, Railway, Render y Aiven y activa TLS
automáticamente.

### 4. Configurar variables de entorno

```bash
cp .env.example .env
```

Abra `.env` y confirme la cadena de conexión:

```env
DATABASE_URL=postgresql://signum:signum@127.0.0.1:5432/signum
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Crear tablas, cargar datos y arrancar

```bash
npx drizzle-kit push      # crea las tablas
npx tsx src/db/seed.ts    # carga datos de demostración
npm run dev               # arranca en modo desarrollo
```

Abra **<http://localhost:3000>** 🎉

> **Atajo:** ejecute `bash scripts/setup.sh` (Linux/macOS) o
> `powershell -File scripts/setup.ps1` (Windows) para hacer los pasos 2–5 de una vez.

---

## 🔑 Credenciales de demostración

| Dato | Valor |
|---|---|
| Usuario activo | Carlos Ernesto Gomez Rodriguez |
| Rol de sistema | `jefe_gestion` (único con acceso a **Seguridad**) |
| **Clave de firma del emisor** | `FIRMA2026` |
| Clave de firmantes semilla | `DEMO-FIRM` |

La clave de firma se cambia en **Organización → Contraseña de firma**.
Los firmantes nuevos reciben una clave generada `XXXX-XXXX` que se muestra
**una sola vez** al despachar el documento.

---

## 🧭 Recorrido rápido

1. **Nuevo documento** → asistente de 5 pasos (tipo, datos, firmantes, personas, revisar)
2. Se abre el **editor** con cabecera, estructura y contenedores de firma montados
3. **Guardar** → **Firmar y despachar** → rúbrica + clave `FIRMA2026`
4. Copie el **enlace** y la **clave** del firmante y ábralo en otra ventana
5. El firmante completa sus datos, acepta y firma → estampa inyectada + sello
6. Revise **Trazabilidad** en el expediente y **Seguridad** en el menú

---

## 🗂️ Comandos disponibles

```bash
npx tsx scripts/check-db.ts   # diagnóstico de la conexión a la base

npm run dev          # desarrollo con recarga en caliente
npm run build        # compilación de producción
npm run start        # servidor de producción (requiere build previo)
npm run lint         # análisis estático
npm run typecheck    # verificación de tipos

npx drizzle-kit push        # aplica el esquema a la base de datos
npx tsx src/db/seed.ts      # recarga datos de demostración (BORRA los actuales)
```

---

## 🌐 Publicar en un dominio

### Opción 1 · Vercel + Neon *(gratis, la más sencilla)*

1. Cree una base en <https://neon.tech> y copie la cadena `postgresql://…?sslmode=require`
2. Suba el proyecto a GitHub
3. En <https://vercel.com> → **Add New Project** → importe el repositorio
4. En **Environment Variables** agregue:
   - `DATABASE_URL` → la cadena de Neon
   - `NEXT_PUBLIC_APP_URL` → `https://su-proyecto.vercel.app`
5. **Deploy**
6. Aplique el esquema desde su equipo apuntando a Neon:

```bash
DATABASE_URL="postgresql://…?sslmode=require" npx drizzle-kit push
DATABASE_URL="postgresql://…?sslmode=require" npx tsx src/db/seed.ts
```

7. **Dominio propio:** Vercel → *Settings → Domains* → agregue `documentos.suempresa.com`
   y cree en su DNS un registro `CNAME` apuntando a `cname.vercel-dns.com`.
   El certificado HTTPS se emite automáticamente.

### Opción 2 · Servidor propio con Docker *(control total)*

En su VPS (Ubuntu con Docker instalado):

```bash
git clone <su-repositorio> signum && cd signum
cp .env.example .env          # ajuste las claves
docker compose --profile full up -d --build
```

La aplicación queda en el puerto **3000**. Para exponerla con dominio y HTTPS,
instale Nginx y Certbot:

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/signum`:

```nginx
server {
    listen 80;
    server_name documentos.suempresa.com;

    client_max_body_size 12M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/signum /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d documentos.suempresa.com
```

> **Importante:** las cabeceras `X-Real-IP` y `X-Forwarded-For` son las que
> alimentan el registro de IP en la pista de auditoría. No las omita.

### Opción 3 · Dominio de prueba sin servidor *(para mostrar la demo)*

Corra el proyecto en su equipo y expóngalo temporalmente:

```bash
npm run dev
npx localtunnel --port 3000        # entrega una URL https pública
# o, si usa Cloudflare:
cloudflared tunnel --url http://localhost:3000
```

Útil para que un compañero pruebe el flujo de firma desde su propio equipo.

---

## 🏢 Configurar su organización

Entre a **Organización** (`/organizacion`) y ajuste:

- **Perfil:** *Entidad pública* (Grado · Dependencia · Unidad) o
  *Empresa privada* (Cargo · Área · Empresa · NIT)
- Razón social, NIT, sigla, ciudad
- **Logo:** pegue una URL `https` de su logotipo (aparece en la cabecera del
  documento y en la estampa de firma)
- Rote la contraseña de firma

El visualizador inferior compara **ambos perfiles lado a lado** en vivo.

### Cambiar los usuarios de demostración

```bash
psql $DATABASE_URL
```

```sql
UPDATE users SET
  name = 'Su Nombre',
  email = 'su.correo@empresa.com',
  cargo = 'Su Cargo',
  cedula = '00000000',
  photo_url = 'https://…/foto.jpg',
  system_role = 'jefe_gestion'
WHERE email = 'carlos.gomez3224@correo.entidad.gov.co';
```

Roles válidos: `jefe_gestion`, `admin`, `usuario`.
Solo los dos primeros acceden al módulo **Seguridad**.

---

## 🔐 Checklist antes de producción

- [ ] Cambiar la clave de PostgreSQL (`signum/signum` es solo para desarrollo)
- [ ] Rotar la contraseña de firma (`FIRMA2026`)
- [ ] Servir siempre por **HTTPS** (los enlaces de firma viajan por ese canal)
- [ ] Configurar **copias de respaldo** de la base (`pg_dump` diario)
- [ ] Verificar que `.env` **no** esté en el repositorio
- [ ] Revisar que la cadena de auditoría marque **ÍNTEGRA** en `/seguridad`
- [ ] Definir política de entrega de claves **por canal distinto** al del enlace

Respaldo y restauración:

```bash
pg_dump "$DATABASE_URL" > respaldo_$(date +%F).sql
psql "$DATABASE_URL" < respaldo_2026-01-15.sql
```

---

## 🧱 Arquitectura

```
src/
├─ app/
│  ├─ (app)/            Consola: panel, bandeja, repositorio, seguridad, organización
│  ├─ firmar/[token]/   Portal público de firma
│  └─ api/              Endpoints: documentos, enviar, firmar, organización, health
├─ components/
│  ├─ wizard/           Asistente de configuración previa
│  ├─ editor/           Editor TipTap + nodo de contenedor de firma
│  ├─ signature-stamp   Estampa e insignias (institucional / corporativa)
│  ├─ doc-header        Cabecera de primera página
│  └─ doc-render        Motor de inyección en contenedores
├─ lib/
│  ├─ doctypes          Catálogo de tipos documentales y generación de cuerpo
│  ├─ entity            Metadatos dinámicos público / privado
│  ├─ crypto-sign       scrypt, tokens, NTP, doble hash
│  ├─ audit             Bitácora encadenada (trazabilidad + seguridad)
│  └─ sanitize          Saneamiento HTML anti-XSS
└─ db/                  Esquema Drizzle y semilla
```

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
Drizzle ORM · PostgreSQL · TipTap · Framer Motion.

---

## 🛠️ Problemas frecuentes

| Síntoma | Solución |
|---|---|
| `DATABASE_URL is required` | Falta el archivo `.env`. Ejecute `cp .env.example .env` |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL no está corriendo → `docker compose up -d db` |
| `relation "documents" does not exist` | Falta el esquema → `npx drizzle-kit push` |
| La app abre pero sin datos | Falta la semilla → `npx tsx src/db/seed.ts` |
| Puerto 3000 ocupado | `npm run dev -- -p 3001` |
| El enlace de firma no abre desde otro equipo | Use la URL pública (túnel o dominio), no `localhost` |
| Cambié el esquema y falla | Vuelva a ejecutar `npx drizzle-kit push` |

Reinicio total de la base de datos:

```bash
docker compose down -v && docker compose up -d db
sleep 5 && npx drizzle-kit push && npx tsx src/db/seed.ts
```
