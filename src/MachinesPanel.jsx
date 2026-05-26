/**
 * MachinesPanel — content-only component for the Machines catalogue.
 * Rendered inside App.jsx's sidebar + main layout when panel === 'machines'.
 *
 * Images: upload manually to Drive, paste URL here (same system as Sub Levels).
 * Up to 6 images per machine. Drive folder for images:
 *   https://drive.google.com/drive/folders/1Ek32YHfrAmUryNTp4oz7Sz02tE4Jerz5
 *
 * Columns 11 (Profit) and 12 (Margin) in the Machines sheet are formula cells —
 * the GAS backend never overwrites them; we just read them back for display.
 */
import { useEffect, useState } from 'react';
import { apiCall } from './lib/api.js';

// ── Image helpers ─────────────────────────────────────────────────────────────
const DRIVE_IMG_FALLBACK = '1LYVoFp3Y1jv2i1ow7G7nPxCCQQzLSVZp';
const DEFAULT_IMAGE = `https://drive.google.com/thumbnail?id=${DRIVE_IMG_FALLBACK}&sz=w400`;

function toImageUrl(url) {
  if (!url) return DEFAULT_IMAGE;
  if (url.startsWith('blob:')) return url;
  const m = url.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim()))
    return `https://drive.google.com/thumbnail?id=${url.trim()}&sz=w400`;
  return url;
}

// ── Pricing helpers ───────────────────────────────────────────────────────────
function fmtMoney(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = parseFloat(v);
  return isNaN(n) ? '' : String(Math.round(n * 100) / 100);
}

function calcMargin(cost, price) {
  const c = parseFloat(cost);
  const p = parseFloat(price);
  if (isNaN(c) || isNaN(p) || p <= 0) return null;
  return { marginAmt: p - c, marginPct: (p - c) / p * 100 };
}

