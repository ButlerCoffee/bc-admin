/**
 * Simple once-per-day localStorage cache for sheet data.
 *
 * Usage:
 *   import { getCached, setCached, clearCached } from './cache.js';
 *
 *   // On mount — try cache first, fall back to API
 *   const cached = getCached('faq');
 *   if (cached) { setData(cached); } else { fetchFromApi(); }
 *
 *   // After fetching — save to cache
 *   setCached('faq', freshData);
 *
 *   // Pull button — force bypass
 *   clearCached('faq');
 *   fetchFromApi();
 */

const PREFIX = 'butler_cache_';

function today() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

/** Returns cached data if it was saved today, otherwise null. */
export function getCached(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { date, data } = JSON.parse(raw);
    if (date === today()) return data;
  } catch {}
  return null;
}

/** Saves data to cache with today's date. */
export function setCached(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ date: today(), data }));
  } catch {}
}

/** Removes the cache entry so the next load hits the API. */
export function clearCached(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {}
}
