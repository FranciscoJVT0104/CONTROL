/**
 * api.js - Capa de comunicación con Google Apps Script o Modo Demo
 * Control de Asistencia de Docentes
 */

const Api = (function() {
  'use strict';

  // Base de datos simulada en memoria/localStorage para DEMO_MODE
  const DEMO_STORAGE_KEY = 'asistencia_docentes_demo_db_v1';

  const DEFAULT_DEMO_DOCENTES = [
    { row: 2, docente: 'ALVAREZ QUISPE CARLOS ALBERTO', apellidos: 'ALVAREZ QUISPE', nombres: 'CARLOS ALBERTO', asistencia: '28/10/2026 08:15:30', grupo: 'GRUPO 1', observacion: '' },
    { row: 3, docente: 'BARRERA FLORES MARIA ELENA', apellidos: 'BARRERA FLORES', nombres: 'MARIA ELENA', asistencia: '', grupo: '', observacion: 'crear usuario' },
    { row: 4, docente: 'CASTRO ROJAS JORGE LUIS', apellidos: 'CASTRO ROJAS', nombres: 'JORGE LUIS', asistencia: '', grupo: '', observacion: '' },
    { row: 5, docente: 'DELGADO MENDOZA ANA PATRICIA', apellidos: 'DELGADO MENDOZA', nombres: 'ANA PATRICIA', asistencia: '28/10/2026 08:30:12', grupo: 'GRUPO 2', observacion: '' },
    { row: 6, docente: 'ESPINOZA HUAMAN LUIS ENRIQUE', apellidos: 'ESPINOZA HUAMAN', nombres: 'LUIS ENRIQUE', asistencia: '', grupo: '', observacion: '' },
    { row: 7, docente: 'FLORES PAREDES ROSA LUZ', apellidos: 'FLORES PAREDES', nombres: 'ROSA LUZ', asistencia: '', grupo: '', observacion: '' },
    { row: 8, docente: 'GUTIERREZ RAMIREZ PEDRO MANUEL', apellidos: 'GUTIERREZ RAMIREZ', nombres: 'PEDRO MANUEL', asistencia: '', grupo: '', observacion: 'crear usuario' },
    { row: 9, docente: 'HERRERA SALAZAR CARMEN ROSA', apellidos: 'HERRERA SALAZAR', nombres: 'CARMEN ROSA', asistencia: '', grupo: '', observacion: '' },
    { row: 10, docente: 'LOPEZ VASQUEZ MIGUEL ANGEL', apellidos: 'LOPEZ VASQUEZ', nombres: 'MIGUEL ANGEL', asistencia: '', grupo: '', observacion: '' },
    { row: 11, docente: 'MENDOZA CHAVEZ GLORIA BEATRIZ', apellidos: 'MENDOZA CHAVEZ', nombres: 'GLORIA BEATRIZ', asistencia: '', grupo: '', observacion: '' }
  ];

  const DEMO_GRUPOS = [
    { grupo: 'GRUPO 1', password: '1234', lugar: 'AULA MAGNA - PISO 1' },
    { grupo: 'GRUPO 2', password: '1234', lugar: 'PABELLON B - LAB 204' },
    { grupo: 'ADMIN', password: 'admin', lugar: 'DIRECCIÓN ACADÉMICA' }
  ];

  function getDemoDocentes() {
    try {
      const stored = localStorage.getItem(DEMO_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('No se pudo leer demo storage:', e);
    }
    // Inicializar con los datos por defecto
    saveDemoDocentes(DEFAULT_DEMO_DOCENTES);
    return JSON.parse(JSON.stringify(DEFAULT_DEMO_DOCENTES));
  }

  function saveDemoDocentes(data) {
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('No se pudo guardar demo storage:', e);
    }
  }

  /**
   * Simulación del backend para DEMO_MODE
   */
  async function simulateBackend(payload) {
    // Simular latencia de red entre 250ms y 450ms
    await new Promise(r => setTimeout(r, 300 + Math.random() * 150));

    const action = payload.action;

    if (action === 'login') {
      const inputGrupo = (payload.grupo || '').trim().toLowerCase();
      const inputPass = (payload.password || '').trim();

      const match = DEMO_GRUPOS.find(g => g.grupo.toLowerCase() === inputGrupo && g.password === inputPass);
      if (match) {
        return {
          ok: true,
          grupo: match.grupo,
          lugar: match.lugar,
          token: 'demo-token-' + Date.now()
        };
      } else {
        return {
          ok: false,
          error: 'Credenciales inválidas en modo demo. Prueba Grupo: "GRUPO 1" y Contraseña: "1234".'
        };
      }
    }

    if (action === 'getDocentes') {
      return {
        ok: true,
        docentes: getDemoDocentes()
      };
    }

    if (action === 'marcarAsistencia') {
      const docentes = getDemoDocentes();
      const item = docentes.find(d => d.row === payload.row);
      if (!item) {
        return { ok: false, error: 'Docente no encontrado' };
      }

      if (payload.valor) {
        const ahora = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        const fechaStr = `${pad(ahora.getDate())}/${pad(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
        const session = Auth.getSession();
        item.asistencia = fechaStr;
        item.grupo = session ? session.grupo : 'GRUPO 1';
      } else {
        item.asistencia = '';
        item.grupo = '';
      }

      saveDemoDocentes(docentes);
      return {
        ok: true,
        row: item.row,
        asistencia: item.asistencia,
        grupo: item.grupo
      };
    }

    if (action === 'marcarSinUsuario') {
      const docentes = getDemoDocentes();
      const item = docentes.find(d => d.row === payload.row);
      if (!item) {
        return { ok: false, error: 'Docente no encontrado' };
      }

      item.observacion = payload.valor ? 'crear usuario' : '';

      // Si se marca "Sin usuario", marcar automáticamente "Asistió" si no lo estaba
      let asistenciaActualizada = null;
      let grupoActualizado = null;
      if (payload.valor && (!item.asistencia || item.asistencia.trim() === '')) {
        const ahora = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        const fechaStr = `${pad(ahora.getDate())}/${pad(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
        const session = Auth.getSession();
        item.asistencia = fechaStr;
        item.grupo = session ? session.grupo : 'GRUPO 1';
        asistenciaActualizada = item.asistencia;
        grupoActualizado = item.grupo;
      }

      saveDemoDocentes(docentes);
      return {
        ok: true,
        row: item.row,
        observacion: item.observacion,
        asistencia: asistenciaActualizada,
        grupo: grupoActualizado
      };
    }

    if (action === 'agregarDocente') {
      const apellidos = (payload.apellidos || '').trim().toUpperCase();
      const nombres   = (payload.nombres   || '').trim().toUpperCase();
      const dni       = (payload.dni       || '').trim();

      if (!apellidos) return { ok: false, error: 'El campo Apellidos es obligatorio.' };
      if (!nombres)   return { ok: false, error: 'El campo Nombres es obligatorio.' };
      if (!/^\d{8}$/.test(dni)) return { ok: false, error: 'El DNI debe contener exactamente 8 dígitos numéricos.' };

      const docentes = getDemoDocentes();
      // Validar si el DNI ya existe en demo
      const existeDni = docentes.some(d => (d.dni || '').toString().trim() === dni);
      if (existeDni) {
        return { ok: false, error: `El DNI ${dni} ya se encuentra registrado en el sistema.` };
      }

      const maxRow = docentes.reduce((max, d) => Math.max(max, d.row || 0), 1);
      const newRow = maxRow + 1;
      const session = Auth.getSession();
      const ahora = new Date();
      const pad = (n) => n.toString().padStart(2, '0');
      const fechaStr = `${pad(ahora.getDate())}/${pad(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
      const docenteCompuesto = `${apellidos} ${nombres}`;

      const nuevoDocente = {
        row: newRow,
        docente: docenteCompuesto,
        apellidos: apellidos,
        nombres: nombres,
        dni: dni,
        asistencia: fechaStr,
        grupo: session ? session.grupo : 'GRUPO 1',
        observacion: 'crear usuario'
      };

      docentes.push(nuevoDocente);
      saveDemoDocentes(docentes);

      return {
        ok: true,
        message: 'Docente registrado exitosamente.',
        docente: nuevoDocente
      };
    }

    return { ok: false, error: 'Acción no soportada en demo' };
  }

  /**
   * Realiza una petición POST al Web App de Google Apps Script
   * Usa Content-Type: text/plain;charset=utf-8 para evitar preflight OPTIONS
   */
  async function request(payload) {
    if (CONFIG.DEMO_MODE) {
      return await simulateBackend(payload);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS || 15000);

    try {
      const response = await fetch(CONFIG.SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Error en el servidor HTTP (${response.status}: ${response.statusText})`);
      }

      const result = await response.json();
      return result;

    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        throw new Error('Tiempo de espera agotado (timeout). Comprueba tu conexión a internet.');
      }
      throw new Error(err.message || 'Error de conexión con el servidor.');
    }
  }

  // Métodos públicos
  return {
    /**
     * Iniciar sesión
     */
    login: function(grupo, password) {
      return request({
        action: 'login',
        grupo: grupo,
        password: password
      });
    },

    /**
     * Obtener listado de docentes
     */
    getDocentes: function(token) {
      return request({
        action: 'getDocentes',
        token: token
      });
    },

    /**
     * Marcar o desmarcar asistencia
     */
    marcarAsistencia: function(token, row, valor) {
      return request({
        action: 'marcarAsistencia',
        token: token,
        row: row,
        valor: valor
      });
    },

    /**
     * Marcar o desmarcar "Sin usuario"
     */
    marcarSinUsuario: function(token, row, valor) {
      return request({
        action: 'marcarSinUsuario',
        token: token,
        row: row,
        valor: valor
      });
    },

    /**
     * Agregar un nuevo docente a la base de datos
     */
    agregarDocente: function(token, apellidos, nombres, dni) {
      return request({
        action: 'agregarDocente',
        token: token,
        apellidos: apellidos,
        nombres: nombres,
        dni: dni
      });
    },

    /**
     * Restablecer los datos locales de prueba en DEMO_MODE
     */
    resetDemoData: function() {
      localStorage.removeItem(DEMO_STORAGE_KEY);
      saveDemoDocentes(DEFAULT_DEMO_DOCENTES);
    }
  };
})();
