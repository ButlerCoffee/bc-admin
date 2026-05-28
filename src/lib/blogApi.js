/**
 * blogApi.js — fetches blog posts from the Google Apps Script endpoint.
 *
 * The GAS script reads Google Docs from a "Published" Drive folder,
 * converts them to HTML, and returns them as JSON.
 *
 * Module-level cache (5 min TTL) prevents duplicate fetches when navigating
 * between the index and individual post pages.
 */

const BLOG_API_URL =
  'https://script.google.com/macros/s/AKfycbyh3fLfbx15Sky1LrIJkXEixwtNIl7rk1boRhY7QGnQVS-b5hh2MIHP01ClNKcEtHOSIg/exec';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let _cache     = null;
let _cacheTime = 0;

/**
 * Returns posts sorted newest-first.
 * @returns {Promise<Array<{id, title, slug, updated, content}>>}
 */
export async function getBlogPosts() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;

  const res = await fetch(BLOG_API_URL);
  if (!res.ok) throw new Error(`Blog API error (${res.status})`);

  const data = await res.json();
  const posts = Array.isArray(data) ? data : [];

  _cache = posts.sort((a, b) => new Date(b.updated) - new Date(a.updated));
  _cacheTime = Date.now();
  return _cache;
}

/** Call this to force a fresh fetch (e.g. after adding a new Doc). */
export function invalidateBlogCache() {
  _cache     = null;
  _cacheTime = 0;
}
