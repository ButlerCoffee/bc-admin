/**
 * Set VITE_BUTLER_COFFEE_API_URL in .env.local (dev) or in your Netlify
 * environment variables (production) to the /exec URL from your deployed
 * Google Apps Script (gas/Code.gs).
 *
 * Example .env.local:
 *   VITE_BUTLER_COFFEE_API_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
 */
export const API_URL = import.meta.env.VITE_BUTLER_COFFEE_API_URL || '';

/**
 * Call the Google Apps Script backend.
 *
 * @param {string} method   'GET' or 'POST'
 * @param {object} [body]   POST payload (plain object)
 * @param {string} [sheet]  Optional sheet name; appended as ?sheet=X on GET,
 *                          or merged into the POST body so the GAS router knows
 *                          which sheet to target.
 */
export async function apiCall(method = 'GET', body, sheet) {
  if (!API_URL) {
    throw new Error(
      'No API URL configured. Set VITE_BUTLER_COFFEE_API_URL in .env.local ' +
      '(or in Netlify environment variables) to your Apps Script /exec URL.'
    );
  }

  let url = API_URL;
  if (method === 'GET' && sheet) {
    url = `${API_URL}?sheet=${encodeURIComponent(sheet)}`;
  }

  const opts = { method, redirect: 'follow' };
  if (body) {
    // text/plain avoids a CORS preflight — Google Apps Script requires this
    opts.headers = { 'Content-Type': 'text/plain' };
    const payload = sheet ? { ...body, sheet } : body;
    opts.body = JSON.stringify(payload);
  }

  const res  = await fetch(url, opts);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API error');
  return json.data;
}
