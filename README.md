# Sistema de Control de Asistencia de Docentes

Aplicación web moderna, accesible y de alto rendimiento para el **control de asistencia de docentes**, diseñada con arquitectura de frontend estático (**HTML5, CSS3, JavaScript Vanilla**) listo para alojarse en **GitHub Pages**, y backend serverless en **Google Apps Script** conectado a **Google Sheets (Google Drive)** como base de datos.

---

## Características Principales

- **Autenticación por Grupo**: Los usuarios inician sesión con su grupo y contraseña. La validación se realiza 100% en el backend; nunca se expone la lista de contraseñas al navegador.
- **Lista de Asistencia Dinámica**: Muestra únicamente las columnas **Apellidos** y **Nombres**, con checkboxes táctiles accesibles (mínimo 44px de área táctil).
- **Registro Automático de Fecha/Hora**: Al marcar la asistencia, se almacena en el Google Sheet la marca de tiempo exacta (`dd/MM/yyyy HH:mm:ss`) con la zona horaria `America/Lima` y el nombre del grupo responsable.
- **Prevención de Sobrescritura**: Si un docente ya fue registrado por otro grupo, se muestra una insignia destacada y se solicita confirmación explícita antes de sobrescribirlo.
- **Acción "Sin Usuario" con Asistencia Automática**: Al marcar a un docente como "Sin usuario", la columna `ASISTENCIA` se marca automáticamente en la misma operación de guardado en el Sheet y en la interfaz. Mientras "Sin usuario" esté activo, "Asistió" queda bloqueado para evitar inconsistencias.
- **Agregar Nuevo Docente**: Modal para incorporar docentes con Apellidos, Nombres y DNI validado (8 dígitos), registrándolos automáticamente con asistencia y sin usuario en una sola operación atómica.
- **Buscador en Tiempo Real**: Filtrado reactivo con *debounce* por **Apellidos**, **Nombres** y **Docente**, insensible a mayúsculas y acentos/tildes (normalización NFD).
- **Filtros Rápidos y Estadísticas**: Resumen superior en tiempo real (Total, Presentes, Pendientes, Sin Usuario) y filtros rápidos (Todos / Asistieron / Pendientes / Sin Usuario).
- **Sincronización en Tiempo Real**: Actualización silenciosa cada 5 segundos con prevención de peticiones acumuladas y fusión inteligente de registros.
- **Diseño Responsive Mobile-First**: Tarjetas táctiles optimizadas en smartphones y tabla de datos en computadoras de escritorio.
- **Identidad Visual y Font Awesome**: Integración del logo institucional (`img/LOG-BORDE.png`) e iconografía con Font Awesome 6.
- **Feedback Optimista y Resiliencia**: Actualizaciones inmediatas en la interfaz con notificaciones *toast*, confirmaciones modales, bloqueo de concurrencia con `LockService` y botón de reintento ante fallos.
- **Modo Demo Integrado**: Permite probar la aplicación localmente o en GitHub Pages de inmediato sin necesidad de backend previo.

---

## Estructura de la Base de Datos (Google Sheets)

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

> **Seguridad y Privacidad:** El backend **nunca** devuelve al frontend las columnas sensibles (`CONTRASEÑA`, `dni`, `correo`, `password`, `username`, `email`, `course1`). Solo expone `row`, `docente`, `apellidos`, `nombres`, `asistencia`, `grupo` y `observacion`.

---

## Guía de Despliegue Paso a Paso

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
2. Haz clic en el ícono de engranaje al lado de "Seleccionar tipo" y selecciona **Aplicación web** (*Web app*).
3. Configura los siguientes campos:
   - **Descripción**: `Producción v1.1`
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
2. Reemplaza la URL en `SCRIPT_URL` por la URL que copiaste en el paso anterior.
3. Guarda los cambios.

### Paso 4: Publicar en GitHub Pages

1. Inicializa tu repositorio y sube los archivos a GitHub:
   ```bash
   git add .
   git commit -m "feat: logo institucional, font awesome, nuevo docente y actualizacion 5s"
   git push origin main
   ```
2. En GitHub, ve a la pestaña **Settings** de tu repositorio.
3. En el menú lateral izquierdo, haz clic en **Pages**.
4. En la sección **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`
   - **Folder**: `/ (root)`
5. Haz clic en **Save**.

---

## Cómo Actualizar el Código de Google Apps Script

Si modificas [`apps-script/Code.gs`](file:///apps-script/Code.gs), debes crear una **nueva versión** de la implementación:

1. Entra a tu proyecto en **Apps Script**.
2. Haz clic en **Implementar** > **Administrar implementaciones** (*Manage deployments*).
3. Selecciona la implementación activa y haz clic en el ícono de lápiz (**Editar**).
4. En la lista desplegable **Versión**, selecciona **Nueva versión** (*New version*).
5. Haz clic en **Implementar**.

---

## Modo Demo (Pruebas Inmediatas sin Backend)

La aplicación cuenta con un simulador local que se activa si cambias `DEMO_MODE: true` en `js/config.js`.

### Credenciales de prueba en Modo Demo:
- **Usuario (Grupo)**: `GRUPO 1` | **Contraseña**: `1234`
- **Usuario (Grupo)**: `GRUPO 2` | **Contraseña**: `1234`
- **Usuario (Grupo)**: `ADMIN` | **Contraseña**: `admin`

---

## Seguridad Implementada

- **Cero exposición de datos sensibles**: Ni contraseñas de docentes, ni DNIs, ni correos electrónicos viajan en listados generales.
- **Protección contra Fuerza Bruta**: Límite de 5 intentos fallidos consecutivos en el login con bloqueo temporal de 5 minutos gestionado con `CacheService`.
- **Sesión Efímera con UUID**: Se emite un token de sesión opaco generado en el servidor con expiración automática de 6 horas.
- **Prevención de Ataques XSS**: Todo el renderizado de datos del usuario utiliza `textContent` y creación programática de nodos.
- **Concurrencia Segura**: Uso de `LockService.getScriptLock()` durante las escrituras para evitar colisiones entre coordinadores concurrentes.
