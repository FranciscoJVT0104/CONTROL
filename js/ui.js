/**
 * ui.js - Renderizado de interfaz, componentes accesibles, modales y toasts
 * Control de Asistencia de Docentes
 */

const UI = (function() {
  'use strict';

  // Referencias a elementos del DOM
  const elements = {
    toastContainer: document.getElementById('toastContainer'),
    modalConfirm: document.getElementById('modalConfirm'),
    modalTitle: document.getElementById('modalTitle'),
    modalMessage: document.getElementById('modalMessage'),
    modalBtnConfirm: document.getElementById('modalBtnConfirm'),
    modalBtnCancel: document.getElementById('modalBtnCancel'),
    tableBody: document.getElementById('docentesTableBody'),
    cardsContainer: document.getElementById('docentesCardsContainer'),
    emptyState: document.getElementById('emptyState'),
    skeletonLoader: document.getElementById('skeletonLoader'),
    statTotal: document.getElementById('statTotal'),
    statPresentes: document.getElementById('statPresentes'),
    statPendientes: document.getElementById('statPendientes'),
    statSinUsuario: document.getElementById('statSinUsuario'),
    resultsCounter: document.getElementById('resultsCounter'),
    headerUserGroup: document.getElementById('headerUserGroup'),
    headerUserLugar: document.getElementById('headerUserLugar')
  };

  /**
   * Muestra un mensaje Toast en la esquina inferior
   */
  function showToast(message, type = 'info', duration = 3500, actionCallback = null, actionLabel = 'Reintentar') {
    if (!elements.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    if (type === 'success') iconSpan.innerHTML = '✓';
    else if (type === 'error') iconSpan.innerHTML = '✕';
    else if (type === 'warning') iconSpan.innerHTML = '⚠';
    else iconSpan.innerHTML = 'ℹ';

    const textSpan = document.createElement('span');
    textSpan.className = 'toast-message';
    textSpan.textContent = message;

    toast.appendChild(iconSpan);
    toast.appendChild(textSpan);

    if (actionCallback && typeof actionCallback === 'function') {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'toast-action-btn';
      actionBtn.textContent = actionLabel;
      actionBtn.onclick = function() {
        actionCallback();
        removeToast();
      };
      toast.appendChild(actionBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close-btn';
    closeBtn.setAttribute('aria-label', 'Cerrar notificación');
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = removeToast;
    toast.appendChild(closeBtn);

    elements.toastContainer.appendChild(toast);

    // Animación de entrada
    requestAnimationFrame(() => {
      toast.classList.add('toast-visible');
    });

    let timer = null;
    if (duration > 0) {
      timer = setTimeout(removeToast, duration);
    }

    function removeToast() {
      if (timer) clearTimeout(timer);
      toast.classList.remove('toast-visible');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }
  }

  /**
   * Muestra un diálogo modal de confirmación accesible
   * Retorna una promesa que resuelve a true (confirmado) o false (cancelado)
   */
  function showConfirmModal(title, message, confirmText = 'Aceptar', cancelText = 'Cancelar', isDanger = false) {
    return new Promise((resolve) => {
      if (!elements.modalConfirm) {
        resolve(window.confirm(message));
        return;
      }

      elements.modalTitle.textContent = title;
      elements.modalMessage.textContent = message;
      elements.modalBtnConfirm.textContent = confirmText;
      elements.modalBtnCancel.textContent = cancelText;

      if (isDanger) {
        elements.modalBtnConfirm.classList.add('btn-danger');
      } else {
        elements.modalBtnConfirm.classList.remove('btn-danger');
      }

      elements.modalConfirm.classList.add('active');
      elements.modalConfirm.setAttribute('aria-hidden', 'false');
      elements.modalBtnConfirm.focus();

      function cleanup(result) {
        elements.modalConfirm.classList.remove('active');
        elements.modalConfirm.setAttribute('aria-hidden', 'true');
        elements.modalBtnConfirm.removeEventListener('click', onConfirm);
        elements.modalBtnCancel.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKeyDown);
        resolve(result);
      }

      function onConfirm() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onKeyDown(e) {
        if (e.key === 'Escape') cleanup(false);
      }

      elements.modalBtnConfirm.addEventListener('click', onConfirm);
      elements.modalBtnCancel.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKeyDown);
    });
  }

  /**
   * Actualiza el resumen numérico superior
   */
  function updateStats(docentesList) {
    const total = docentesList.length;
    let presentes = 0;
    let sinUsuario = 0;

    for (let i = 0; i < total; i++) {
      const d = docentesList[i];
      if (d.asistencia && d.asistencia.trim() !== '') {
        presentes++;
      }
      if (d.observacion && d.observacion.toLowerCase().includes('crear usuario')) {
        sinUsuario++;
      }
    }

    const pendientes = total - presentes;

    if (elements.statTotal) elements.statTotal.textContent = total;
    if (elements.statPresentes) elements.statPresentes.textContent = presentes;
    if (elements.statPendientes) elements.statPendientes.textContent = pendientes;
    if (elements.statSinUsuario) elements.statSinUsuario.textContent = sinUsuario;
  }

  /**
   * Actualiza el contador de resultados de búsqueda
   */
  function updateResultsCounter(showing, total) {
    if (!elements.resultsCounter) return;
    if (showing === total) {
      elements.resultsCounter.textContent = `Mostrando ${total} docentes`;
    } else {
      elements.resultsCounter.textContent = `Mostrando ${showing} de ${total} docentes`;
    }
  }

  /**
   * Actualiza la información de usuario en la cabecera
   */
  function renderHeaderSession(session) {
    if (elements.headerUserGroup) {
      elements.headerUserGroup.textContent = session ? session.grupo : '';
    }
    if (elements.headerUserLugar) {
      elements.headerUserLugar.textContent = session && session.lugar ? session.lugar : 'Sin lugar asignado';
    }
  }

  /**
   * Muestra u oculta los esqueletos de carga (skeleton loader)
   */
  function setSkeletonLoading(isLoading) {
    if (elements.skeletonLoader) {
      elements.skeletonLoader.style.display = isLoading ? 'block' : 'none';
    }
    if (elements.tableBody) {
      elements.tableBody.style.display = isLoading ? 'none' : '';
    }
    if (elements.cardsContainer) {
      elements.cardsContainer.style.display = isLoading ? 'none' : '';
    }
    if (isLoading && elements.emptyState) {
      elements.emptyState.style.display = 'none';
    }
  }

  /**
   * Renderiza la lista de docentes tanto en formato tabla (desktop) como en tarjetas (móvil).
   * Se utiliza createElement y textContent exclusivamente para evitar XSS.
   */
  function renderDocentesList(docentes, currentGrupo, handlers) {
    const tableBody = elements.tableBody;
    const cardsContainer = elements.cardsContainer;
    const emptyState = elements.emptyState;

    if (!tableBody || !cardsContainer) return;

    tableBody.textContent = '';
    cardsContainer.textContent = '';

    if (docentes.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    } else {
      if (emptyState) emptyState.style.display = 'none';
    }

    docentes.forEach((docente) => {
      const isAsistio = !!(docente.asistencia && docente.asistencia.trim() !== '');
      const isSinUsuario = !!(docente.observacion && docente.observacion.toLowerCase().includes('crear usuario'));
      const marcadoPorOtro = isAsistio && docente.grupo && docente.grupo.toUpperCase() !== currentGrupo.toUpperCase();

      // ===================================
      // 1. RENDERIZAR FILA DE TABLA (Desktop)
      // ===================================
      const tr = document.createElement('tr');
      tr.className = `docente-row ${isAsistio ? 'row-asistio' : ''}`;
      tr.dataset.row = docente.row;

      // Columna 1: Apellidos
      const tdApellidos = document.createElement('td');
      tdApellidos.className = 'col-apellidos';
      tdApellidos.textContent = docente.apellidos || '-';
      tr.appendChild(tdApellidos);

      // Columna 2: Nombres
      const tdNombres = document.createElement('td');
      tdNombres.className = 'col-nombres';
      tdNombres.textContent = docente.nombres || '-';
      tr.appendChild(tdNombres);

      // Columna 3: Estado e Insignias
      const tdEstado = document.createElement('td');
      tdEstado.className = 'col-estado';

      if (isAsistio) {
        const badgePresente = document.createElement('span');
        badgePresente.className = 'badge badge-success';
        badgePresente.textContent = `Presente (${docente.asistencia})`;
        tdEstado.appendChild(badgePresente);

        if (marcadoPorOtro) {
          const badgeOtro = document.createElement('span');
          badgeOtro.className = 'badge badge-warning';
          badgeOtro.textContent = `Por: ${docente.grupo}`;
          badgeOtro.title = `Registrado por el grupo: ${docente.grupo}`;
          tdEstado.appendChild(badgeOtro);
        }
      } else {
        const badgePendiente = document.createElement('span');
        badgePendiente.className = 'badge badge-neutral';
        badgePendiente.textContent = 'Pendiente';
        tdEstado.appendChild(badgePendiente);
      }

      if (isSinUsuario) {
        const badgeSinUser = document.createElement('span');
        badgeSinUser.className = 'badge badge-alert';
        badgeSinUser.textContent = 'Sin usuario';
        tdEstado.appendChild(badgeSinUser);
      }

      tr.appendChild(tdEstado);

      // Columna 4: Asistencia (Checkbox táctil grande)
      const tdAsistencia = document.createElement('td');
      tdAsistencia.className = 'col-asistencia text-center';

      const labelCheck = document.createElement('label');
      labelCheck.className = 'custom-checkbox-container';
      labelCheck.setAttribute('aria-label', `Marcar asistencia para ${docente.apellidos} ${docente.nombres}`);

      const inputCheck = document.createElement('input');
      inputCheck.type = 'checkbox';
      inputCheck.className = 'check-asistencia';
      inputCheck.checked = isAsistio;
      inputCheck.dataset.row = docente.row;

      inputCheck.addEventListener('change', function(e) {
        handlers.onAsistenciaChange(docente, inputCheck.checked, inputCheck);
      });

      const checkMark = document.createElement('span');
      checkMark.className = 'custom-checkmark';

      labelCheck.appendChild(inputCheck);
      labelCheck.appendChild(checkMark);
      tdAsistencia.appendChild(labelCheck);
      tr.appendChild(tdAsistencia);

      // Columna 5: Sin Usuario (Botón tipo Toggle accesible)
      const tdSinUser = document.createElement('td');
      tdSinUser.className = 'col-sin-usuario text-center';

      const toggleSinUser = document.createElement('button');
      toggleSinUser.type = 'button';
      toggleSinUser.className = `btn-toggle-sin-usuario ${isSinUsuario ? 'active' : ''}`;
      toggleSinUser.setAttribute('aria-pressed', isSinUsuario ? 'true' : 'false');
      toggleSinUser.setAttribute('aria-label', `Alternar sin usuario para ${docente.apellidos}`);
      toggleSinUser.textContent = isSinUsuario ? 'Sin usuario' : 'Normal';

      toggleSinUser.addEventListener('click', function() {
        const nuevoValor = !isSinUsuario;
        handlers.onSinUsuarioChange(docente, nuevoValor, toggleSinUser);
      });

      tdSinUser.appendChild(toggleSinUser);
      tr.appendChild(tdSinUser);

      tableBody.appendChild(tr);

      // ===================================
      // 2. RENDERIZAR TARJETA (Móvil)
      // ===================================
      const card = document.createElement('article');
      card.className = `docente-card ${isAsistio ? 'card-asistio' : ''}`;
      card.dataset.row = docente.row;

      const cardHeader = document.createElement('div');
      cardHeader.className = 'docente-card-header';

      const cardName = document.createElement('h3');
      cardName.className = 'docente-card-title';
      cardName.textContent = `${docente.apellidos}, ${docente.nombres}`;
      cardHeader.appendChild(cardName);

      card.appendChild(cardHeader);

      // Badges móvil
      const badgesContainer = document.createElement('div');
      badgesContainer.className = 'card-badges';

      if (isAsistio) {
        const bPres = document.createElement('span');
        bPres.className = 'badge badge-success';
        bPres.textContent = `Presente (${docente.asistencia})`;
        badgesContainer.appendChild(bPres);

        if (marcadoPorOtro) {
          const bOtro = document.createElement('span');
          bOtro.className = 'badge badge-warning';
          bOtro.textContent = `Por: ${docente.grupo}`;
          badgesContainer.appendChild(bOtro);
        }
      } else {
        const bPend = document.createElement('span');
        bPend.className = 'badge badge-neutral';
        bPend.textContent = 'Pendiente';
        badgesContainer.appendChild(bPend);
      }

      if (isSinUsuario) {
        const bSin = document.createElement('span');
        bSin.className = 'badge badge-alert';
        bSin.textContent = 'Sin usuario';
        badgesContainer.appendChild(bSin);
      }

      card.appendChild(badgesContainer);

      // Acciones móvil
      const cardActions = document.createElement('div');
      cardActions.className = 'docente-card-actions';

      // Switch Asistencia móvil
      const cardAsistenciaAction = document.createElement('div');
      cardAsistenciaAction.className = 'card-action-item';

      const cardCheckLabel = document.createElement('label');
      cardCheckLabel.className = 'mobile-action-label';

      const cardInputCheck = document.createElement('input');
      cardInputCheck.type = 'checkbox';
      cardInputCheck.className = 'check-asistencia-mobile';
      cardInputCheck.checked = isAsistio;

      cardInputCheck.addEventListener('change', function() {
        handlers.onAsistenciaChange(docente, cardInputCheck.checked, cardInputCheck);
      });

      const cardCheckSpan = document.createElement('span');
      cardCheckSpan.className = 'mobile-toggle-slider';

      const labelText = document.createElement('span');
      labelText.className = 'mobile-label-text';
      labelText.textContent = 'Asistencia';

      cardCheckLabel.appendChild(cardInputCheck);
      cardCheckLabel.appendChild(cardCheckSpan);
      cardCheckLabel.appendChild(labelText);
      cardAsistenciaAction.appendChild(cardCheckLabel);

      // Toggle Sin Usuario móvil
      const cardSinUserAction = document.createElement('div');
      cardSinUserAction.className = 'card-action-item';

      const mobileToggleSinUser = document.createElement('button');
      mobileToggleSinUser.type = 'button';
      mobileToggleSinUser.className = `btn-toggle-sin-usuario ${isSinUsuario ? 'active' : ''}`;
      mobileToggleSinUser.setAttribute('aria-pressed', isSinUsuario ? 'true' : 'false');
      mobileToggleSinUser.textContent = isSinUsuario ? 'Sin usuario' : 'Marcar sin usuario';

      mobileToggleSinUser.addEventListener('click', function() {
        handlers.onSinUsuarioChange(docente, !isSinUsuario, mobileToggleSinUser);
      });

      cardSinUserAction.appendChild(mobileToggleSinUser);

      cardActions.appendChild(cardAsistenciaAction);
      cardActions.appendChild(cardSinUserAction);
      card.appendChild(cardActions);

      cardsContainer.appendChild(card);
    });
  }

  return {
    showToast: showToast,
    showConfirmModal: showConfirmModal,
    updateStats: updateStats,
    updateResultsCounter: updateResultsCounter,
    renderHeaderSession: renderHeaderSession,
    setSkeletonLoading: setSkeletonLoading,
    renderDocentesList: renderDocentesList
  };
})();
