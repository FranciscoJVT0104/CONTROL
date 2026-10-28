/**
 * auth.js - Manejo de autenticación y sesión de usuario
 * Control de Asistencia de Docentes
 */

const Auth = (function() {
  'use strict';

  const STORAGE_KEY = 'asistencia_docentes_session_v1';

  /**
   * Obtiene la sesión actual desde sessionStorage
   * @returns {{ grupo: string, lugar: string, token: string } | null}
   */
  function getSession() {
    try {
      const data = sessionStorage.getItem(STORAGE_KEY);
      if (!data) return null;
      const parsed = JSON.parse(data);
      if (parsed && parsed.token && parsed.grupo) {
        return parsed;
      }
    } catch (e) {
      console.error('Error al leer sesión:', e);
    }
    return null;
  }

  /**
   * Guarda los datos de la sesión activa
   */
  function setSession(sessionData) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        grupo: sessionData.grupo,
        lugar: sessionData.lugar || '',
        token: sessionData.token,
        loggedAt: new Date().toISOString()
      }));
    } catch (e) {
      console.error('Error al guardar sesión:', e);
    }
  }

  /**
   * Limpia la sesión del almacenamiento
   */
  function clearSession() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Error al limpiar sesión:', e);
    }
  }

  /**
   * Comprueba si el usuario tiene una sesión activa
   */
  function isAuthenticated() {
    return !!getSession();
  }

  /**
   * Intenta iniciar sesión con el backend
   */
  async function login(grupo, password) {
    const cleanGrupo = (grupo || '').trim();
    const cleanPassword = (password || '').trim();

    if (!cleanGrupo) {
      throw new Error('Por favor, ingresa el usuario (grupo).');
    }
    if (!cleanPassword) {
      throw new Error('Por favor, ingresa la contraseña.');
    }

    const response = await Api.login(cleanGrupo, cleanPassword);

    if (!response || !response.ok) {
      throw new Error(response?.error || 'Credenciales incorrectas. Verifique sus datos.');
    }

    setSession({
      grupo: response.grupo,
      lugar: response.lugar,
      token: response.token
    });

    return response;
  }

  /**
   * Cierra la sesión activa
   */
  function logout() {
    clearSession();
  }

  return {
    getSession: getSession,
    isAuthenticated: isAuthenticated,
    login: login,
    logout: logout
  };
})();
