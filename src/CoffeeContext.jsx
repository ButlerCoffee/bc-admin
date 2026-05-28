/**
 * CoffeeContext — shared state for the coffee catalog.
 * Provided at the /butlercoffee layout level so the sidebar badge and all
 * coffee sub-routes (list, view, form) can access the same data without
 * prop-drilling or duplicate fetches.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import { apiCall } from './lib/api.js';

// ── Utilities ─────────────────────────────────────────────────────────────────
export function newId() {
  return `bc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
export function toSlug(str = '') {
  return str.toLowerCase()
    .replace(/[àáâãäå]/g,'a').replace(/[èéêë]/g,'e').replace(/[ìíîï]/g,'i')
    .replace(/[òóôõö]/g,'o').replace(/[ùúûü]/g,'u').replace(/ñ/g,'n').replace(/ç/g,'c')
    .replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-');
}

const CoffeeContext = createContext(null);

export function CoffeeProvider({ children }) {
  const [coffees,  setCoffees]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [toasts,   setToasts]   = useState([]);

  function toast(msg, type = 'success') {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }

  async function loadFromSheet(showToast = false) {
    setLoading(true);
    try {
      const data = await apiCall('GET');
      setCoffees(Array.isArray(data) ? data : []);
      if (showToast) toast('Synced from Google Sheet!', 'success');
    } catch (err) {
      toast('Could not connect to Sheet — check API URL.', 'error');
      console.error(err);
    } finally { setLoading(false); }
  }

  async function saveCoffee(coffee) {
    const payload = {
      ...coffee,
      id: coffee.id || newId(),
      slug: coffee.slug || toSlug(coffee.name),
      updatedAt: new Date().toISOString(),
    };
    setLoading(true);
    try {
      const saved = await apiCall('POST', { action: 'save', coffee: payload });
      setCoffees(prev =>
        prev.some(c => c.id === saved.id)
          ? prev.map(c => c.id === saved.id ? saved : c)
          : [saved, ...prev]
      );
      toast('Coffee saved!', 'success');
      return saved;
    } catch (err) {
      toast(`Save failed — ${err.message}`, 'error');
      throw err;
    } finally { setLoading(false); }
  }

  async function deleteCoffee(id) {
    setLoading(true);
    try {
      await apiCall('POST', { action: 'delete', id });
      setCoffees(prev => prev.filter(c => c.id !== id));
      toast('Coffee deleted.', 'error');
    } catch (err) {
      toast(`Delete failed — ${err.message}`, 'error');
      throw err;
    } finally { setLoading(false); }
  }

  async function importCoffees(imported) {
    setLoading(true);
    try {
      await apiCall('POST', { action: 'import', coffees: imported });
      setCoffees(imported);
      toast(`Imported ${imported.length} coffees to Sheet!`, 'success');
    } catch (err) {
      toast(`Import failed — ${err.message}`, 'error');
      throw err;
    } finally { setLoading(false); }
  }

  async function uploadImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async ev => {
        const dataUrl = ev.target.result;
        setLoading(true);
        try {
          const base64 = dataUrl.split(',')[1];
          const result = await apiCall('POST', {
            action: 'uploadImage', filename: file.name, mimeType: file.type, data: base64,
          });
          toast('Image uploaded to Drive!', 'success');
          resolve(result.url);
        } catch (err) {
          toast(`Upload failed — ${err.message}`, 'error');
          reject(err);
        } finally { setLoading(false); }
      };
      reader.readAsDataURL(file);
    });
  }

  useEffect(() => { loadFromSheet(); }, []);

  return (
    <CoffeeContext.Provider value={{
      coffees, loading, toasts,
      loadFromSheet, saveCoffee, deleteCoffee, importCoffees, uploadImage,
      setCoffees,
    }}>
      {children}
      {/* Toast overlay lives here so it renders regardless of which sub-route is active */}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast--${t.type}`}>
            <span className="toast__icon">{t.type === 'success' ? '✓' : '✕'}</span>
            {t.msg}
          </div>
        ))}
      </div>
      {loading && (
        <div className="loading-overlay" style={{ display: 'flex' }}>
          <div className="loading-spinner" />
          <div className="loading-label">Syncing with Google Sheet…</div>
        </div>
      )}
    </CoffeeContext.Provider>
  );
}

export function useCoffee() {
  const ctx = useContext(CoffeeContext);
  if (!ctx) throw new Error('useCoffee must be used inside <CoffeeProvider>');
  return ctx;
}
