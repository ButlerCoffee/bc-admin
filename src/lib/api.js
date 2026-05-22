export const API_URL = import.meta.env.VITE_BUTLER_COFFEE_API_URL ||
  'https://script.google.com/macros/s/AKfycbyQkvdBvweOs0d8SPfwQeFY1VaWhMJf0qBr6pDg0I9ruslv2NxUTi0wtFQfs0JkDPk-/exec';

export async function apiCall(method = 'GET', body) {
  const opts = { method, redirect: 'follow' };
  if (body) {
    opts.headers = { 'Content-Type': 'text/plain' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(API_URL, opts);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API error');
  return json.data;
}
