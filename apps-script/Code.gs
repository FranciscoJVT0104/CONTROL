/**
 * Code.gs - Backend API para Control de Asistencia de Docentes
 * Ejecutado en Google Apps Script como Aplicación Web (Web App)
 * 
 * Configuración:
 * 1. Asigna tu SPREADSHEET_ID o deja en blanco si el script está vinculado al Sheet (Extensiones > Apps Script).
 * 2. Implementa como Web App: "Ejecutar como: Yo", "Acceso: Cualquier persona".
 */

// ==========================================
// CONFIGURACIÓN GLOBAL
// ==========================================
const SPREADSHEET_ID = ''; // Dejar vacío si está vinculado al Google Sheet o colocar el ID
const HOJA_GRUPOS = 'GRUPOS';
const HOJA_DOCENTES = 'DOCENTES';
const TIMEZONE = 'America/Lima';
const TOKEN_TTL_SECONDS = 21600; // 6 horas (en segundos)
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 300; // 5 minutos de bloqueo tras intentos fallidos

/**
 * Obtiene la instancia del Google Spreadsheet
 */
function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== '' && SPREADSHEET_ID !== 'TU_SPREADSHEET_ID_AQUI') {
    return SpreadsheetApp.openById(SPREADSHEET_ID.trim());
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Controlador para solicitudes GET (utilizado para comprobación de estado)
 */
function doGet(e) {
  return createJsonResponse({
    ok: true,
    message: 'API de Control de Asistencia activa y funcionando correctamente.',
    timestamp: new Date().toISOString()
  });
}

/**
 * Controlador principal para solicitudes POST
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ ok: false, error: 'No se recibieron datos en la solicitud.' });
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createJsonResponse({ ok: false, error: 'Formato JSON inválido.' });
    }

    var action = payload.action;

    switch (action) {
      case 'login':
        return handleLogin(payload);

      case 'getDocentes':
        return handleGetDocentes(payload);

      case 'marcarAsistencia':
        return handleMarcarAsistencia(payload);

      case 'marcarSinUsuario':
        return handleMarcarSinUsuario(payload);

      default:
        return createJsonResponse({ ok: false, error: 'Acción no reconocida: ' + action });
    }

  } catch (err) {
    return createJsonResponse({
      ok: false,
      error: 'Error interno del servidor: ' + (err.message || err.toString())
    });
  }
}

// ==========================================
// CONTROLADORES DE ACCIONES
// ==========================================

/**
 * Autenticación de usuarios por grupo
 * Valida credenciales contra la hoja GRUPOS y genera un token en CacheService.
 */
function handleLogin(payload) {
  var grupo = (payload.grupo || '').toString().trim();
  var password = (payload.password || '').toString().trim();

  if (!grupo || !password) {
    return createJsonResponse({ ok: false, error: 'Usuario (grupo) y contraseña son requeridos.' });
  }

  var cache = CacheService.getScriptCache();
  var attemptKey = 'login_attempts_' + grupo.toLowerCase();
  var attempts = parseInt(cache.get(attemptKey) || '0', 10);

  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    return createJsonResponse({
      ok: false,
      error: 'Demasiados intentos fallidos. Bloqueado temporalmente por 5 minutos.'
    });
  }

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(HOJA_GRUPOS);
  if (!sheet) {
    return createJsonResponse({ ok: false, error: 'No se encontró la hoja ' + HOJA_GRUPOS });
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return createJsonResponse({ ok: false, error: 'La hoja GRUPOS no contiene registros.' });
  }

  var headers = normalizeHeaders(data[0]);
  var idxGrupo = headers.indexOf('GRUPO');
  var idxPass = headers.indexOf('CONTRASEÑA');
  var idxLugar = headers.indexOf('LUGAR');

  if (idxGrupo === -1 || idxPass === -1) {
    return createJsonResponse({
      ok: false,
      error: 'La hoja GRUPOS debe tener las columnas "GRUPO" y "CONTRASEÑA".'
    });
  }

  var usuarioEncontrado = null;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowGrupo = (row[idxGrupo] !== null && row[idxGrupo] !== undefined) ? row[idxGrupo].toString().trim() : '';
    var rowPass = (row[idxPass] !== null && row[idxPass] !== undefined) ? row[idxPass].toString().trim() : '';
    var rowLugar = (idxLugar !== -1 && row[idxLugar] !== null && row[idxLugar] !== undefined) ? row[idxLugar].toString().trim() : '';

    if (rowGrupo.toLowerCase() === grupo.toLowerCase()) {
      if (rowPass === password) {
        usuarioEncontrado = {
          grupo: rowGrupo,
          lugar: rowLugar
        };
        break;
      }
    }
  }

  if (!usuarioEncontrado) {
    // Incrementar contador de intentos fallidos
    attempts++;
    cache.put(attemptKey, attempts.toString(), LOCKOUT_SECONDS);
    return createJsonResponse({
      ok: false,
      error: 'Usuario o contraseña incorrectos. Verifique sus credenciales.'
    });
  }

  // Éxito: limpiar intentos y generar token seguro
  cache.remove(attemptKey);
  var token = Utilities.getUuid();
  var sessionData = JSON.stringify({
    grupo: usuarioEncontrado.grupo,
    lugar: usuarioEncontrado.lugar,
    createdAt: new Date().getTime()
  });

  cache.put('session_' + token, sessionData, TOKEN_TTL_SECONDS);

  return createJsonResponse({
    ok: true,
    grupo: usuarioEncontrado.grupo,
    lugar: usuarioEncontrado.lugar,
    token: token
  });
}

