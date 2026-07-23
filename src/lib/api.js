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
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

  // Apps Script web apps occasionally return a bare 503 (or the fetch itself
  // fails with a generic "Load failed"/"Failed to fetch") when the service is
  // momentarily overloaded — this happens before the script's own code even
  // runs, so there's nothing to fix server-side. Google's own guidance is to
  // retry with backoff, so we do that here rather than surfacing a scary
  // error to the user for what's usually a one-off blip.
  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 503 || res.status === 429) {
        lastErr = new Error(`Server temporarily unavailable (${res.status})`);
        if (attempt < MAX_ATTEMPTS) { await sleep(attempt * 1000); continue; }
        throw lastErr;
      }
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'API error');
      return json.data;
    } catch (err) {
      lastErr = err;
      // Only retry on network-level failures / 503s, not on a normal
      // application error (json.ok === false) — that's a real error to show.
      const isNetworkFailure = err instanceof TypeError || /temporarily unavailable/.test(err.message);
      if (isNetworkFailure && attempt < MAX_ATTEMPTS) { await sleep(attempt * 1000); continue; }
      throw err;
    }
  }
  throw lastErr;
}
