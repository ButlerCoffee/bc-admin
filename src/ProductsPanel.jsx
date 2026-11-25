/**
 * ProductsPanel — Store products for the website (special coffees like a
 * Christmas edition, and goods). Stored in the "Products" sheet tab; saving
 * triggers a website rebuild (auto-publish).
 *
 * The website checkout charges the price saved here (VAT included), so a
 * product is buyable as soon as it is visible — no Stripe setup needed.
 * Machines are managed in their own panel.
 */
import { useEffect, useState } from 'react';
import { apiCall } from './lib/api.js';

const CATEGORIES = [
  { id: 'coffee', label: 'Coffee — shown in Store → Coffee (e.g. Pack Navidad)' },
  { id: 'goods',  label: 'Goods — the Goods page appears once one is visible' },
];

const emptyProduct = order => ({
  slug: '', originalSlug: '', category: 'coffee', order, visible: false, soldOut: false,
  name: { en: '', es: '' }, tagline: { en: '', es: '' }, description: { en: '', es: '' },
  badge: { en: '', es: '' }, price: '', cost: '', size: '', grind: true, images: [],
});

const label = { display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: 4, opacity: 0.8 };
const two = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 };

function Bilingual({ title, value, onChange, multiline, rows = 4, hint }) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div className="field">
      <label style={label}>{title}</label>
      <div style={two}>
        {['en', 'es'].map(l => (
          <div key={l}>
            <div style={{ fontSize: '0.72rem', opacity: 0.6, marginBottom: 2 }}>{l === 'en' ? 'English' : 'Español'}</div>
            <Tag
              className={multiline ? 'textarea-input' : 'input'}
              rows={multiline ? rows : undefined}
              style={multiline ? { minHeight: rows * 22 } : undefined}
              value={value?.[l] || ''}
              onChange={e => onChange({ ...value, [l]: e.target.value })}
            />
          </div>
        ))}
      </div>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
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

// Resize to max 1400px JPEG before upload (keeps Drive + page weight small)
function compressImage(file, maxPx = 1400, quality = 0.84) {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = blobUrl;
  });
}

