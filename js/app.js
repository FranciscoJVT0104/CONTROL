/**
 * app.js - Orquestador principal de la aplicación
 * Control de Asistencia de Docentes
 */

(function() {
  'use strict';

  // Constante configurable de actualización automática (5 segundos)
  const INTERVALO_ACTUALIZACION = (typeof CONFIG !== 'undefined' && CONFIG.INTERVALO_ACTUALIZACION) 
    ? CONFIG.INTERVALO_ACTUALIZACION 
    : 5000;

  // Estado global de la aplicación
  let docentesMaster = [];
  let autoRefreshTimer = null;         // ID del intervalo de actualización automática
  let isAutoRefreshing = false;        // Bandera para evitar peticiones acumuladas
  let isSaving = false;                // true mientras se está guardando un cambio en el servidor
  let currentFilter = 'todos';         // 'todos' | 'asistieron' | 'pendientes' | 'sinUsuario'
  let searchDebounceTimer = null;

  // Referencias a vistas principales
  const views = {
    loginView: document.getElementById('loginView'),
    appView: document.getElementById('appView')
  };

  // Referencias a controles de login
  const forms = {
    loginForm: document.getElementById('loginForm'),
    inputGrupo: document.getElementById('inputGrupo'),
    inputPassword: document.getElementById('inputPassword'),
    btnTogglePassword: document.getElementById('btnTogglePassword'),
    btnLogin: document.getElementById('btnLogin'),
    loginError: document.getElementById('loginError')
  };

  // Referencias a controles principales de la app y modal
  const appControls = {
    btnLogout: document.getElementById('btnLogout'),
    btnRefresh: document.getElementById('btnRefresh'),
    btnOpenAddDocente: document.getElementById('btnOpenAddDocente'),
    modalAddDocente: document.getElementById('modalAddDocente'),
    formAddDocente: document.getElementById('formAddDocente'),
    inputAddApellidos: document.getElementById('inputAddApellidos'),
    inputAddNombres: document.getElementById('inputAddNombres'),
    inputAddDni: document.getElementById('inputAddDni'),
    btnCancelAddDocente: document.getElementById('btnCancelAddDocente'),
    btnCancelAddDocenteCross: document.getElementById('btnCancelAddDocenteCross'),
    btnSaveAddDocente: document.getElementById('btnSaveAddDocente'),
    addDocenteError: document.getElementById('addDocenteError'),
    searchInput: document.getElementById('searchInput'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    demoBanner: document.getElementById('demoBanner')
  };

  /**
   * Inicialización al cargar el documento
   */
  document.addEventListener('DOMContentLoaded', function() {
    initDemoBanner();
    setupEventListeners();
    checkInitialAuth();
  });

  /**
   * Muestra el banner informativo si está en DEMO_MODE
   */
  function initDemoBanner() {
    if (CONFIG.DEMO_MODE && appControls.demoBanner) {
      appControls.demoBanner.style.display = 'block';
    }
  }

  /**
   * Verifica la sesión existente al cargar la página
   */
  function checkInitialAuth() {
    if (Auth.isAuthenticated()) {
      showAppView();
    } else {
      showLoginView();
    }
  }

  /**
   * Configuración de listeners globales
   */
  function setupEventListeners() {
    // Formulario de login
    if (forms.loginForm) {
      forms.loginForm.addEventListener('submit', handleLoginSubmit);
    }

    // Toggle de visibilidad de contraseña
    if (forms.btnTogglePassword) {
      forms.btnTogglePassword.addEventListener('click', togglePasswordVisibility);
    }

    // Cerrar sesión
    if (appControls.btnLogout) {
      appControls.btnLogout.addEventListener('click', handleLogout);
    }

    // Botón refrescar manual
    if (appControls.btnRefresh) {
      appControls.btnRefresh.addEventListener('click', () => {
        loadDocentes(true);
      });
    }

    // Buscador con debounce — escucha 'input' Y 'search' para cubrir:
    // · escritura normal          → 'input'
    // · botón × nativo del browser → 'search'
    // · pegar con mouse            → 'input'
    if (appControls.searchInput) {
      function dispatchSearch() {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(applyFiltersAndRender, 200);
      }
      appControls.searchInput.addEventListener('input',  dispatchSearch);
      appControls.searchInput.addEventListener('search', dispatchSearch);
    }

    // Filtros rápidos
    if (appControls.filterBtns) {
      appControls.filterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
          appControls.filterBtns.forEach(b => b.classList.remove('active'));
          this.classList.add('active');
          currentFilter = this.dataset.filter || 'todos';
          applyFiltersAndRender();
        });
      });
    }

    // Modal Agregar Docente: abrir y cerrar
    if (appControls.btnOpenAddDocente) {
      appControls.btnOpenAddDocente.addEventListener('click', openAddDocenteModal);
    }
    if (appControls.btnCancelAddDocente) {
      appControls.btnCancelAddDocente.addEventListener('click', closeAddDocenteModal);
    }
    if (appControls.btnCancelAddDocenteCross) {
      appControls.btnCancelAddDocenteCross.addEventListener('click', closeAddDocenteModal);
    }

    // En el modal: transformar Apellidos y Nombres a mayúsculas automáticamente
    if (appControls.inputAddApellidos) {
      appControls.inputAddApellidos.addEventListener('input', function() {
        this.value = this.value.toUpperCase();
      });
    }
    if (appControls.inputAddNombres) {
      appControls.inputAddNombres.addEventListener('input', function() {
        this.value = this.value.toUpperCase();
      });
    }

    // En el modal: permitir solo números en DNI y limitar a 8 dígitos
    if (appControls.inputAddDni) {
      appControls.inputAddDni.addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '').slice(0, 8);
      });
    }

    // Envío del formulario de Agregar Docente
    if (appControls.formAddDocente) {
      appControls.formAddDocente.addEventListener('submit', handleAddDocenteSubmit);
    }
  }

  /**
   * Alternar visibilidad del campo contraseña
   */
  function togglePasswordVisibility() {
    const isPassword = forms.inputPassword.type === 'password';
    forms.inputPassword.type = isPassword ? 'text' : 'password';
    forms.btnTogglePassword.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Ver contraseña');
    forms.btnTogglePassword.innerHTML = isPassword 
      ? '<i class="fa-solid fa-eye-slash" aria-hidden="true"></i>' 
      : '<i class="fa-solid fa-eye" aria-hidden="true"></i>';
  }

  /**
   * Procesar formulario de login
   */
  async function handleLoginSubmit(e) {
    e.preventDefault();
    hideLoginError();

    const grupo = forms.inputGrupo.value.trim();
    const password = forms.inputPassword.value.trim();

    if (!grupo || !password) {
      showLoginError('Por favor complete ambos campos.');
      return;
    }

    setLoginLoading(true);

    try {
      const result = await Auth.login(grupo, password);
      setLoginLoading(false);
      UI.showToast(`Bienvenido. Sesión iniciada como ${result.grupo}`, 'success');
      showAppView();
    } catch (err) {
      setLoginLoading(false);
      showLoginError(err.message || 'Error al iniciar sesión.');
      UI.showToast(err.message || 'Error de autenticación', 'error');
    }
  }

  function setLoginLoading(loading) {
    if (forms.btnLogin) {
      forms.btnLogin.disabled = loading;
      forms.btnLogin.innerHTML = loading 
        ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> <span>Iniciando sesión...</span>' 
        : '<span>Iniciar Sesión</span>';
    }
  }

  function showLoginError(msg) {
    if (forms.loginError) {
      forms.loginError.textContent = msg;
      forms.loginError.style.display = 'block';
    }
  }

  function hideLoginError() {
    if (forms.loginError) {
      forms.loginError.textContent = '';
      forms.loginError.style.display = 'none';
    }
  }

  /**
   * Cerrar sesión
   */
  async function handleLogout() {
    const confirm = await UI.showConfirmModal(
      'Cerrar sesión',
      '¿Estás seguro de que deseas salir del sistema?',
      'Cerrar sesión',
      'Continuar aquí'
    );

    if (confirm) {
      stopAutoRefresh();
      Auth.logout();
      docentesMaster = [];
      forms.inputPassword.value = '';
      UI.showToast('Sesión cerrada correctamente', 'info');
      showLoginView();
    }
  }

  /**
   * Mostrar pantalla de login
   */
  function showLoginView() {
    views.loginView.style.display = 'flex';
    views.appView.style.display = 'none';
    stopAutoRefresh();
    if (forms.inputGrupo) forms.inputGrupo.focus();
  }

  /**
   * Mostrar pantalla principal de asistencia e iniciar el polling automático
   */
  function showAppView() {
    views.loginView.style.display = 'none';
    views.appView.style.display = 'block';

    const session = Auth.getSession();
    UI.renderHeaderSession(session);
    loadDocentes();
    startAutoRefresh();
  }

  // ── AUTO-REFRESH CONFIGURABLE (5 SEGUNDOS) ──────────────────────────────────

  /**
   * Inicia el intervalo de actualización silenciosa cada INTERVALO_ACTUALIZACION ms.
   * Evita acumulaciones limpiando el timer previo.
   */
  function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshTimer = setInterval(silentRefresh, INTERVALO_ACTUALIZACION);
  }

  /** Detiene el intervalo de auto-refresh */
  function stopAutoRefresh() {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  }

  /**
   * Recarga silenciosa de datos:
   *  - No lanza una nueva consulta si la anterior sigue en curso (isAutoRefreshing).
   *  - Se omite si hay una operación de guardado en curso (isSaving).
   *  - Fusión inteligente: solo actualiza registros que cambiaron en el servidor.
   */
  async function silentRefresh() {
    if (isSaving || isAutoRefreshing) return;
    if (!Auth.isAuthenticated()) {
      stopAutoRefresh();
      showLoginView();
      return;
    }

    const session = Auth.getSession();
    if (!session) return;

    isAutoRefreshing = true;
    if (appControls.btnRefresh) appControls.btnRefresh.classList.add('pulse');

    try {
      const response = await Api.getDocentes(session.token);

      if (!response.ok) {
        if (response.error && response.error.includes('expirada')) {
          stopAutoRefresh();
          UI.showToast('Sesión expirada. Vuelve a iniciar sesión.', 'warning');
          Auth.logout();
          showLoginView();
        }
        return;
      }

      const nuevos = response.docentes || [];
      let huboCambios = false;

      nuevos.forEach(docNuevo => {
        const idx = docentesMaster.findIndex(d => d.row === docNuevo.row);
        if (idx === -1) {
          docentesMaster.push(docNuevo);
          huboCambios = true;
        } else {
          const docLocal = docentesMaster[idx];
          if (
            docLocal.asistencia  !== docNuevo.asistencia  ||
            docLocal.grupo       !== docNuevo.grupo       ||
            docLocal.observacion !== docNuevo.observacion
          ) {
            docentesMaster[idx] = docNuevo;
            huboCambios = true;
          }
        }
      });

      if (nuevos.length < docentesMaster.length) {
        const rowsNuevos = new Set(nuevos.map(d => d.row));
        const antes = docentesMaster.length;
        docentesMaster = docentesMaster.filter(d => rowsNuevos.has(d.row));
        if (docentesMaster.length !== antes) huboCambios = true;
      }

      if (huboCambios) {
        UI.updateStats(docentesMaster);
        applyFiltersAndRender();
        updateLastUpdatedTime();
      }

    } catch (_) {
      // Ignorar errores en ciclo silencioso para no interrumpir al usuario
    } finally {
      isAutoRefreshing = false;
      if (appControls.btnRefresh) appControls.btnRefresh.classList.remove('pulse');
    }
  }

  /** Actualiza el texto de "Actualizado: HH:mm:ss" */
  function updateLastUpdatedTime() {
    const el = document.getElementById('lastUpdatedTime');
    if (!el) return;
    const ahora = new Date();
    const pad = n => n.toString().padStart(2, '0');
    el.textContent = `Actualizado: ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
  }

  /**
   * Cargar docentes desde el backend (carga inicial o manual con botón Actualizar)
   */
  async function loadDocentes(isManualRefresh = false) {
    const session = Auth.getSession();
    if (!session) {
      showLoginView();
      return;
    }

    if (isManualRefresh && appControls.btnRefresh) {
      appControls.btnRefresh.classList.add('rotating');
    }

    UI.setSkeletonLoading(true);

    try {
      const response = await Api.getDocentes(session.token);

      if (!response.ok) {
        if (response.error && response.error.includes('expirada')) {
          UI.showToast('Tu sesión ha expirado. Por favor ingresa nuevamente.', 'warning');
          stopAutoRefresh();
          Auth.logout();
          showLoginView();
          return;
        }
        throw new Error(response.error || 'Error al obtener la lista de docentes');
      }

      docentesMaster = response.docentes || [];
      UI.updateStats(docentesMaster);
      applyFiltersAndRender();
      updateLastUpdatedTime();

      if (isManualRefresh) {
        UI.showToast('Lista de docentes actualizada', 'success');
      }

    } catch (err) {
      console.error(err);
      UI.showToast(`Error al cargar datos: ${err.message}`, 'error', 6000, () => loadDocentes(true));
    } finally {
      UI.setSkeletonLoading(false);
      if (appControls.btnRefresh) {
        appControls.btnRefresh.classList.remove('rotating');
      }
    }
  }

  // ── MODAL AGREGAR DOCENTE ──────────────────────────────────────────────────

  function openAddDocenteModal() {
    hideAddDocenteError();
    if (appControls.formAddDocente) appControls.formAddDocente.reset();
    if (appControls.modalAddDocente) {
      appControls.modalAddDocente.classList.add('active');
      appControls.modalAddDocente.setAttribute('aria-hidden', 'false');
    }
    if (appControls.inputAddApellidos) appControls.inputAddApellidos.focus();
  }

  function closeAddDocenteModal() {
    if (appControls.modalAddDocente) {
      appControls.modalAddDocente.classList.remove('active');
      appControls.modalAddDocente.setAttribute('aria-hidden', 'true');
    }
    hideAddDocenteError();
  }

  function showAddDocenteError(msg) {
    if (appControls.addDocenteError) {
      appControls.addDocenteError.textContent = msg;
      appControls.addDocenteError.style.display = 'block';
    }
  }

  function hideAddDocenteError() {
    if (appControls.addDocenteError) {
      appControls.addDocenteError.textContent = '';
      appControls.addDocenteError.style.display = 'none';
    }
  }

  function setAddDocenteLoading(loading) {
    if (appControls.btnSaveAddDocente) {
      appControls.btnSaveAddDocente.disabled = loading;
      appControls.btnSaveAddDocente.innerHTML = loading
        ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> <span>Guardando...</span>'
        : '<i class="fa-solid fa-user-plus" aria-hidden="true"></i> <span>Guardar docente</span>';
    }
    if (appControls.btnCancelAddDocente) {
      appControls.btnCancelAddDocente.disabled = loading;
    }
  }

  async function handleAddDocenteSubmit(e) {
    e.preventDefault();
    hideAddDocenteError();

    const session = Auth.getSession();
    if (!session) {
      showLoginView();
      return;
    }

    const apellidos = (appControls.inputAddApellidos ? appControls.inputAddApellidos.value : '').trim().toUpperCase();
    const nombres   = (appControls.inputAddNombres   ? appControls.inputAddNombres.value   : '').trim().toUpperCase();
    const dni       = (appControls.inputAddDni       ? appControls.inputAddDni.value       : '').trim();

    // Validaciones
    if (!apellidos) {
      showAddDocenteError('El campo Apellidos es obligatorio.');
      if (appControls.inputAddApellidos) appControls.inputAddApellidos.focus();
      return;
    }
    if (!nombres) {
      showAddDocenteError('El campo Nombres es obligatorio.');
      if (appControls.inputAddNombres) appControls.inputAddNombres.focus();
      return;
    }
    if (!/^\d{8}$/.test(dni)) {
      showAddDocenteError('El DNI debe contener exactamente 8 dígitos numéricos.');
      if (appControls.inputAddDni) appControls.inputAddDni.focus();
      return;
    }

    // Validar si el DNI ya existe en la lista local cargada
    const existeLocal = docentesMaster.some(d => (d.dni || '').toString().trim() === dni);
    if (existeLocal) {
      showAddDocenteError(`El DNI ${dni} ya se encuentra registrado.`);
      return;
    }

    setAddDocenteLoading(true);
    isSaving = true;

    try {
      const res = await Api.agregarDocente(session.token, apellidos, nombres, dni);

      if (!res.ok) {
        throw new Error(res.error || 'Error al agregar el docente.');
      }

      closeAddDocenteModal();
      UI.showToast('Docente agregado y registrado con asistencia exitosamente.', 'success', 3500);

      if (res.docente) {
        docentesMaster.unshift(res.docente);
        UI.updateStats(docentesMaster);
        applyFiltersAndRender();
        updateLastUpdatedTime();
      } else {
        await loadDocentes(false);
      }

    } catch (err) {
      showAddDocenteError(err.message || 'Error al guardar el docente.');
      UI.showToast(err.message || 'Error al registrar docente', 'error');
    } finally {
      setAddDocenteLoading(false);
      isSaving = false;
    }
  }

  // ── BUSCADOR Y FILTROS ─────────────────────────────────────────────────────

  /**
   * Normaliza texto para búsqueda: sin tildes, acentos, minúsculas y espacios extra colapsados.
   */
  function normalizeText(str) {
    if (!str) return '';
    return str
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Construye el texto de búsqueda unificado de un docente
   */
  function buildSearchIndex(docente) {
    const a = normalizeText(docente.apellidos);
    const n = normalizeText(docente.nombres);
    const d = normalizeText(docente.docente);
    return [a, n, d, a + ' ' + n, n + ' ' + a].filter(Boolean).join(' ');
  }

  /**
   * Aplica filtros de estado y búsqueda de texto libre, luego renderiza.
   */
  function applyFiltersAndRender() {
    const session = Auth.getSession();
    const currentGrupo = session ? session.grupo : '';
    const rawQuery = appControls.searchInput ? appControls.searchInput.value : '';
    const query    = normalizeText(rawQuery);
    const queryWords = query ? query.split(' ').filter(w => w.length > 0) : [];

    const filtered = docentesMaster.filter(docente => {
      const isAsistio    = !!(docente.asistencia && docente.asistencia.trim() !== '');
      const isSinUsuario = !!(docente.observacion && docente.observacion.toLowerCase().includes('crear usuario'));

      if (currentFilter === 'asistieron' && !isAsistio)    return false;
      if (currentFilter === 'pendientes' && isAsistio)     return false;
      if (currentFilter === 'sinUsuario' && !isSinUsuario) return false;

      if (queryWords.length > 0) {
        const idx = buildSearchIndex(docente);
        const allMatch = queryWords.every(word => idx.includes(word));
        if (!allMatch) return false;
      }

      return true;
    });

    UI.updateResultsCounter(filtered.length, docentesMaster.length);

    UI.renderDocentesList(filtered, currentGrupo, {
      onAsistenciaChange: handleAsistenciaChange,
      onSinUsuarioChange: handleSinUsuarioChange
    });
  }

  // ── ACCIONES: ASISTENCIA Y SIN USUARIO ──────────────────────────────────────

  /**
   * Manejador de cambio en el checkbox de Asistencia
   */
  async function handleAsistenciaChange(docente, nuevoValor, inputElement) {
    const session = Auth.getSession();
    if (!session) return;

    // REGLA 5: Mientras "Sin usuario" esté marcado, "Asistió" NO se puede desmarcar
    const isSinUsuario = !!(docente.observacion && docente.observacion.toLowerCase().includes('crear usuario'));
    if (!nuevoValor && isSinUsuario) {
      inputElement.checked = true;
      UI.showToast('No se puede desmarcar la asistencia mientras el docente esté marcado como "Sin usuario".', 'warning', 4000);
      return;
    }

    const yaAsistio = !!(docente.asistencia && docente.asistencia.trim() !== '');
    const marcadoPorOtro = yaAsistio && docente.grupo && docente.grupo.toUpperCase() !== session.grupo.toUpperCase();

    // 1. Confirmación si se desmarca asistencia
    if (!nuevoValor) {
      const confirmDesmarcar = await UI.showConfirmModal(
        'Desmarcar Asistencia',
        `¿Estás seguro de desmarcar la asistencia de ${docente.apellidos}, ${docente.nombres}?`,
        'Desmarcar',
        'Cancelar',
        true
      );
      if (!confirmDesmarcar) {
        inputElement.checked = true;
        return;
      }
    }

    // 2. Confirmación si fue marcado por otro grupo y se intenta re-marcar
    if (nuevoValor && marcadoPorOtro) {
      const confirmSobrescribir = await UI.showConfirmModal(
        'Docente ya registrado',
        `Este docente fue registrado previamente por el "${docente.grupo}". ¿Deseas sobrescribir su asistencia con tu grupo (${session.grupo})?`,
        'Sobrescribir',
        'Cancelar',
        false
      );
      if (!confirmSobrescribir) {
        inputElement.checked = yaAsistio;
        return;
      }
    }

    // 3. Actualización Optimista de la UI
    isSaving = true;
    const anteriorAsistencia = docente.asistencia;
    const anteriorGrupo = docente.grupo;

    if (nuevoValor) {
      const ahora = new Date();
      const pad = (n) => n.toString().padStart(2, '0');
      docente.asistencia = `${pad(ahora.getDate())}/${pad(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
      docente.grupo = session.grupo;
    } else {
      docente.asistencia = '';
      docente.grupo = '';
    }

    UI.updateStats(docentesMaster);
    applyFiltersAndRender();
    UI.showToast(nuevoValor ? 'Guardando asistencia...' : 'Eliminando asistencia...', 'info', 2000);

    // 4. Envío al Backend
    try {
      const res = await Api.marcarAsistencia(session.token, docente.row, nuevoValor);

      if (!res.ok) {
        throw new Error(res.error || 'No se pudo guardar en el servidor');
      }

      docente.asistencia = res.asistencia || '';
      docente.grupo = res.grupo || '';
      UI.updateStats(docentesMaster);
      applyFiltersAndRender();

      UI.showToast(
        nuevoValor ? `Asistencia registrada para ${docente.apellidos}` : 'Asistencia removida',
        'success',
        2500
      );

    } catch (err) {
      console.error(err);
      docente.asistencia = anteriorAsistencia;
      docente.grupo = anteriorGrupo;
      UI.updateStats(docentesMaster);
      applyFiltersAndRender();

      UI.showToast(
        `Error al guardar asistencia: ${err.message}`,
        'error',
        6000,
        () => handleAsistenciaChange(docente, nuevoValor, inputElement),
        'Reintentar'
      );
    } finally {
      isSaving = false;
    }
  }

  /**
   * Manejador de cambio en "Sin usuario" (columna OBSERVACION = 'crear usuario')
   * REGLA 5: Al marcar "Sin usuario", automáticamente "Asistió" queda marcado en la UI y en Drive.
   * Si se desmarca "Sin usuario", "Asistió" permanece intacto.
   */
  async function handleSinUsuarioChange(docente, nuevoValor, buttonElement) {
    const session = Auth.getSession();
    if (!session) return;

    isSaving = true;

    // Guardar estados previos para rollback si falla
    const anteriorObs = docente.observacion;
    const anteriorAsistencia = docente.asistencia;
    const anteriorGrupo = docente.grupo;

    // Actualización optimista
    docente.observacion = nuevoValor ? 'crear usuario' : '';

    // Si se activa "Sin usuario", marcar automáticamente "Asistió" si no lo estaba
    if (nuevoValor && (!docente.asistencia || docente.asistencia.trim() === '')) {
      const ahora = new Date();
      const pad = (n) => n.toString().padStart(2, '0');
      docente.asistencia = `${pad(ahora.getDate())}/${pad(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
      docente.grupo = session.grupo;
    }

    UI.updateStats(docentesMaster);
    applyFiltersAndRender();
    UI.showToast(nuevoValor ? 'Marcando sin usuario y asistencia...' : 'Actualizando observación...', 'info', 2000);

    try {
      const res = await Api.marcarSinUsuario(session.token, docente.row, nuevoValor);

      if (!res.ok) {
        throw new Error(res.error || 'No se pudo guardar la observación');
      }

      docente.observacion = res.observacion || '';
      if (res.asistencia) {
        docente.asistencia = res.asistencia;
        docente.grupo = res.grupo || session.grupo;
      }

      UI.updateStats(docentesMaster);
      applyFiltersAndRender();

      UI.showToast(
        nuevoValor ? `Marcado "Sin usuario" y asistencia para ${docente.apellidos}` : 'Observación eliminada',
        'success',
        2500
      );

    } catch (err) {
      console.error(err);
      docente.observacion = anteriorObs;
      docente.asistencia = anteriorAsistencia;
      docente.grupo = anteriorGrupo;
      UI.updateStats(docentesMaster);
      applyFiltersAndRender();

      UI.showToast(
        `Error al actualizar observación: ${err.message}`,
        'error',
        6000,
        () => handleSinUsuarioChange(docente, nuevoValor, buttonElement),
        'Reintentar'
      );
    } finally {
      isSaving = false;
    }
  }

})();