function marginClass(pct) {
  return pct >= 50 ? 'margin--good' : pct >= 40 ? 'margin--ok' : 'margin--low';
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderMarkdown(md) {
  if (!md) return '';
  const esc    = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => s
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,         '<em>$1</em>');
  return esc(md).split(/\n\n+/).map(block => {
    const lines = block.split('\n');
    if (lines.length === 1 && /^#{1,3} /.test(lines[0])) {
      const lvl = lines[0].match(/^(#+)/)[1].length;
      return `<h${lvl} class="md-h">${inline(lines[0].replace(/^#+\s+/, ''))}</h${lvl}>`;
    }
    if (lines.some(l => /^[\-\*] /.test(l.trim()))) {
      const items = lines.filter(l => l.trim())
        .map(l => `<li>${inline(l.replace(/^[\-\*] /, ''))}</li>`).join('');
      return `<ul class="md-ul">${items}</ul>`;
    }
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

// ── Data model ────────────────────────────────────────────────────────────────
const emptyMachine = {
  id: '', provider: '', brand: '', name: '', model: '', category: '',
  visible: true, featured: false,
  pvpr: '', cost: '', salePrice: '', profit: '', margin: '', vat: '',
  subtitleEN: '', shortDescEN: '', longDescEN: '',
  feat01EN: '', feat02EN: '', feat03EN: '', feat04EN: '', feat05EN: '', feat06EN: '',
  juraCoffees: '', areas: '', dailyOutput: '', stripeLink: '',
  subtitleES: '', shortDescES: '', longDescES: '',
  feat01ES: '', feat02ES: '', feat03ES: '', feat04ES: '', feat05ES: '', feat06ES: '',
  image1: '', image2: '', image3: '', image4: '', image5: '', image6: '',
  updatedAt: ''
};

const IMAGE_KEYS = ['image1','image2','image3','image4','image5','image6'];

// ── LinkBar ───────────────────────────────────────────────────────────────────
function LinkBar({ link }) {
  const [copied, setCopied] = useState(false);
  if (!link) return null;
  function copy() {
    navigator.clipboard.writeText(link)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, background:'var(--surface-2)', borderRadius:6, padding:'5px 8px', marginBottom:10, marginTop:3 }}>
      <span style={{ color:'var(--muted)', fontSize:'0.72rem', flexShrink:0 }}>🔗</span>
      <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--muted)', fontFamily:'monospace', fontSize:'0.72rem' }}>{link}</span>
      <a href={link} target="_blank" rel="noreferrer" className="btn btn--ghost btn--sm" style={{ fontSize:'0.72rem', padding:'2px 8px', flexShrink:0, lineHeight:1.6 }}>View ↗</a>
      <button type="button" onClick={copy} className="btn btn--ghost btn--sm" style={{ fontSize:'0.72rem', padding:'2px 8px', flexShrink:0, lineHeight:1.6, minWidth:54 }}>
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function Card({ icon, title, children }) {
  return (
    <div className="card">
      <div className="card__header">
        <span className="card__icon">{icon}</span>
        <span className="card__title">{title}</span>
      </div>
      <div className="card__body">{children}</div>
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div className="field">
      <label>{label}{required && <span className="req"> *</span>}</label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

function MarkdownField({ label, value, onChange, placeholder, minHeight = 120 }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="field">
      <div className="md-header">
        <label style={{ margin: 0 }}>{label}</label>
        <div className="md-tabs">
          <button type="button" className={`md-tab${!preview ? ' md-tab--active' : ''}`} onClick={() => setPreview(false)}>Edit</button>
          <button type="button" className={`md-tab${ preview ? ' md-tab--active' : ''}`} onClick={() => setPreview(true)}>Preview</button>
        </div>
      </div>
      {preview
        ? <div className="md-preview" style={{ minHeight }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || '<p class="md-empty">Nothing to preview</p>' }} />
        : <textarea className="textarea-input" style={{ minHeight }}
            value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      }
      <div className="field-hint">**bold** · *italic* · # heading · - list item</div>
    </div>
  );
}

// ── Image Gallery (view mode) ─────────────────────────────────────────────────
function ImageGallery({ machine }) {
  const images = IMAGE_KEYS.map(k => machine[k]).filter(Boolean);
  const [active, setActive] = useState(0);
  if (images.length === 0) return (
    <div className="img-preview__empty" style={{ minHeight:200 }}>
      <div className="img-preview__empty-icon">🖼️</div>
      <span>No images</span>
    </div>
  );
  return (
    <div>
      {/* Hero */}
      <div style={{ borderRadius:8, overflow:'hidden', marginBottom:8, background:'var(--surface-2)', aspectRatio:'4/3', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <img
          src={toImageUrl(images[active])}
          alt={`${machine.name} – image ${active + 1}`}
          style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
          onError={e => { e.currentTarget.style.display='none'; }}
        />
      </div>
      {/* Thumbnails */}
      {images.length > 1 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {images.map((url, i) => (
            <div
              key={i}
              onClick={() => setActive(i)}
              style={{
                width:56, height:56, borderRadius:6, overflow:'hidden', cursor:'pointer',
                border: i === active ? '2px solid var(--accent)' : '2px solid transparent',
                background:'var(--surface-2)', flexShrink:0
              }}
            >
              <img
                src={toImageUrl(url)}
                alt={`thumb ${i+1}`}
                style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                onError={e => { e.currentTarget.style.display='none'; }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Image Grid (form mode) ────────────────────────────────────────────────────
function ImageGrid({ form, updateField }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
      {IMAGE_KEYS.map((key, i) => (
        <div key={key} style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ fontSize:'0.75rem', color:'var(--muted)', fontWeight:600 }}>Image {i+1}{i===0 ? ' (Hero)' : ''}</div>
          {/* Preview */}
          <div style={{ aspectRatio:'4/3', borderRadius:8, overflow:'hidden', background:'var(--surface-2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            {form[key]
              ? <img src={toImageUrl(form[key])} alt={`preview ${i+1}`} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} onError={e => { e.currentTarget.style.display='none'; }} />
              : <span style={{ color:'var(--muted)', fontSize:'0.75rem' }}>Empty</span>
            }
          </div>
          {/* URL Input */}
          <input
            className="input input--mono"
            type="text"
            value={form[key]}
            onChange={e => updateField(key, e.target.value)}
            placeholder="Drive URL or file ID…"
            style={{ fontSize:'0.72rem' }}
          />
          {form[key] && (
            <button type="button" className="btn btn--ghost btn--sm" style={{ fontSize:'0.72rem', padding:'2px 6px' }}
              onClick={() => updateField(key, '')}>✕ Clear</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MachinesPanel() {
  const [machines,  setMachines]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [toasts,    setToasts]    = useState([]);
  const [mode,      setMode]      = useState('list'); // 'list' | 'view' | 'form'
  const [currentId, setCurrentId] = useState(null);
  const [form,      setForm]      = useState(emptyMachine);
  const [search,    setSearch]    = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  function toast(msg, type = 'success') {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }

  async function pullFromSheet(showToast = false) {
    setLoading(true);
    try {
      const data = await apiCall('GET', undefined, 'machines');
      setMachines(Array.isArray(data) ? data : []);
      if (showToast) toast('Synced from Google Sheet!', 'success');
    } catch (err) {
      toast('Could not sync — check API URL.', 'error');
      console.error(err);
    } finally { setLoading(false); }
  }

  async function pushToSheet() {
    if (!window.confirm(`Push all ${machines.length} machine(s) to Google Sheet? This will overwrite all data rows.`)) return;
    setLoading(true);
    try {
      await apiCall('POST', { action: 'import', machines }, 'machines');
      toast(`Pushed ${machines.length} machine(s) to Sheet!`, 'success');
    } catch (err) {
      toast(`Push failed — ${err.message}`, 'error');
    } finally { setLoading(false); }
  }

  useEffect(() => { pullFromSheet(); }, []);

  // Filtered list
  const filtered = machines.filter(m => {
    const q = search.toLowerCase();
    const textMatch = !q || [m.brand, m.name, m.model, m.category].some(v => (v||'').toLowerCase().includes(q));
    return textMatch && (!catFilter || m.category === catFilter);
  });

  // Unique categories for filter
  const categories = [...new Set(machines.map(m => m.category).filter(Boolean))].sort();

  function updateField(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function openView(id) {
    setCurrentId(id);
    setMode('view');
    window.scrollTo(0, 0);
  }

  function openForm(id = null) {
    const machine = id ? machines.find(m => m.id === id) : null;
    setCurrentId(id);
    setForm(machine ? { ...emptyMachine, ...machine } : { ...emptyMachine });
    setMode('form');
    window.scrollTo(0, 0);
  }

  function closeForm() {
    setMode('list');
    setCurrentId(null);
    setForm(emptyMachine);
  }

  async function saveMachine(e) {
    e.preventDefault();
    const machine = { ...form, updatedAt: new Date().toISOString() };
    setLoading(true);
    try {
      const saved = await apiCall('POST', { action: 'save', machine }, 'machines');
      setMachines(prev =>
        prev.some(m => m.id === saved.id)
          ? prev.map(m => m.id === saved.id ? saved : m)
          : [saved, ...prev]
      );
      toast('Machine saved!', 'success');
      closeForm();
    } catch (err) { toast(`Save failed — ${err.message}`, 'error'); }
    finally { setLoading(false); }
  }

  async function deleteCurrent() {
    if (!pendingDeleteId || deleteConfirmText !== 'DELETE') return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    setDeleteConfirmText('');
    setLoading(true);
    try {
      await apiCall('POST', { action: 'delete', id }, 'machines');
      setMachines(prev => prev.filter(m => m.id !== id));
      if (currentId) closeForm();
      toast('Machine deleted.', 'error');
    } catch (err) { toast(`Delete failed — ${err.message}`, 'error'); }
    finally { setLoading(false); }
  }

  const currentMachine = machines.find(m => m.id === currentId);

  return (
    <>
      {/* ── List ──────────────────────────────────────────────────────────────── */}
      {mode === 'list' && (
        <div>
          {/* Toolbar */}
          <div className="toolbar" style={{ marginBottom:16 }}>
            <div className="search-wrap">
              <span className="search-wrap__icon">🔍</span>
              <input className="search-input" type="search" placeholder="Search machines…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="filter-select" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="">All categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="btn btn--ghost btn--sm" onClick={() => pullFromSheet(true)} title="Pull from Sheet">↓ Pull</button>
            <button className="btn btn--ghost btn--sm" onClick={pushToSheet} title="Push to Sheet">↑ Push</button>
            <a
              href="https://drive.google.com/drive/folders/1Ek32YHfrAmUryNTp4oz7Sz02tE4Jerz5"
              target="_blank" rel="noreferrer"
              className="btn btn--ghost btn--sm"
              title="Open image folder in Drive"
            >📂 Images</a>
            <button className="btn btn--primary btn--sm" onClick={() => openForm(null)}>+ Add Machine</button>
          </div>

          {/* Table */}
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th style={{ width:'30%' }}>Machine</th>
                <th>Category</th>
                <th>Model</th>
                <th style={{ textAlign:'right' }}>PVPr</th>
                <th style={{ textAlign:'right' }}>Sale</th>
                <th style={{ width:32 }}>✦</th>
                <th style={{ width:116 }}>Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map(m => {
                  const hero = IMAGE_KEYS.map(k => m[k]).find(Boolean);
                  return (
                    <tr key={m.id} className="tr--clickable" onClick={() => openView(m.id)}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:40, height:40, borderRadius:6, overflow:'hidden', background:'var(--surface-2)', flexShrink:0 }}>
                            {hero
                              ? <img src={toImageUrl(hero)} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} onError={e => { e.currentTarget.style.display='none'; }} />
                              : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem' }}>⚙️</div>
                            }
                          </div>
                          <div>
                            <div className="td-name" style={{ fontWeight:600 }}>{m.brand} {m.name}</div>
                            {m.subtitleEN && <div className="td-sub">{m.subtitleEN}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ color:'var(--muted)', fontSize:'0.8rem' }}>{m.category || '—'}</td>
                      <td style={{ color:'var(--muted)', fontSize:'0.8rem' }}>{m.model || '—'}</td>
                      <td style={{ textAlign:'right', fontFamily:'monospace', fontSize:'0.82rem' }}>
                        {m.pvpr ? `€${parseFloat(m.pvpr).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ textAlign:'right', fontFamily:'monospace', fontSize:'0.82rem', fontWeight:600 }}>
                        {m.salePrice ? `€${parseFloat(m.salePrice).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ textAlign:'center', fontSize:'0.85rem' }}>
                        {m.featured ? '★' : ''}
                        {!m.visible ? <span className="hidden-badge" style={{ marginLeft:2 }}>H</span> : ''}
                      </td>
                      <td>
                        <div className="td-actions" onClick={e => e.stopPropagation()}>
                          <button className="btn btn--ghost btn--sm btn--icon" onClick={() => openView(m.id)} title="View">👁️</button>
                          <button className="btn btn--ghost btn--sm btn--icon" onClick={() => openForm(m.id)} title="Edit">✏️</button>
                          <button className="btn btn--ghost btn--sm btn--icon" style={{ color:'var(--red)' }} onClick={() => setPendingDeleteId(m.id)} title="Delete">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="empty-state">
                <div className="empty-state__icon">⚙️</div>
                <div className="empty-state__title">No machines found</div>
                <div className="empty-state__text">Try adjusting your search or add a new machine.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── View ──────────────────────────────────────────────────────────────── */}
      {mode === 'view' && currentMachine && (
        <div className="view-panel">
          <div className="form-header">
            <button className="form-header__back" onClick={closeForm}>← Back</button>
            <h1 className="form-header__title">{currentMachine.brand} {currentMachine.name}</h1>
            <button className="btn btn--ghost btn--sm" style={{ marginLeft:'auto' }} onClick={() => openForm(currentMachine.id)}>✏️ Edit</button>
          </div>

          {!currentMachine.visible && (
            <div className="visibility-warning">
              <span>⚠️</span>
              <span>This machine is <strong>not visible</strong> on the public website.</span>
            </div>
          )}
          {currentMachine.featured && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--surface-2)', borderRadius:8, marginBottom:16, fontSize:'0.82rem', color:'var(--accent)' }}>
              ★ Featured machine
            </div>
          )}

          <div className="form-grid">

            {/* ── LEFT COLUMN ── */}
            <div>
              <Card icon="⚙️" title="Identity">
                <div className="view-name">{currentMachine.brand} {currentMachine.name}</div>
                {currentMachine.model && <div className="view-slug">Model: {currentMachine.model}</div>}
                {currentMachine.category && <div style={{ marginTop:6, fontSize:'0.82rem', color:'var(--muted)' }}>Category: {currentMachine.category}</div>}
                {currentMachine.provider && <div style={{ marginTop:4, fontSize:'0.82rem', color:'var(--muted)' }}>Provider: {currentMachine.provider}</div>}
              </Card>

              {(currentMachine.subtitleEN || currentMachine.shortDescEN || currentMachine.longDescEN
                || currentMachine.subtitleES || currentMachine.shortDescES || currentMachine.longDescES) && (
                <Card icon="📖" title="Content">
                  {(currentMachine.subtitleEN || currentMachine.shortDescEN || currentMachine.longDescEN) && (
                    <div style={{ marginBottom:16 }}>
                      <div className="view-lang-divider"><span className="view-lang-tag">🇨🇦 English</span></div>
                      {currentMachine.subtitleEN && <div style={{ fontWeight:600, fontSize:'0.95rem', marginBottom:6 }}>{currentMachine.subtitleEN}</div>}
                      {currentMachine.shortDescEN && <div style={{ color:'var(--muted)', fontSize:'0.85rem', marginBottom:8 }}>{currentMachine.shortDescEN}</div>}
                      {currentMachine.longDescEN  && <div className="view-description md-rendered" dangerouslySetInnerHTML={{ __html: renderMarkdown(currentMachine.longDescEN) }} />}
                    </div>
                  )}
                  {(currentMachine.subtitleES || currentMachine.shortDescES || currentMachine.longDescES) && (
                    <div>
                      <div className="view-lang-divider"><span className="view-lang-tag">🇪🇸 Español</span></div>
                      {currentMachine.subtitleES && <div style={{ fontWeight:600, fontSize:'0.95rem', marginBottom:6 }}>{currentMachine.subtitleES}</div>}
                      {currentMachine.shortDescES && <div style={{ color:'var(--muted)', fontSize:'0.85rem', marginBottom:8 }}>{currentMachine.shortDescES}</div>}
                      {currentMachine.longDescES  && <div className="view-description md-rendered" dangerouslySetInnerHTML={{ __html: renderMarkdown(currentMachine.longDescES) }} />}
                    </div>
                  )}
                </Card>
              )}

              {/* Features EN */}
              {[currentMachine.feat01EN,currentMachine.feat02EN,currentMachine.feat03EN,
                currentMachine.feat04EN,currentMachine.feat05EN,currentMachine.feat06EN].some(Boolean) && (
                <Card icon="✅" title="Features (EN)">
                  <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:6 }}>
                    {[currentMachine.feat01EN,currentMachine.feat02EN,currentMachine.feat03EN,
                      currentMachine.feat04EN,currentMachine.feat05EN,currentMachine.feat06EN]
                      .filter(Boolean).map((f, i) => (
                        <li key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', fontSize:'0.85rem' }}>
                          <span style={{ color:'var(--accent)', flexShrink:0 }}>✓</span>
                          <span>{f}</span>
                        </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* Features ES */}
              {[currentMachine.feat01ES,currentMachine.feat02ES,currentMachine.feat03ES,
                currentMachine.feat04ES,currentMachine.feat05ES,currentMachine.feat06ES].some(Boolean) && (
                <Card icon="✅" title="Features (ES)">
                  <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:6 }}>
                    {[currentMachine.feat01ES,currentMachine.feat02ES,currentMachine.feat03ES,
                      currentMachine.feat04ES,currentMachine.feat05ES,currentMachine.feat06ES]
                      .filter(Boolean).map((f, i) => (
                        <li key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', fontSize:'0.85rem' }}>
                          <span style={{ color:'var(--accent)', flexShrink:0 }}>✓</span>
                          <span>{f}</span>
                        </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div>
              {/* Images */}
              <Card icon="🖼️" title="Images">
                <ImageGallery machine={currentMachine} />
              </Card>

              {/* Pricing */}
              <Card icon="💶" title="Pricing">
                <div className="pricing-table">
                  <div className="pricing-table-header">
                    <span>Type</span><span>Cost €</span><span>Sale €</span><span>Profit</span><span>Margin</span>
                  </div>
                  {(() => {
                    const cost   = parseFloat(currentMachine.cost);
                    const sale   = parseFloat(currentMachine.salePrice);
                    const pvpr   = parseFloat(currentMachine.pvpr);
                    const m      = calcMargin(cost, sale);
                    const cls    = m ? marginClass(m.marginPct) : 'margin--none';
                    return (
                      <div className="pricing-row">
                        <span className="pricing-size">Unit</span>
                        <span className="pricing-ro">{!isNaN(cost) ? `€${cost.toFixed(2)}` : '—'}</span>
                        <span className="pricing-ro">{!isNaN(sale) ? `€${sale.toFixed(2)}` : '—'}</span>
                        <span className={`pricing-profit ${cls}`}>{m ? `€${m.marginAmt.toFixed(2)}` : '—'}</span>
                        <span className={`pricing-margin ${cls}`}>{m ? `${m.marginPct.toFixed(1)}%` : '—'}</span>
                      </div>
                    );
                  })()}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:12 }}>
                  {currentMachine.pvpr && (
                    <div className="view-field">
                      <span className="view-field-label">PVPr (RRP)</span>
                      <span className="view-field-value">€{parseFloat(currentMachine.pvpr).toFixed(2)}</span>
                    </div>
                  )}
                  {currentMachine.vat && (
                    <div className="view-field">
                      <span className="view-field-label">VAT</span>
                      <span className="view-field-value">{currentMachine.vat}%</span>
                    </div>
                  )}
                  {currentMachine.profit && (
                    <div className="view-field">
                      <span className="view-field-label">Profit (sheet)</span>
                      <span className="view-field-value">{currentMachine.profit}</span>
                    </div>
                  )}
                  {currentMachine.margin && (
                    <div className="view-field">
                      <span className="view-field-label">Margin (sheet)</span>
                      <span className="view-field-value">{currentMachine.margin}</span>
                    </div>
                  )}
                </div>
              </Card>

              {/* Specs */}
              {(currentMachine.juraCoffees || currentMachine.areas || currentMachine.dailyOutput || currentMachine.stripeLink) && (
                <Card icon="📐" title="Specs">
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                    {currentMachine.juraCoffees && (
                      <div className="view-field">
                        <span className="view-field-label">Jura Coffees</span>
                        <span className="view-field-value">{currentMachine.juraCoffees}</span>
                      </div>
                    )}
                    {currentMachine.areas && (
                      <div className="view-field">
                        <span className="view-field-label">Areas</span>
                        <span className="view-field-value">{currentMachine.areas}</span>
                      </div>
                    )}
                    {currentMachine.dailyOutput && (
                      <div className="view-field">
                        <span className="view-field-label">Daily Output</span>
                        <span className="view-field-value">{currentMachine.dailyOutput}</span>
                      </div>
                    )}
                  </div>
                  {currentMachine.stripeLink && (
                    <div>
                      <div style={{ fontSize:'0.75rem', color:'var(--muted)', fontWeight:600, marginBottom:4 }}>Stripe Link</div>
                      <LinkBar link={currentMachine.stripeLink} />
                    </div>
                  )}
                </Card>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Form ──────────────────────────────────────────────────────────────── */}
      {mode === 'form' && (
        <div id="form-panel" className="form-panel active">
          <div className="form-header">
            <button className="form-header__back" onClick={closeForm}>← Back</button>
            <h1 className="form-header__title">{currentId ? 'Edit Machine' : 'New Machine'}</h1>
          </div>

          <form onSubmit={saveMachine}>
            <div className="form-grid">

              {/* ── LEFT COLUMN ── */}
              <div>
                <Card icon="⚙️" title="Identity">
                  <div className="field-row">
                    <Field label="Brand" required>
                      <input className="input" required value={form.brand} onChange={e => updateField('brand', e.target.value)} placeholder="e.g. Jura" />
                    </Field>
                    <Field label="Model Name" required>
                      <input className="input" required value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="e.g. W8" />
                    </Field>
                  </div>
                  <div className="field-row">
                    <Field label="Model Code">
                      <input className="input" value={form.model} onChange={e => updateField('model', e.target.value)} placeholder="e.g. W8-EA" />
                    </Field>
                    <Field label="Category">
                      <input className="input" value={form.category} onChange={e => updateField('category', e.target.value)} placeholder="e.g. Home, Office, Professional…" />
                    </Field>
                  </div>
                  <Field label="Provider">
                    <input className="input" value={form.provider} onChange={e => updateField('provider', e.target.value)} placeholder="Supplier name…" />
                  </Field>
                  <div style={{ display:'flex', gap:16, marginTop:8 }}>
                    <label className={`visible-toggle${form.visible ? ' visible-toggle--on' : ' visible-toggle--off'}`}>
                      <input type="checkbox" checked={!!form.visible} onChange={e => updateField('visible', e.target.checked)} />
                      <span className="visible-toggle__track" />
                      <span className="visible-toggle__label">{form.visible ? '✓ Visible' : '⚠ Hidden'}</span>
                    </label>
                    <label className={`visible-toggle${form.featured ? ' visible-toggle--on' : ' visible-toggle--off'}`}>
                      <input type="checkbox" checked={!!form.featured} onChange={e => updateField('featured', e.target.checked)} />
                      <span className="visible-toggle__track" />
                      <span className="visible-toggle__label">{form.featured ? '★ Featured' : '☆ Not featured'}</span>
                    </label>
                  </div>
                </Card>

                <Card icon="📖" title="Content (EN) 🇨🇦">
                  <Field label="Subtitle (EN)">
                    <input className="input" value={form.subtitleEN} onChange={e => updateField('subtitleEN', e.target.value)} placeholder="Short tagline…" />
                  </Field>
                  <Field label="Short Description (EN)">
                    <input className="input" value={form.shortDescEN} onChange={e => updateField('shortDescEN', e.target.value)} placeholder="One-liner for cards…" />
                  </Field>
                  <MarkdownField
                    label="Long Description (EN)"
                    value={form.longDescEN}
                    onChange={v => updateField('longDescEN', v)}
                    placeholder="Full product description…"
                  />
                  <div className="field-row" style={{ gap:8 }}>
                    {['feat01EN','feat02EN','feat03EN','feat04EN','feat05EN','feat06EN'].map((k, i) => (
                      <Field key={k} label={`Feature ${i+1} (EN)`}>
                        <input className="input" value={form[k]} onChange={e => updateField(k, e.target.value)} placeholder={`Feature ${i+1}…`} style={{ fontSize:'0.82rem' }} />
                      </Field>
                    ))}
                  </div>
                </Card>

                <Card icon="📖" title="Content (ES) 🇪🇸">
                  <Field label="Subtítulo (ES)">
                    <input className="input" value={form.subtitleES} onChange={e => updateField('subtitleES', e.target.value)} placeholder="Subtítulo corto…" />
                  </Field>
                  <Field label="Descripción corta (ES)">
                    <input className="input" value={form.shortDescES} onChange={e => updateField('shortDescES', e.target.value)} placeholder="Una línea para tarjetas…" />
                  </Field>
                  <MarkdownField
                    label="Descripción larga (ES)"
                    value={form.longDescES}
                    onChange={v => updateField('longDescES', v)}
                    placeholder="Descripción completa del producto…"
                  />
                  <div className="field-row" style={{ gap:8 }}>
                    {['feat01ES','feat02ES','feat03ES','feat04ES','feat05ES','feat06ES'].map((k, i) => (
                      <Field key={k} label={`Característica ${i+1} (ES)`}>
                        <input className="input" value={form[k]} onChange={e => updateField(k, e.target.value)} placeholder={`Característica ${i+1}…`} style={{ fontSize:'0.82rem' }} />
                      </Field>
                    ))}
                  </div>
                </Card>
              </div>

              {/* ── RIGHT COLUMN ── */}
              <div>
                <Card icon="🖼️" title="Images">
                  <div style={{ marginBottom:10, fontSize:'0.8rem', color:'var(--muted)' }}>
                    Upload images to Drive first, then paste the URL or file ID.{' '}
                    <a href="https://drive.google.com/drive/folders/1Ek32YHfrAmUryNTp4oz7Sz02tE4Jerz5"
                      target="_blank" rel="noreferrer" style={{ color:'var(--accent)' }}>
                      📂 Open image folder
                    </a>
                  </div>
                  <ImageGrid form={form} updateField={updateField} />
                </Card>

                <Card icon="💶" title="Pricing">
                  {/* Cost & Sale Price */}
                  <div className="field-row">
                    <Field label="Cost €">
                      <input className="input" type="number" step="0.01" min="0" placeholder="0.00"
                        value={form.cost}
                        onChange={e => updateField('cost', e.target.value)}
                        onBlur={e => updateField('cost', fmtMoney(e.target.value))}
                      />
                    </Field>
                    <Field label="Sale Price €">
                      <input className="input" type="number" step="0.01" min="0" placeholder="0.00"
                        value={form.salePrice}
                        onChange={e => updateField('salePrice', e.target.value)}
                        onBlur={e => updateField('salePrice', fmtMoney(e.target.value))}
                      />
                    </Field>
                  </div>
                  {/* Live margin */}
                  {(() => {
                    const m = calcMargin(form.cost, form.salePrice);
                    if (!m) return null;
                    const cls = marginClass(m.marginPct);
                    return (
                      <div style={{ display:'flex', gap:12, padding:'6px 10px', background:'var(--surface-2)', borderRadius:6, marginBottom:12, fontSize:'0.82rem' }}>
                        <span>Profit: <strong className={cls}>€{m.marginAmt.toFixed(2)}</strong></span>
                        <span>Margin: <strong className={cls}>{m.marginPct.toFixed(1)}%</strong></span>
                      </div>
                    );
                  })()}
                  {/* PVPr & VAT */}
                  <div className="field-row">
                    <Field label="PVPr (RRP) €">
                      <input className="input" type="number" step="0.01" min="0" placeholder="0.00"
                        value={form.pvpr}
                        onChange={e => updateField('pvpr', e.target.value)}
                        onBlur={e => updateField('pvpr', fmtMoney(e.target.value))}
                      />
                    </Field>
                    <Field label="VAT %">
                      <input className="input" type="number" step="0.01" min="0" placeholder="21"
                        value={form.vat}
                        onChange={e => updateField('vat', e.target.value)}
                        onBlur={e => updateField('vat', fmtMoney(e.target.value))}
                      />
                    </Field>
                  </div>
                </Card>

                <Card icon="📐" title="Specs">
                  <div className="field-row">
                    <Field label="Jura Coffees">
                      <input className="input" value={form.juraCoffees} onChange={e => updateField('juraCoffees', e.target.value)} placeholder="e.g. 15" />
                    </Field>
                    <Field label="Areas">
                      <input className="input" value={form.areas} onChange={e => updateField('areas', e.target.value)} placeholder="e.g. Home, Small office" />
                    </Field>
                  </div>
                  <Field label="Daily Output">
                    <input className="input" value={form.dailyOutput} onChange={e => updateField('dailyOutput', e.target.value)} placeholder="e.g. Up to 20 cups" />
                  </Field>
                  <Field label="Stripe Link">
                    <input className="input input--mono" value={form.stripeLink} onChange={e => updateField('stripeLink', e.target.value)} placeholder="https://buy.stripe.com/…" />
                  </Field>
                  {form.stripeLink && <LinkBar link={form.stripeLink} />}
                </Card>
              </div>

            </div>

            {/* ── Actions ── */}
            <div className="form-actions-row">
              {currentId
                ? <button type="button" className="btn btn--danger btn--sm" onClick={() => setPendingDeleteId(currentId)}>🗑️ Delete</button>
                : <div />
              }
              <div style={{ flex:1 }} />
              <button type="button" className="btn btn--ghost btn--sm" onClick={closeForm}>Cancel</button>
              <button type="submit" className="btn btn--primary">Save Machine</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Loading overlay ───────────────────────────────────────────────────── */}
      {loading && (
        <div className="loading-overlay" style={{ display:'flex' }}>
          <div className="loading-spinner" />
          <div className="loading-label">Syncing with Google Sheet…</div>
        </div>
      )}

      {/* ── Toasts ───────────────────────────────────────────────────────────── */}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast--${t.type}`}>
            <span className="toast__icon">{t.type === 'success' ? '✓' : '✕'}</span>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── Delete dialog ────────────────────────────────────────────────────── */}
      {pendingDeleteId && (
        <div className="dialog-overlay open">
          <div className="dialog">
            <div className="dialog__title">Delete this machine?</div>
            <div className="dialog__text">This will permanently remove the entry from the database. This action cannot be undone.</div>
            <div className="dialog__confirm">
              <label className="dialog__confirm-label">Type DELETE to confirm</label>
              <input
                className="input"
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && deleteCurrent()}
              />
            </div>
            <div className="dialog__actions">
              <button className="btn btn--ghost btn--sm" onClick={() => { setPendingDeleteId(null); setDeleteConfirmText(''); }}>Cancel</button>
              <button className="btn btn--danger btn--sm" onClick={deleteCurrent} disabled={deleteConfirmText !== 'DELETE'}>Yes, delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
