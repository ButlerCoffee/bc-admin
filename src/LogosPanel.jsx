/**
 * LogosPanel — the "Trusted by" company logos on the website homepage.
 * Stored in the "Logos" sheet tab; saving triggers a website rebuild.
 *
 * Use white (or light) logos with a transparent background: the band on the
 * website is dark. Each logo has alt text (EN/ES) and an optional link.
 */
import { useEffect, useState } from 'react';
import { apiCall } from './lib/api.js';

// Images stored as "/images/…" live on the website itself
const SITE = 'https://butler2026.netlify.app';

// What the website shows today, offered as a one-click start
const CURRENT_LOGOS = [
  { id: 'shuttlecloud', name: 'ShuttleCloud', image: '/images/logos/shuttlecloud.png',
    alt: { en: 'ShuttleCloud logo', es: 'Logo de ShuttleCloud' }, link: 'https://www.shuttlecloud.com/' },
  { id: 'el-guiri-studios', name: 'El Güiri Studios', image: '/images/logos/el-guiri-studios.png',
    alt: { en: 'El Güiri Studios logo', es: 'Logo de El Güiri Studios' }, link: 'https://elguiristudios.com/' },
  { id: 'emailprefs', name: 'emailprefs', image: '/images/logos/emailprefs.png',
    alt: { en: 'emailprefs logo', es: 'Logo de emailprefs' }, link: '' },
  { id: 'beardface', name: 'Beardface', image: '/images/logos/beardface.png',
    alt: { en: 'Beardface Design Co. logo', es: 'Logo de Beardface Design Co.' }, link: '' },
];

const emptyLogo = order => ({ id: '', originalId: '', name: '', image: '', alt: { en: '', es: '' }, link: '', order, visible: true });

const label = { display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: 4, opacity: 0.8 };
const two = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 };

