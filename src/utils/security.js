/**
 * Security and sanitization utilities
 */

/**
 * Escapes unsafe HTML characters to prevent XSS injection.
 * @param {string|number|null|undefined} value - Input string to sanitize
 * @returns {string} - HTML entity encoded string
 */
export function escapeHTML(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  return str.replace(/[&<>"'/]/g, (match) => map[match] || match);
}

/**
 * Validates and sanitizes URLs to ensure they only use safe protocols (http/https/data)
 * @param {string} url - The URL to validate
 * @param {string} fallback - Fallback URL if invalid
 * @returns {string} Safe URL
 */
export function sanitizeUrl(url, fallback = '') {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (/^(https?:|data:image\/)/i.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}