/**
 * Obtiene la lista de docentes
 * Solo expone: row, docente, apellidos, nombres, asistencia, grupo, observacion.
 * NUNCA expone dni, contraseñas, correos ni datos sensibles.
 */
function handleGetDocentes(payload) {
  var session = validateToken(payload.token);
  if (!session) {
    return createJsonResponse({ ok: false, error: 'Sesión inválida o expirada. Vuelva a iniciar sesión.' });
  }

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(HOJA_DOCENTES);
  if (!sheet) {
    return createJsonResponse({ ok: false, error: 'No se encontró la hoja ' + HOJA_DOCENTES });
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return createJsonResponse({ ok: true, docentes: [] });
  }

  var headers = normalizeHeaders(data[0]);
  var idxDocente = headers.indexOf('DOCENTE');
  var idxApellidos = headers.indexOf('APELLIDOS');
  var idxNombres = headers.indexOf('NOMBRES');
  var idxAsistencia = headers.indexOf('ASISTENCIA');
  var idxGrupo = headers.indexOf('GRUPO');
  var idxObservacion = headers.indexOf('OBSERVACION');

  if (idxApellidos === -1 || idxNombres === -1) {
    return createJsonResponse({
      ok: false,
      error: 'La hoja DOCENTES debe contener al menos las columnas "Apellidos" y "Nombres".'
    });
  }

  var docentes = [];
  // Recorrer filas de datos (índice 1 en adelante)
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var rowNum = i + 1; // Fila física real en Google Sheets (base 1)

    var apellidos = (idxApellidos !== -1 && r[idxApellidos] !== undefined && r[idxApellidos] !== null) ? r[idxApellidos].toString().trim() : '';
    var nombres = (idxNombres !== -1 && r[idxNombres] !== undefined && r[idxNombres] !== null) ? r[idxNombres].toString().trim() : '';
    var docente = (idxDocente !== -1 && r[idxDocente] !== undefined && r[idxDocente] !== null) ? r[idxDocente].toString().trim() : '';

    // Si la fila está completamente vacía de nombre y apellido, omitirla
    if (!apellidos && !nombres && !docente) {
      continue;
    }

    var asistenciaVal = (idxAsistencia !== -1 && r[idxAsistencia] !== undefined && r[idxAsistencia] !== null) ? r[idxAsistencia] : '';
    var asistenciaStr = '';
    if (asistenciaVal instanceof Date) {
      asistenciaStr = Utilities.formatDate(asistenciaVal, TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
    } else {
      asistenciaStr = asistenciaVal.toString().trim();
    }

    var grupoVal = (idxGrupo !== -1 && r[idxGrupo] !== undefined && r[idxGrupo] !== null) ? r[idxGrupo].toString().trim() : '';
    var observacionVal = (idxObservacion !== -1 && r[idxObservacion] !== undefined && r[idxObservacion] !== null) ? r[idxObservacion].toString().trim() : '';

    docentes.push({
      row: rowNum,
      docente: docente,
      apellidos: apellidos,
      nombres: nombres,
      asistencia: asistenciaStr,
      grupo: grupoVal,
      observacion: observacionVal
    });
  }

  return createJsonResponse({
    ok: true,
    docentes: docentes
  });
}

/**
 * Marca o desmarca asistencia para un docente específico
 * Utiliza LockService para prevenir colisiones en concurrencia.
 */
