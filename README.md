# 📋 Sistema de Control de Asistencia de Docentes

Aplicación web moderna, accesible y de alto rendimiento para el **control de asistencia de docentes**, diseñada con arquitectura de frontend estático (**HTML5, CSS3, JavaScript Vanilla**) listo para alojarse en **GitHub Pages**, y backend serverless en **Google Apps Script** conectado a **Google Sheets (Google Drive)** como base de datos.

---

## 🚀 Características Principales

- **Autenticación por Grupo**: Los usuarios inician sesión con su grupo y contraseña. La validación se realiza 100% en el backend; nunca se expone la lista de contraseñas al navegador.
- **Lista de Asistencia Dinámica**: Muestra únicamente las columnas **Apellidos** y **Nombres**, con checkboxes táctiles accesibles (mínimo 44px de área táctil).
- **Registro Automático de Fecha/Hora**: Al marcar la asistencia, se almacena en el Google Sheet la marca de tiempo exacta (`dd/MM/yyyy HH:mm:ss`) con la zona horaria `America/Lima` y el nombre del grupo responsable.
- **Prevención de Sobrescritura**: Si un docente ya fue registrado por otro grupo, se muestra una insignia destacada y se solicita confirmación explícita antes de sobrescribirlo.
- **Acción "Sin Usuario"**: Permite marcar docentes que requieren cuenta, escribiendo `crear usuario` en la columna `OBSERVACION` del Sheet.
- **Buscador en Tiempo Real**: Filtrado reactivo con *debounce* por **Apellidos**, **Nombres** y **Docente**, insensible a mayúsculas y acentos/tildes (normalización NFD).
- **Filtros Rápidos y Estadísticas**: Resumen superior en tiempo real (Total, Presentes, Pendientes, Sin Usuario) y filtros rápidos (Todos / Asistieron / Pendientes / Sin Usuario).
- **Diseño Responsive Mobile-First**: Tarjetas táctiles optimizadas en smartphones y tabla de datos con cabecera fija (*sticky*) en computadoras de escritorio.
- **Paleta de Identidad Visual**: `#0125B7` → `#004ED8` → `#008CFF` → `#00B8FF`, con degradados corporativos y contraste verificado (Accesibilidad WCAG AA).
- **Feedback Optimista y Resiliencia**: Actualizaciones inmediatas en la interfaz con notificaciones *toast*, confirmaciones modales, bloqueo de concurrencia con `LockService` y botón de reintento ante fallos.
- **Modo Demo Integrado**: Permite probar la aplicación localmente o en GitHub Pages de inmediato sin necesidad de backend previo.

---

## 📂 Estructura del Proyecto

```text
/
├── index.html           # Estructura semántica accesible de la aplicación
├── css/
│   └── styles.css       # Estilos CSS, variables de paleta, responsive mobile/desktop
├── js/
│   ├── config.js        # Configuración de URL del Web App y flags del sistema
│   ├── api.js           # Capa de peticiones HTTP POST (CORS) y simulador demo
│   ├── auth.js          # Control de sesión en sessionStorage y login/logout
│   ├── ui.js            # Renderizado seguro (sin innerHTML en datos), toasts y modales
│   └── app.js           # Orquestador del flujo, buscador, filtros y checks
├── apps-script/
│   └── Code.gs          # Código de backend para Google Apps Script (Web App)
├── README.md            # Guía completa de instalación y despliegue
└── .gitignore           # Exclusiones de archivos temporales
```

---

## 📊 Estructura de la Base de Datos (Google Sheets)

Crea una hoja de cálculo en Google Drive con las siguientes **2 hojas** respetando exactamente los nombres de las pestañas:

### 1. Hoja `GRUPOS`
Gestiona las credenciales de los grupos autorizados para tomar asistencia.

| GRUPO | CONTRASEÑA | LUGAR |
| :--- | :--- | :--- |
| GRUPO 1 | 1234 | AULA MAGNA - PISO 1 |
| GRUPO 2 | 1234 | PABELLÓN B - LAB 204 |
| SISTEMAS | admin2026 | AUDITORIO CENTRAL |

> **Nota:** La columna `CONTRASEÑA` se evalúa como texto exacto. El backend busca las columnas por su nombre en el encabezado, por lo que el orden de las columnas no afectará su funcionamiento.

### 2. Hoja `DOCENTES`
Contiene el padrón de docentes y las columnas de control.

| Docente | Apellidos | Nombres | Correo | dni | ASISTENCIA | GRUPO | OBSERVACION | username | password | email | course1 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| ALVAREZ QUISPE CARLOS | ALVAREZ QUISPE | CARLOS ALBERTO | calvarez@demo.edu.pe | 12345678 | | | | calvarez | ****** | ... | Curso 1 |
| BARRERA FLORES MARIA | BARRERA FLORES | MARIA ELENA | mbarrera@demo.edu.pe | 87654321 | | | | mbarrera | ****** | ... | Curso 2 |

> 🔒 **Seguridad y Privacidad:** El backend **nunca** devuelve al frontend las columnas sensibles (`CONTRASEÑA`, `dni`, `correo`, `password`, `username`, `email`, `course1`). Solo expone `row`, `docente`, `apellidos`, `nombres`, `asistencia`, `grupo` y `observacion`.

---