// Drive share link / id → thumbnail URL the browser can show
function previewUrl(url) {
  const m = String(url || '').match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400` : url;
}

const slugify = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export default function ProductsPanel() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus]   = useState(null);
  const [edit, setEdit]       = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await apiCall('GET', undefined, 'products');
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setStatus({ type: 'error', msg: `Could not load products: ${err.message}` });
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function open(p) {
    setEdit(JSON.parse(JSON.stringify({ ...p, originalSlug: p.slug })));
    setStatus(null); setConfirmDelete(false); setNewImageUrl('');
  }
  const update = patch => setEdit(e => ({ ...e, ...patch }));

  async function upload(file) {
    if (!file) return;
    setUploading(true); setStatus(null);
    try {
      const data = await compressImage(file);
      const result = await apiCall('POST', {
        action: 'uploadImage', filename: file.name.replace(/\.[^.]+$/, '') + '.jpg', mimeType: 'image/jpeg', data,
      }, 'products');
      setEdit(e => ({ ...e, images: [...(e.images || []), result.url].slice(0, 6) }));
    } catch (err) {
      setStatus({ type: 'error', msg: `Upload failed: ${err.message}` });
    } finally { setUploading(false); }
  }

  function moveImage(i, dir) {
    setEdit(e => {
      const a = [...e.images]; const j = i + dir;
      if (j < 0 || j >= a.length) return e;
      [a[i], a[j]] = [a[j], a[i]];
      return { ...e, images: a };
    });
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true); setStatus(null);
    try {
      const saved = await apiCall('POST', { action: 'save', product: { ...edit, slug: edit.slug || slugify(edit.name?.en) } }, 'products');
      await load();
      setEdit({ ...saved, originalSlug: saved.slug });
      setStatus({ type: 'success', msg: saved.visible
        ? 'Saved. It will be in the Store in about a minute.'
        : 'Saved (hidden). Tick “Show in the Store” when it’s ready.' });
    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setStatus(null);
    try {
      await apiCall('POST', { action: 'delete', slug: edit.originalSlug }, 'products');
      await load();
      setEdit(null);
      setStatus({ type: 'success', msg: 'Product deleted. The website will update in about a minute.' });
    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    } finally { setBusy(false); setConfirmDelete(false); }
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  if (edit) {
    const isNew = !edit.originalSlug;
    const margin = Number(edit.price) > 0 && edit.cost !== '' ? Number(edit.price) / 1.1 - Number(edit.cost) : null;
    return (
      <div className="form-panel active">
        <div className="form-header">
          <button className="form-header__back" onClick={() => { setEdit(null); setStatus(null); }}>← Back</button>
          <h1 className="form-header__title">{isNew ? 'New product' : (edit.name?.en || 'Product')}</h1>
        </div>

        <form onSubmit={save} style={{ maxWidth: 980 }}>
          <div className="card">
            <div className="card__header"><span className="card__icon">🛍️</span><span className="card__title">Product</span></div>
            <div className="card__body">
              <Bilingual title="Name" value={edit.name} onChange={v => update({ name: v })} />
              <Bilingual title="Short line (under the name)" value={edit.tagline} onChange={v => update({ tagline: v })}
                hint="e.g. “Limited Christmas roast — notes of orange and cinnamon”" />
              <Bilingual title="Description" value={edit.description} onChange={v => update({ description: v })} multiline rows={6}
                hint="**bold**, *italic* and - bullet lists work." />
              <Bilingual title="Badge (optional)" value={edit.badge} onChange={v => update({ badge: v })}
                hint="Small label on the card, e.g. “Limited edition” / “Edición limitada”." />
            </div>
          </div>

          <div className="card">
            <div className="card__header"><span className="card__icon">€</span><span className="card__title">Price & options</span></div>
            <div className="card__body">
              <div style={two}>
                <div className="field">
                  <label style={label}>Category</label>
                  <select className="input" value={edit.category} onChange={e => update({ category: e.target.value, grind: e.target.value === 'coffee' })}>
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label style={label}>Price € (VAT included)</label>
                  <input className="input" type="number" step="0.01" min="0" value={edit.price} onChange={e => update({ price: e.target.value })} placeholder="24.00" required />
                  <div className="field-hint">This is exactly what customers pay. Shipping: €5, free from €30.</div>
                </div>
                <div className="field">
                  <label style={label}>Cost € (private)</label>
                  <input className="input" type="number" step="0.01" min="0" value={edit.cost} onChange={e => update({ cost: e.target.value })} placeholder="optional" />
                  {margin != null && <div className="field-hint">≈ €{margin.toFixed(2)} profit per unit at 10% VAT (check the rate for goods).</div>}
                </div>
                <div className="field">
                  <label style={label}>Size / weight (optional)</label>
                  <input className="input" value={edit.size} onChange={e => update({ size: e.target.value })} placeholder="250g" />
                </div>
              </div>
              <div style={{ ...two, marginTop: 8 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={!!edit.grind} onChange={e => update({ grind: e.target.checked })} />
                  Customer chooses a grind
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={!!edit.soldOut} onChange={e => update({ soldOut: e.target.checked })} />
                  Sold out (shown, can’t be bought)
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={!!edit.visible} onChange={e => update({ visible: e.target.checked })} />
                  Show in the Store
                </label>
              </div>
              <div style={{ ...two, marginTop: 8 }}>
                <div className="field">
                  <label style={label}>Page address</label>
                  <input className="input" value={edit.slug} placeholder={slugify(edit.name?.en) || 'christmas-blend'}
                    onChange={e => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
                  <div className="field-hint">/store/product/{edit.slug || slugify(edit.name?.en) || '…'}{!isNew && ' — changing it breaks old links.'}</div>
                </div>
                <div className="field">
                  <label style={label}>Order in the Store</label>
                  <input className="input" type="number" value={edit.order || 0} onChange={e => update({ order: Number(e.target.value) })} />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__header"><span className="card__icon">📷</span><span className="card__title">Photos ({(edit.images || []).length}/6)</span></div>
            <div className="card__body">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                {(edit.images || []).map((url, i) => (
                  <div key={url + i} style={{ width: 120 }}>
                    <img src={previewUrl(url)} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, background: '#222' }} />
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button type="button" className="btn btn--ghost btn--sm" disabled={i === 0} onClick={() => moveImage(i, -1)}>←</button>
                      <button type="button" className="btn btn--ghost btn--sm" disabled={i === edit.images.length - 1} onClick={() => moveImage(i, 1)}>→</button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => update({ images: edit.images.filter((_, k) => k !== i) })}>✕</button>
                    </div>
                    {i === 0 && <div className="field-hint">Main photo</div>}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label className="btn btn--ghost btn--sm" style={{ cursor: 'pointer' }}>
                  {uploading ? 'Uploading…' : 'Upload photo'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploading || (edit.images || []).length >= 6}
                    onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                <input className="input" style={{ flex: 1, minWidth: 220 }} value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)}
                  placeholder="…or paste an image / Google Drive link" />
                <button type="button" className="btn btn--ghost btn--sm" disabled={!newImageUrl.trim()}
                  onClick={() => { update({ images: [...(edit.images || []), newImageUrl.trim()].slice(0, 6) }); setNewImageUrl(''); }}>Add</button>
              </div>
            </div>
          </div>

          <Status status={status} />

          <div className="form-actions-row">
            {!isNew && (confirmDelete ? (
              <>
                <span style={{ fontSize: '0.85rem' }}>Delete this product?</span>
                <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={remove}>Yes, delete</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </>
            ) : (
              <button type="button" className="btn btn--danger btn--sm" onClick={() => setConfirmDelete(true)}>🗑️ Delete</button>
            ))}
            <span style={{ flex: 1 }} />
            <button type="submit" className="btn btn--primary" disabled={busy || uploading}>{busy ? 'Saving…' : 'Save product'}</button>
          </div>
        </form>
      </div>
    );
  }

  // ── List ──────────────────────────────────────────────────────────────────
  return (
    <div className="form-panel active">
      <div className="form-header">
        <h1 className="form-header__title">Store Products</h1>
        <button className="btn btn--primary btn--sm" style={{ marginLeft: 'auto' }}
          onClick={() => open({ ...emptyProduct(items.length + 1), originalSlug: '' })}>+ New product</button>
      </div>
      <p style={{ opacity: 0.7, marginTop: 0, maxWidth: 720 }}>
        Coffee products (like Pack Navidad) and goods for the website Store. Coffee tiers and machines are managed in their own sections.
      </p>

      <Status status={status} />

      {loading ? (
        <div style={{ padding: 24, opacity: 0.7 }}>Loading products…</div>
      ) : items.length === 0 ? (
        <div className="card" style={{ maxWidth: 640 }}>
          <div className="card__body">No products yet. Click “+ New product” to add your first one.</div>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 900 }}>
          <div className="card__body" style={{ padding: 0 }}>
            {items.map(p => (
              <button key={p.slug} type="button" onClick={() => open(p)} style={{
                display: 'flex', width: '100%', alignItems: 'center', gap: 12, padding: '12px 18px',
                background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)',
                color: 'inherit', textAlign: 'left', cursor: 'pointer', font: 'inherit',
              }}>
                {p.images?.[0]
                  ? <img src={previewUrl(p.images[0])} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} />
                  : <span style={{ width: 44, height: 44, borderRadius: 6, background: '#222', display: 'inline-block' }} />}
                <span style={{ flex: 1 }}>
                  <strong>{p.name.en}</strong>
                  <span style={{ opacity: 0.6 }}> · €{Number(p.price).toFixed(2)}</span>
                  <div style={{ fontSize: '0.78rem', opacity: 0.55 }}>{p.category} · /store/product/{p.slug}</div>
                </span>
                {p.soldOut && <span className="nav-link__badge">sold out</span>}
                {!p.visible && <span className="nav-link__badge">hidden</span>}
                <span style={{ opacity: 0.6 }}>Edit →</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