function handleMarcarAsistencia(payload) {
  var session = validateToken(payload.token);
  if (!session) {
    return createJsonResponse({ ok: false, error: 'Sesión inválida o expirada. Vuelva a iniciar sesión.' });
  }

  var row = parseInt(payload.row, 10);
  var valor = !!payload.valor; // true o false

  if (!row || row < 2) {
    return createJsonResponse({ ok: false, error: 'Número de fila inválido.' });
  }

  var lock = LockService.getScriptLock();
  try {
    // Esperar hasta 10 segundos por el bloqueo
    var hasLock = lock.tryLock(10000);
    if (!hasLock) {
      return createJsonResponse({ ok: false, error: 'Servidor ocupado. Por favor, reintente en unos segundos.' });
    }

    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(HOJA_DOCENTES);
    if (!sheet) {
      return createJsonResponse({ ok: false, error: 'No se encontró la hoja ' + HOJA_DOCENTES });
    }

    var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var headers = normalizeHeaders(headerRow);
    var colAsistencia = headers.indexOf('ASISTENCIA') + 1;
    var colGrupo = headers.indexOf('GRUPO') + 1;

    if (colAsistencia === 0 || colGrupo === 0) {
      return createJsonResponse({
        ok: false,
        error: 'No se encontraron las columnas ASISTENCIA o GRUPO en la hoja DOCENTES.'
      });
    }

    var fechaHoraStr = '';
    var grupoAsignado = '';

    if (valor) {
      // Registrar fecha y hora actual en zona horaria America/Lima
      var ahora = new Date();
      fechaHoraStr = Utilities.formatDate(ahora, TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
      grupoAsignado = session.grupo;

      sheet.getRange(row, colAsistencia).setValue(fechaHoraStr);
      sheet.getRange(row, colGrupo).setValue(grupoAsignado);
    } else {
      // Desmarcar: limpiar celdas
      sheet.getRange(row, colAsistencia).clearContent();
      sheet.getRange(row, colGrupo).clearContent();
    }

    SpreadsheetApp.flush();

    return createJsonResponse({
      ok: true,
      row: row,
      asistencia: fechaHoraStr,
      grupo: grupoAsignado
    });

  } catch (e) {
    return createJsonResponse({ ok: false, error: 'Error al actualizar asistencia: ' + e.message });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Marca o desmarca "Sin usuario" en la columna OBSERVACION
 * Escribe 'crear usuario' o limpia la celda.
 */
function handleMarcarSinUsuario(payload) {
  var session = validateToken(payload.token);
  if (!session) {
    return createJsonResponse({ ok: false, error: 'Sesión inválida o expirada. Vuelva a iniciar sesión.' });
  }

  var row = parseInt(payload.row, 10);
  var valor = !!payload.valor; // true o false

  if (!row || row < 2) {
    return createJsonResponse({ ok: false, error: 'Número de fila inválido.' });
  }

  var lock = LockService.getScriptLock();
  try {
    var hasLock = lock.tryLock(10000);
    if (!hasLock) {
      return createJsonResponse({ ok: false, error: 'Servidor ocupado. Por favor, reintente en unos segundos.' });
    }

    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(HOJA_DOCENTES);
    if (!sheet) {
      return createJsonResponse({ ok: false, error: 'No se encontró la hoja ' + HOJA_DOCENTES });
    }

    var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var headers = normalizeHeaders(headerRow);
    var colObservacion = headers.indexOf('OBSERVACION') + 1;

    if (colObservacion === 0) {
      return createJsonResponse({
        ok: false,
        error: 'No se encontró la columna OBSERVACION en la hoja DOCENTES.'
      });
    }

    var nuevoValor = '';
    if (valor) {
      nuevoValor = 'crear usuario';
      sheet.getRange(row, colObservacion).setValue(nuevoValor);
    } else {
      sheet.getRange(row, colObservacion).clearContent();
    }

    SpreadsheetApp.flush();

    return createJsonResponse({
      ok: true,
      row: row,
      observacion: nuevoValor
    });

  } catch (e) {
    return createJsonResponse({ ok: false, error: 'Error al actualizar observación: ' + e.message });
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// UTILIDADES AUXILIARES
// ==========================================

/**
 * Valida un token de sesión en CacheService
 * Retorna los datos de la sesión { grupo, lugar } o null si no existe.
 */
function validateToken(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var raw = cache.get('session_' + token);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * Normaliza una lista de encabezados para búsqueda insensible a mayúsculas y espacios
 */
function normalizeHeaders(headers) {
  return headers.map(function(h) {
    if (h === null || h === undefined) return '';
    return h.toString().trim().toUpperCase();
  });
}

/**
 * Construye la respuesta JSON compatible con CORS
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
