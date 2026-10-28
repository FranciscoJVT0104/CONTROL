/**
 * app.js - Orquestador principal de la aplicación
 * Control de Asistencia de Docentes
 */

(function() {
  'use strict';

  // Estado global de la aplicación
  let docentesMaster = [];
  let currentFilter = 'todos'; // 'todos' | 'asistieron' | 'pendientes' | 'sinUsuario'
  let searchDebounceTimer = null;
  let isSaving = false;

  // Referencias a vistas principales
  const views = {
    loginView: document.getElementById('loginView'),
    appView: document.getElementById('appView')
  };

  // Referencias a controles
  const forms = {
    loginForm: document.getElementById('loginForm'),
    inputGrupo: document.getElementById('inputGrupo'),
    inputPassword: document.getElementById('inputPassword'),
    btnTogglePassword: document.getElementById('btnTogglePassword'),
    btnLogin: document.getElementById('btnLogin'),
    loginError: document.getElementById('loginError')
  };

  const appControls = {
    btnLogout: document.getElementById('btnLogout'),
    btnRefresh: document.getElementById('btnRefresh'),
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

    // Botón refrescar
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
      appControls.searchInput.addEventListener('search', dispatchSearch); // × nativa
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
  }

  /**
   * Alternar visibilidad del campo contraseña
   */
  function togglePasswordVisibility() {
    const isPassword = forms.inputPassword.type === 'password';
    forms.inputPassword.type = isPassword ? 'text' : 'password';
    forms.btnTogglePassword.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Ver contraseña');
    forms.btnTogglePassword.innerHTML = isPassword 
      ? '<span class="icon-eye-off">🙈</span>' 
      : '<span class="icon-eye">👁️</span>';
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
      UI.showToast(`¡Bienvenido! Sesión iniciada como ${result.grupo}`, 'success');
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
      forms.btnLogin.textContent = loading ? 'Iniciando sesión...' : 'Iniciar Sesión';
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
    if (forms.inputGrupo) forms.inputGrupo.focus();
  }

  /**
   * Mostrar pantalla principal de asistencia
   */
  function showAppView() {
    views.loginView.style.display = 'none';
    views.appView.style.display = 'block';

    const session = Auth.getSession();
    UI.renderHeaderSession(session);
    loadDocentes();
  }

  /**
   * Cargar docentes desde el backend
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
          Auth.logout();
          showLoginView();
          return;
        }
        throw new Error(response.error || 'Error al obtener la lista de docentes');
      }

      docentesMaster = response.docentes || [];
      UI.updateStats(docentesMaster);
      applyFiltersAndRender();

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

  /**
   * Normaliza texto para búsqueda: sin tildes, acentos, minúsculas y espacios extra colapsados.
   */
  function normalizeText(str) {
    if (!str) return '';
    return str
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // quitar diacríticos/tildes
      .toLowerCase()
      .replace(/\s+/g, ' ')            // colapsar múltiples espacios en uno
      .trim();
  }

  /**
   * Construye el texto de búsqueda unificado de un docente:
   * concatena todos los campos en una sola cadena normalizada
   * para que cualquier término (o combinación) encuentre coincidencia
   * sin importar el orden ni el campo de origen.
   *
   * Ejemplo: apellidos="ROCA FLORES" nombres="RICARDO"
   *   → "roca flores ricardo roca flores roca flores ricardo"
   *      (apellidos | nombres | docente | AP+NOM | NOM+AP)
   */
  function buildSearchIndex(docente) {
    const a = normalizeText(docente.apellidos);
    const n = normalizeText(docente.nombres);
    const d = normalizeText(docente.docente);
    // Incluir combinaciones para búsquedas mixtas tipo "ROCA RICARDO" o "FLORES MARIA"
    return [a, n, d, a + ' ' + n, n + ' ' + a].filter(Boolean).join(' ');
  }

  /**
   * Aplica filtros de estado y búsqueda de texto libre, luego renderiza.
   *
   * Estrategia de búsqueda:
   *  - Se construye un índice de búsqueda por docente (buildSearchIndex).
   *  - La query se divide en palabras; CADA palabra debe aparecer en el índice
   *    (AND entre palabras). Esto permite "ROCA FLORES" encontrar "ROCA FLORES RICARDO"
   *    aunque el usuario escriba palabras de distintos campos.
   *  - La búsqueda es insensible a tildes, mayúsculas y espacios extra.
   */
  function applyFiltersAndRender() {
    const session = Auth.getSession();
    const currentGrupo = session ? session.grupo : '';
    const rawQuery = appControls.searchInput ? appControls.searchInput.value : '';
    const query    = normalizeText(rawQuery);

    // Dividir query en palabras individuales para soporte AND entre términos
    // Ejemplo: "ROCA FLORES" → ["roca", "flores"]
    const queryWords = query ? query.split(' ').filter(w => w.length > 0) : [];

    const filtered = docentesMaster.filter(docente => {
      // 1. Filtro rápido por estado
      const isAsistio    = !!(docente.asistencia && docente.asistencia.trim() !== '');
      const isSinUsuario = !!(docente.observacion && docente.observacion.toLowerCase().includes('crear usuario'));

      if (currentFilter === 'asistieron' && !isAsistio)    return false;
      if (currentFilter === 'pendientes' && isAsistio)     return false;
      if (currentFilter === 'sinUsuario' && !isSinUsuario) return false;

      // 2. Filtro de texto libre (solo si hay algo escrito)
      if (queryWords.length > 0) {
        const idx = buildSearchIndex(docente);
        // Todas las palabras de la query deben estar presentes (AND)
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

  /**
   * Manejador de cambio en el checkbox de Asistencia
   */
  async function handleAsistenciaChange(docente, nuevoValor, inputElement) {
    const session = Auth.getSession();
    if (!session) return;

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

    // 2. Confirmación si fue marcado por otro grupo y se intenta re-marcar o alterar
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

      // Sincronizar con el valor devuelto por el servidor
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
      // Reversión por error
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
    }
  }

  /**
   * Manejador de cambio en "Sin usuario" (columna OBSERVACION = 'crear usuario')
   */
  async function handleSinUsuarioChange(docente, nuevoValor, buttonElement) {
    const session = Auth.getSession();
    if (!session) return;

    // Actualización optimista
    const anteriorObs = docente.observacion;
    docente.observacion = nuevoValor ? 'crear usuario' : '';

    UI.updateStats(docentesMaster);
    applyFiltersAndRender();
    UI.showToast(nuevoValor ? 'Marcando para crear usuario...' : 'Actualizando observación...', 'info', 2000);

    try {
      const res = await Api.marcarSinUsuario(session.token, docente.row, nuevoValor);

      if (!res.ok) {
        throw new Error(res.error || 'No se pudo guardar la observación');
      }

      docente.observacion = res.observacion || '';
      UI.updateStats(docentesMaster);
      applyFiltersAndRender();

      UI.showToast(
        nuevoValor ? `Marcado "Sin usuario" para ${docente.apellidos}` : 'Observación eliminada',
        'success',
        2500
      );

    } catch (err) {
      console.error(err);
      docente.observacion = anteriorObs;
      UI.updateStats(docentesMaster);
      applyFiltersAndRender();

      UI.showToast(
        `Error al actualizar observación: ${err.message}`,
        'error',
        6000,
        () => handleSinUsuarioChange(docente, nuevoValor, buttonElement),
        'Reintentar'
      );
    }
  }

})();