const slugify = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function preview(url) {
  if (!url) return '';
  if (url.startsWith('/')) return SITE + url;
  const m = String(url).match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w600` : url;
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function Status({ status }) {
  if (!status) return null;
  const err = status.type === 'error';
  return (
    <div role={err ? 'alert' : 'status'} style={{
      margin: '8px 0 16px', padding: '10px 14px', borderRadius: 8, fontSize: '0.9rem',
      background: err ? 'rgba(255,80,80,0.12)' : 'rgba(80,200,120,0.12)', color: err ? '#ff8a80' : '#7ee2a8',
    }}>{status.msg}</div>
  );
}

// Dark tile so white logos are visible, as on the website
const tile = { background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' };

export default function LogosPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState(null);
  const [edit, setEdit] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiCall('GET', undefined, 'logos');
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setStatus({ type: 'error', msg: `Could not load logos: ${err.message}` });
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function importCurrent() {
    setBusy(true); setStatus(null);
    try {
      const data = await apiCall('POST', { action: 'import', logos: CURRENT_LOGOS }, 'logos');
      setItems(data);
      setStatus({ type: 'success', msg: `Loaded ${data.length} logos. Add the missing links, then save.` });
    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    } finally { setBusy(false); }
  }

  const open = l => { setEdit(JSON.parse(JSON.stringify({ ...l, originalId: l.id }))); setStatus(null); setConfirmDelete(false); };
  const update = patch => setEdit(e => ({ ...e, ...patch }));

  async function upload(file) {
    if (!file) return;
    if (!/^image\/(png|svg\+xml|webp)$/.test(file.type)) {
      setStatus({ type: 'error', msg: 'Use a PNG, SVG or WebP with a transparent background (JPG has no transparency).' });
      return;
    }
    setUploading(true); setStatus(null);
    try {
      const data = await readAsBase64(file);
      const result = await apiCall('POST', { action: 'uploadImage', filename: file.name, mimeType: file.type, data }, 'logos');
      update({ image: result.url });
    } catch (err) {
      setStatus({ type: 'error', msg: `Upload failed: ${err.message}` });
    } finally { setUploading(false); }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true); setStatus(null);
    try {
      const logo = { ...edit, id: edit.id || slugify(edit.name) };
      const saved = await apiCall('POST', { action: 'save', logo }, 'logos');
      await load();
      setEdit({ ...saved, originalId: saved.id });
      setStatus({ type: 'success', msg: 'Saved. The website will update in about a minute.' });
    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setStatus(null);
    try {
      await apiCall('POST', { action: 'delete', id: edit.originalId }, 'logos');
      await load();
      setEdit(null);
      setStatus({ type: 'success', msg: 'Logo removed. The website will update in about a minute.' });
    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    } finally { setBusy(false); setConfirmDelete(false); }
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  if (edit) {
    const isNew = !edit.originalId;
    return (
      <div className="form-panel active">
        <div className="form-header">
          <button className="form-header__back" onClick={() => { setEdit(null); setStatus(null); }}>← Back</button>
          <h1 className="form-header__title">{isNew ? 'New logo' : (edit.name || 'Logo')}</h1>
        </div>

        <form onSubmit={save} style={{ maxWidth: 820 }}>
          <div className="card">
            <div className="card__header"><span className="card__icon">🏢</span><span className="card__title">Company</span></div>
            <div className="card__body">
              <div style={two}>
                <div className="field">
                  <label style={label}>Company name</label>
                  <input className="input" value={edit.name} required onChange={e => update({ name: e.target.value })} placeholder="ShuttleCloud" />
                </div>
                <div className="field">
                  <label style={label}>Link (optional)</label>
                  <input className="input" value={edit.link} onChange={e => update({ link: e.target.value.trim() })} placeholder="https://www.example.com/" />
                  <div className="field-hint">Clicking the logo opens this in a new tab. Leave empty for no link.</div>
                </div>
              </div>

              <div className="field">
                <label style={label}>Alt text (describes the logo for screen readers and search engines)</label>
                <div style={two}>
                  {['en', 'es'].map(l => (
                    <div key={l}>
                      <div style={{ fontSize: '0.72rem', opacity: 0.6, marginBottom: 2 }}>{l === 'en' ? 'English' : 'Español'}</div>
                      <input className="input" value={edit.alt?.[l] || ''} onChange={e => update({ alt: { ...edit.alt, [l]: e.target.value } })}
                        placeholder={l === 'en' ? `${edit.name || 'Company'} logo` : `Logo de ${edit.name || 'la empresa'}`} />
                    </div>
                  ))}
                </div>
              </div>

              <div style={two}>
                <div className="field">
                  <label style={label}>Order</label>
                  <input className="input" type="number" value={edit.order || 0} onChange={e => update({ order: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label style={label}>Visibility</label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.9rem' }}>
                    <input type="checkbox" checked={edit.visible !== false} onChange={e => update({ visible: e.target.checked })} />
                    Show on the website
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__header"><span className="card__icon">🖼️</span><span className="card__title">Logo image</span></div>
            <div className="card__body">
              <div style={{ ...tile, height: 110, marginBottom: 12 }}>
                {edit.image
                  ? <img src={preview(edit.image)} alt="" style={{ maxHeight: 54, maxWidth: '70%', objectFit: 'contain' }} />
                  : <span style={{ opacity: 0.5, fontSize: '0.85rem' }}>No image yet</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label className="btn btn--ghost btn--sm" style={{ cursor: 'pointer' }}>
                  {uploading ? 'Uploading…' : 'Upload logo'}
                  <input type="file" accept="image/png,image/svg+xml,image/webp" style={{ display: 'none' }} disabled={uploading}
                    onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                <input className="input" style={{ flex: 1, minWidth: 220 }} value={edit.image} onChange={e => update({ image: e.target.value.trim() })}
                  placeholder="…or paste an image link" />
              </div>
              <div className="field-hint">Use a white logo on a transparent background (PNG or SVG): it sits on a dark band.</div>
            </div>
          </div>

          <Status status={status} />

          <div className="form-actions-row">
            {!isNew && (confirmDelete ? (
              <>
                <span style={{ fontSize: '0.85rem' }}>Remove this logo from the website?</span>
                <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={remove}>Yes, remove</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </>
            ) : (
              <button type="button" className="btn btn--danger btn--sm" onClick={() => setConfirmDelete(true)}>🗑️ Remove</button>
            ))}
            <span style={{ flex: 1 }} />
            <button type="submit" className="btn btn--primary" disabled={busy || uploading}>{busy ? 'Saving…' : 'Save logo'}</button>
          </div>
        </form>
      </div>
    );
  }

  // ── List ──────────────────────────────────────────────────────────────────
  return (
    <div className="form-panel active">
      <div className="form-header">
        <h1 className="form-header__title">Client Logos</h1>
        {!loading && items.length > 0 && (
          <button className="btn btn--primary btn--sm" style={{ marginLeft: 'auto' }} onClick={() => open(emptyLogo(items.length + 1))}>+ New logo</button>
        )}
      </div>
      <p style={{ opacity: 0.7, marginTop: 0, maxWidth: 720 }}>The “Trusted by offices & teams across Spain” logos on the homepage.</p>

      <Status status={status} />

      {loading ? (
        <div style={{ padding: 24, opacity: 0.7 }}>Loading logos…</div>
      ) : items.length === 0 ? (
        <div className="card" style={{ maxWidth: 640 }}>
          <div className="card__body">
            <p style={{ marginTop: 0 }}>The logos aren’t in the database yet. The website shows its built-in four.</p>
            <p>Load them ({CURRENT_LOGOS.map(l => l.name).join(', ')}) with alt text and links, then edit them here.</p>
            <button className="btn btn--primary" disabled={busy} onClick={importCurrent}>{busy ? 'Loading…' : 'Load current logos'}</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 820 }}>
          <div className="card__body" style={{ padding: 0 }}>
            {items.map(l => (
              <button key={l.id} type="button" onClick={() => open(l)} style={{
                display: 'flex', width: '100%', alignItems: 'center', gap: 14, padding: '12px 18px',
                background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)',
                color: 'inherit', textAlign: 'left', cursor: 'pointer', font: 'inherit',
              }}>
                <span style={{ ...tile, width: 120, height: 44, flexShrink: 0 }}>
                  {l.image && <img src={preview(l.image)} alt="" style={{ maxHeight: 26, maxWidth: 100, objectFit: 'contain' }} />}
                </span>
                <span style={{ flex: 1 }}>
                  <strong>{l.name}</strong>
                  <div style={{ fontSize: '0.78rem', opacity: 0.6 }}>
                    {l.link ? l.link : <span style={{ color: '#ffb74d' }}>No link yet</span>} · alt: {l.alt?.en || '—'}
                  </div>
                </span>
                {l.visible === false && <span className="nav-link__badge">hidden</span>}
                <span style={{ opacity: 0.6 }}>Edit →</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