## ⚙️ Guía de Despliegue Paso a Paso

### Paso 1: Configurar Google Apps Script

1. Abre tu hoja de cálculo en Google Sheets.
2. En el menú superior, haz clic en **Extensiones** > **Apps Script**.
3. Se abrirá el editor de código. Elimina cualquier contenido previo en el archivo `Código.gs` y pega todo el contenido de [`apps-script/Code.gs`](file:///apps-script/Code.gs).
4. *(Opcional)* Si el script se encuentra dentro del mismo Google Sheet (vinculado), la variable `SPREADSHEET_ID = ''` puede dejarse en blanco. Si creaste el script de forma independiente en Google Drive, coloca el ID de tu hoja entre las comillas:
   ```javascript
   const SPREADSHEET_ID = '1a2b3c4d5e6f7g8h9i0...';
   ```

### Paso 2: Publicar como Aplicación Web (Web App)

1. En la esquina superior derecha del editor de Apps Script, haz clic en el botón azul **Implementar** (*Deploy*) > **Nueva implementación** (*New deployment*).
2. Haz clic en el ícono de engranaje (⚙️) al lado de "Seleccionar tipo" y selecciona **Aplicación web** (*Web app*).
3. Configura los siguientes campos:
   - **Descripción**: `Producción v1.0`
   - **Ejecutar como**: **Yo (tu cuenta de correo de Google)**.
   - **Quién tiene acceso**: **Cualquier persona** (*Anyone*).
4. Haz clic en **Implementar**.
5. Si es la primera vez, Google te pedirá autorizar los permisos:
   - Haz clic en **Autorizar acceso**.
   - Selecciona tu cuenta.
   - Si aparece "Google no ha verificado esta aplicación", haz clic en **Avanzado** (*Advanced*) y luego en **Ir a Control de Asistencia (no seguro)**.
   - Haz clic en **Permitir**.
6. Copia la **URL de la aplicación web** generada (termina en `/exec`).

### Paso 3: Conectar el Frontend con el Backend

1. Abre el archivo [`js/config.js`](file:///js/config.js) en tu editor.
2. Reemplaza `TU_APPS_SCRIPT_URL_AQUI` por la URL que copiaste en el paso anterior:
   ```javascript
   const CONFIG = {
     SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbx.../exec',
     DEMO_MODE: false,
     TIMEOUT_MS: 15000,
     ...
   };
   ```
3. Guarda los cambios.

### Paso 4: Publicar en GitHub Pages

1. Inicializa tu repositorio y sube los archivos a GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: control de asistencia docentes inicial"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
   git push -u origin main
   ```
2. En GitHub, ve a la pestaña **Settings** de tu repositorio.
3. En el menú lateral izquierdo, haz clic en **Pages**.
4. En la sección **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`
   - **Folder**: `/ (root)`
5. Haz clic en **Save**.
6. En 1-2 minutos tu aplicación estará publicada en:
   `https://TU_USUARIO.github.io/TU_REPOSITORIO/`

---

## 🔄 Cómo Actualizar el Código de Google Apps Script

Si en el futuro modificas [`apps-script/Code.gs`](file:///apps-script/Code.gs), debes crear una **nueva versión** de la implementación para que los cambios tomen efecto:

1. Entra a tu proyecto en **Apps Script**.
2. Haz clic en **Implementar** > **Administrar implementaciones** (*Manage deployments*).
3. Selecciona la implementación activa y haz clic en el ícono de lápiz (**Editar**).
4. En la lista desplegable **Versión**, selecciona **Nueva versión** (*New version*).
5. Haz clic en **Implementar**. La URL seguirá siendo la misma y el frontend continuará funcionando con las nuevas mejoras.

---

## ⚡ Modo Demo (Pruebas Inmediatas sin Backend)

La aplicación cuenta con un simulador local que se activa automáticamente si no se ha configurado la URL del Web App, o si cambias `DEMO_MODE: true` en `js/config.js`.

### Credenciales de prueba en Modo Demo:
- **Usuario (Grupo)**: `GRUPO 1` | **Contraseña**: `1234`
- **Usuario (Grupo)**: `GRUPO 2` | **Contraseña**: `1234`
- **Usuario (Grupo)**: `ADMIN` | **Contraseña**: `admin`

En Modo Demo, todos los cambios en asistencia y observaciones se guardan localmente en el navegador (`localStorage`), permitiendo probar flujos de búsqueda, ordenamiento, confirmaciones y actualizaciones optimistas al instante.

---

## 🛡️ Seguridad Implementada

- **Cero exposición de datos sensibles**: Ni contraseñas de docentes, ni DNIs, ni correos electrónicos viajan a través de la API.
- **Protección contra Fuerza Bruta**: Límite de 5 intentos fallidos consecutivos en el login con bloqueo temporal de 5 minutos gestionado con `CacheService`.
- **Sesión Efímera con UUID**: Se emite un token de sesión opaco generado en el servidor con expiración automática de 6 horas.
- **Prevención de Ataques XSS**: Todo el renderizado de datos del usuario utiliza `textContent` y creación programática de nodos (`document.createElement`).
- **Concurrencia Segura**: Uso de `LockService.getScriptLock()` durante las escrituras para evitar que múltiples coordinadores sobreescriban datos al mismo milisegundo.
