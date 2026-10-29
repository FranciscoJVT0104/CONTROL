/**
 * config.js - Configuración general de la aplicación
 * Control de Asistencia de Docentes
 */

const CONFIG = {
  // Pega aquí la URL de tu aplicación web de Google Apps Script publicada
  // Ejemplo: 'https://script.google.com/macros/s/AKfycbx.../exec'
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzYr_DwDfUtb0G-gJj9qzEilWF6BApkg3p8rFx5OsMm0Q46cOXfJEc1vWek2Qxau2RR/exec',

  // Si DEMO_MODE es true, la aplicación funcionará con datos de prueba locales
  // sin necesidad de conectarse a Google Apps Script. Ideal para pruebas rápidas
  // en GitHub Pages o desarrollo local.
  DEMO_MODE: false,

  // Tiempo límite de espera para las peticiones en milisegundos (15 segundos)
  TIMEOUT_MS: 15000,

  // Intervalo de actualización automática en milisegundos (5 segundos)
  INTERVALO_ACTUALIZACION: 5000,

  // Título y versión de la aplicación
  APP_TITLE: 'Control de Asistencia de Docentes',
  VERSION: '1.0.0'
};

// Detección automática: si la URL no ha sido configurada, activar DEMO_MODE automáticamente
// para permitir probar la interfaz de inmediato.
if (!CONFIG.SCRIPT_URL || CONFIG.SCRIPT_URL === 'TU_APPS_SCRIPT_URL_AQUI') {
  CONFIG.DEMO_MODE = true;
}

// Congelar configuración para prevenir modificaciones accidentales
Object.freeze(CONFIG);
