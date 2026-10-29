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

      case 'agregarDocente':
        return handleAgregarDocente(payload);

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

  // ─────────────────────────────────────────────────────────
  // CORRECCIÓN: Usar getLastRow()/getLastColumn() en lugar de
  // getDataRange() para garantizar que se lean TODAS las filas,
  // incluso cuando hay celdas vacías en columnas intermedias.
  // ─────────────────────────────────────────────────────────
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    return createJsonResponse({ ok: true, docentes: [] });
  }

  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  var headers = normalizeHeaders(data[0]);
  var idxDocente    = headers.indexOf('DOCENTE');
  var idxApellidos  = headers.indexOf('APELLIDOS');
  var idxNombres    = headers.indexOf('NOMBRES');
  var idxAsistencia = headers.indexOf('ASISTENCIA');
  var idxGrupo      = headers.indexOf('GRUPO');
  var idxObservacion= headers.indexOf('OBSERVACION');

  if (idxApellidos === -1 || idxNombres === -1) {
    return createJsonResponse({
      ok: false,
      error: 'La hoja DOCENTES debe contener al menos las columnas "Apellidos" y "Nombres".'
    });
  }

  var docentes = [];

  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var rowNum = i + 1; // Número de fila real en Google Sheets (base 1)

    // Leer cada campo de forma segura
    var apellidos  = (idxApellidos  !== -1 && r[idxApellidos]  != null) ? r[idxApellidos].toString().trim()  : '';
    var nombres    = (idxNombres    !== -1 && r[idxNombres]    != null) ? r[idxNombres].toString().trim()    : '';
    var docente    = (idxDocente    !== -1 && r[idxDocente]    != null) ? r[idxDocente].toString().trim()    : '';
    var grupoVal   = (idxGrupo      !== -1 && r[idxGrupo]      != null) ? r[idxGrupo].toString().trim()      : '';
    var obsVal     = (idxObservacion!== -1 && r[idxObservacion]!= null) ? r[idxObservacion].toString().trim(): '';

    // Omitir fila solo si los TRES campos identificadores están vacíos
    // (evita omitir docentes que solo tienen apellido pero no nombre, etc.)
    if (!apellidos && !nombres && !docente) {
      continue;
    }

    // Procesar la asistencia: puede llegar como Date (cuando el Sheet guarda
    // automáticamente la fecha) o como texto plano escrito por la API.
    var asistenciaVal = (idxAsistencia !== -1 && r[idxAsistencia] != null) ? r[idxAsistencia] : '';
    var asistenciaStr = '';
    if (asistenciaVal instanceof Date) {
      asistenciaStr = Utilities.formatDate(asistenciaVal, TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
    } else {
      asistenciaStr = asistenciaVal.toString().trim();
    }

    docentes.push({
      row: rowNum,
      docente: docente,
      apellidos: apellidos,
      nombres: nombres,
      asistencia: asistenciaStr,
      grupo: grupoVal,
      observacion: obsVal
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
 * REGLA 5: Al marcar "Sin usuario", también se marca automáticamente "Asistió" (si no lo estaba).
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
    var colAsistencia = headers.indexOf('ASISTENCIA') + 1;
    var colGrupo = headers.indexOf('GRUPO') + 1;

    if (colObservacion === 0) {
      return createJsonResponse({
        ok: false,
        error: 'No se encontró la columna OBSERVACION en la hoja DOCENTES.'
      });
    }

    var nuevoValor = '';
    var asistenciaActualizada = null;
    var grupoActualizado = null;

    if (valor) {
      nuevoValor = 'crear usuario';
      sheet.getRange(row, colObservacion).setValue(nuevoValor);

      // Si se marca "Sin usuario", marcar automáticamente "Asistió" si no tenía asistencia previa
      if (colAsistencia > 0 && colGrupo > 0) {
        var asistenciaCelda = sheet.getRange(row, colAsistencia).getValue();
        if (!asistenciaCelda || asistenciaCelda.toString().trim() === '') {
          var ahora = new Date();
          asistenciaActualizada = Utilities.formatDate(ahora, TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
          grupoActualizado = session.grupo;
          sheet.getRange(row, colAsistencia).setValue(asistenciaActualizada);
          sheet.getRange(row, colGrupo).setValue(grupoActualizado);
        }
      }
    } else {
      // Si se desmarca "Sin usuario", solo limpiar la observación (no tocar asistencia)
      sheet.getRange(row, colObservacion).clearContent();
    }

    SpreadsheetApp.flush();

    return createJsonResponse({
      ok: true,
      row: row,
      observacion: nuevoValor,
      asistencia: asistenciaActualizada,
      grupo: grupoActualizado
    });

  } catch (e) {
    return createJsonResponse({ ok: false, error: 'Error al actualizar observación: ' + e.message });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Agrega un nuevo docente a la hoja DOCENTES
 * Columnas: Apellidos, Nombres, dni, Docente, ASISTENCIA, GRUPO, OBSERVACION
 * Todo docente agregado queda automáticamente con "Asistió" y "Sin usuario" en TRUE.
 */
function handleAgregarDocente(payload) {
  var session = validateToken(payload.token);
  if (!session) {
    return createJsonResponse({ ok: false, error: 'Sesión inválida o expirada. Vuelva a iniciar sesión.' });
  }

  var apellidos = (payload.apellidos || '').toString().trim().toUpperCase();
  var nombres   = (payload.nombres   || '').toString().trim().toUpperCase();
  var dni       = (payload.dni       || '').toString().trim();

  // Validaciones obligatorias
  if (!apellidos) {
    return createJsonResponse({ ok: false, error: 'El campo Apellidos es obligatorio.' });
  }
  if (!nombres) {
    return createJsonResponse({ ok: false, error: 'El campo Nombres es obligatorio.' });
  }
  if (!/^\d{8}$/.test(dni)) {
    return createJsonResponse({ ok: false, error: 'El DNI debe contener exactamente 8 dígitos numéricos.' });
  }

  var lock = LockService.getScriptLock();
  try {
    var hasLock = lock.tryLock(10000);
    if (!hasLock) {
      return createJsonResponse({ ok: false, error: 'Servidor ocupado. Por favor, intente nuevamente en unos segundos.' });
    }

    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(HOJA_DOCENTES);
    if (!sheet) {
      return createJsonResponse({ ok: false, error: 'No se encontró la hoja ' + HOJA_DOCENTES });
    }

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastCol < 1) {
      return createJsonResponse({ ok: false, error: 'La hoja DOCENTES no contiene columnas.' });
    }

    var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var headers = normalizeHeaders(headerRow);

    var idxDocente    = headers.indexOf('DOCENTE');
    var idxApellidos  = headers.indexOf('APELLIDOS');
    var idxNombres    = headers.indexOf('NOMBRES');
    var idxDni        = headers.indexOf('DNI');
    var idxAsistencia = headers.indexOf('ASISTENCIA');
    var idxGrupo      = headers.indexOf('GRUPO');
    var idxObservacion= headers.indexOf('OBSERVACION');

    if (idxApellidos === -1 || idxNombres === -1) {
      return createJsonResponse({
        ok: false,
        error: 'La hoja DOCENTES debe contener las columnas "Apellidos" y "Nombres".'
      });
    }

    // Validar si el DNI ya existe en la hoja
    if (idxDni !== -1 && lastRow >= 2) {
      var dniRangeValues = sheet.getRange(2, idxDni + 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < dniRangeValues.length; i++) {
        var existingDni = (dniRangeValues[i][0] != null) ? dniRangeValues[i][0].toString().trim() : '';
        if (existingDni === dni) {
          return createJsonResponse({
            ok: false,
            error: 'El DNI ' + dni + ' ya se encuentra registrado en el sistema.'
          });
        }
      }
    }

    // Generar número de nueva fila
    var newRow = lastRow + 1;
    var docenteCompuesto = apellidos + ' ' + nombres;
    var ahora = new Date();
    var fechaHoraStr = Utilities.formatDate(ahora, TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
    var obsStr = 'crear usuario';

    // Escribir únicamente en las columnas de datos directos (sin tocar las columnas de fórmulas I a O)
    if (idxApellidos   !== -1) sheet.getRange(newRow, idxApellidos + 1).setValue(apellidos);
    if (idxNombres     !== -1) sheet.getRange(newRow, idxNombres + 1).setValue(nombres);
    if (idxDni         !== -1) sheet.getRange(newRow, idxDni + 1).setValue(dni);
    if (idxDocente     !== -1) sheet.getRange(newRow, idxDocente + 1).setValue(docenteCompuesto);
    if (idxAsistencia  !== -1) sheet.getRange(newRow, idxAsistencia + 1).setValue(fechaHoraStr);
    if (idxGrupo       !== -1) sheet.getRange(newRow, idxGrupo + 1).setValue(session.grupo);
    if (idxObservacion !== -1) sheet.getRange(newRow, idxObservacion + 1).setValue(obsStr);

    // ─────────────────────────────────────────────────────────────
    // ARRASTRAR FÓRMULAS EXACTAMENTE DE LA COLUMNA I (9) A LA COLUMNA O (15)
    // ─────────────────────────────────────────────────────────────
    var colInicio = 9;  // Columna I
    var colFin    = 15; // Columna O
    var cantCols  = colFin - colInicio + 1; // 7 columnas: I, J, K, L, M, N, O

    // Asegurar que la hoja tenga al menos 15 columnas
    if (sheet.getMaxColumns() < colFin) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), colFin - sheet.getMaxColumns());
    }

    if (lastRow >= 2) {
      // Buscar hacia arriba desde lastRow hasta la fila 2 la primera fila que contenga fórmulas en I:O
      var filaModelo = -1;
      var formulasModeloR1C1 = null;

      for (var r = lastRow; r >= 2; r--) {
        var formulasFila = sheet.getRange(r, colInicio, 1, cantCols).getFormulasR1C1()[0];
        var tieneFormulas = formulasFila.some(function(f) { return f && f.toString().trim() !== ''; });
        if (tieneFormulas) {
          filaModelo = r;
          formulasModeloR1C1 = formulasFila;
          break;
        }
      }

      if (filaModelo !== -1 && formulasModeloR1C1) {
        var rangoOrigen = sheet.getRange(filaModelo, colInicio, 1, cantCols);
        var rangoDestino = sheet.getRange(newRow, colInicio, 1, cantCols);

        // Si la fila modelo es la inmediatamente anterior, usar arrastre nativo (autoFill)
        var arrastradoExitoso = false;
        if (filaModelo === lastRow) {
          try {
            var autoFillRange = sheet.getRange(lastRow, colInicio, 2, cantCols);
            rangoOrigen.autoFill(autoFillRange, SpreadsheetApp.AutoFillSeries.DEFAULT_SERIES);
            arrastradoExitoso = true;
          } catch (eAuto) {
            arrastradoExitoso = false;
          }
        }

        // Si no se usó autoFill o falló, aplicar copyTo con PASTE_FORMULAS
        if (!arrastradoExitoso) {
          rangoOrigen.copyTo(rangoDestino, SpreadsheetApp.CopyPasteType.PASTE_FORMULAS, false);
        }

        // Reaseguro directo: asignar setFormulaR1C1 en cualquier celda de I a O que esté vacía
        var formulasVerif = rangoDestino.getFormulasR1C1()[0];
        for (var k = 0; k < cantCols; k++) {
          if ((!formulasVerif[k] || formulasVerif[k].toString().trim() === '') && formulasModeloR1C1[k] && formulasModeloR1C1[k].toString().trim() !== '') {
            sheet.getRange(newRow, colInicio + k).setFormulaR1C1(formulasModeloR1C1[k]);
          }
        }

        // Copiar formato visual (bordes, fuentes, alineación)
        rangoOrigen.copyTo(rangoDestino, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      }
    }

    SpreadsheetApp.flush();

    return createJsonResponse({
      ok: true,
      message: 'Docente registrado exitosamente.',
      docente: {
        row: newRow,
        docente: docenteCompuesto,
        apellidos: apellidos,
        nombres: nombres,
        dni: dni,
        asistencia: fechaHoraStr,
        grupo: session.grupo,
        observacion: obsStr
      }
    });

  } catch (err) {
    return createJsonResponse({ ok: false, error: 'Error al agregar docente: ' + (err.message || err.toString()) });
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
