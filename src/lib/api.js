/**
 * Set VITE_BUTLER_COFFEE_API_URL in .env.local (dev) or in your Netlify
 * environment variables (production) to the /exec URL from your deployed
 * Google Apps Script (gas/Code.gs).
 *
 * Example .env.local:
 *   VITE_BUTLER_COFFEE_API_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
 */
export const API_URL = import.meta.env.VITE_BUTLER_COFFEE_API_URL || '';

export async function apiCall(method = 'GET', body) {
  if (!API_URL) {
    throw new Error(
      'No API URL configured. Set VITE_BUTLER_COFFEE_API_URL in .env.local ' +
      '(or in Netlify environment variables) to your Apps Script /exec URL.'
    );
  }

  const opts = { method, redirect: 'follow' };
  if (body) {
    // text/plain avoids a CORS preflight — Google Apps Script requires this
    opts.headers = { 'Content-Type': 'text/plain' };
    opts.body = JSON.stringify(body);
  }

  const res  = await fetch(API_URL, opts);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API error');
  return json.data;
}
