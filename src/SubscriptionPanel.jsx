import { useEffect, useMemo, useState } from 'react';
import { apiCall } from './lib/api.js';
import { useAuth } from './AuthContext.jsx';

// ── Image helpers (same as Coffee panel) ──────────────────────────────────────
const DRIVE_IMG_FALLBACK = '1LYVoFp3Y1jv2i1ow7G7nPxCCQQzLSVZp';
const DEFAULT_IMAGE = `https://drive.google.com/thumbnail?id=${DRIVE_IMG_FALLBACK}&sz=w400`;

function toImageUrl(url) {
  if (!url) return DEFAULT_IMAGE;
  const m = url.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim()))
    return `https://drive.google.com/thumbnail?id=${url.trim()}&sz=w400`;
  return url;
}

// ── Data model ────────────────────────────────────────────────────────────────
const emptySub = {
  id: '',
  title: '',
  eyebrowEN: '', shortDescEN: '', longDescEN: '',
  feat01EN: '', feat02EN: '', feat03EN: '', feat04EN: '',
  compositionEN: '', flavorEN: '', structureEN: '', purposeEN: '',
  eyebrowES: '', shortDescES: '', longDescES: '',
  feat01ES: '', feat02ES: '', feat03ES: '', feat04ES: '',
  compositionES: '', flavorES: '', structureES: '', purposeES: '',
  price250g: '', price500g: '', price1kg: '',
  link250g: '', link500g: '', link1kg: '',
  image: '',
  updatedAt: ''
};

const SIZES = [
  { key: '250g', label: '250 g' },
  { key: '500g', label: '500 g' },
  { key: '1kg',  label: '1 kg'  },
];

// ── Utilities ─────────────────────────────────────────────────────────────────
function renderMarkdown(md) {
  if (!md) return '';
  const esc    = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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

// ── Main panel ────────────────────────────────────────────────────────────────
export default function SubscriptionPanel({ onBackToHub }) {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [toasts, setToasts]     = useState([]);
  const [panel, setPanel]       = useState('list');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [form, setForm]         = useState(emptySub);
  const [search, setSearch]     = useState('');
  const [pendingDeleteId, setPendingDeleteId]     = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const { logout } = useAuth();
  const sc = sidebarCollapsed;

  function toast(msg, type = 'success') {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }

  async function loadFromSheet(showToast = false) {
    setLoading(true);
    try {
      const data = await apiCall('GET', undefined, 'subs');
      setSubs(Array.isArray(data) ? data : []);
      if (showToast) toast('Synced from Google Sheet!', 'success');
    } catch (err) {
      toast('Could not sync — check API URL.', 'error');
      console.error(err);
    } finally { setLoading(false); }
  }
  useEffect(() => { loadFromSheet(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return !q ? subs : subs.filter(s =>
      [s.title, s.eyebrowEN, s.shortDescEN].some(v => (v||'').toLowerCase().includes(q))
    );
  }, [subs, search]);

  function updateField(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function openView(id) { setCurrentId(id); setPanel('view'); window.scrollTo(0,0); }
  function openForm(id = null) {
    const sub = id ? subs.find(s => s.id === id) : null;
    setCurrentId(id);
    setForm(sub ? { ...emptySub, ...sub } : emptySub);
    setPanel('form');
    window.scrollTo(0,0);
  }
  function closeForm() { setPanel('list'); setCurrentId(null); setForm(emptySub); }

  async function saveSub(e) {
    e.preventDefault();
    const sub = { ...form, updatedAt: new Date().toISOString() };
    if (!sub.id) sub.id = `sub_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    setLoading(true);
    try {
      const saved = await apiCall('POST', { action: 'save', subscription: sub }, 'subs');
      setSubs(prev => prev.some(s => s.id === saved.id)
        ? prev.map(s => s.id === saved.id ? saved : s)
        : [saved, ...prev]);
      toast('Subscription saved!', 'success');
      closeForm();
    } catch (err) { toast(`Save failed — ${err.message}`, 'error'); }
    finally { setLoading(false); }
  }

  async function deleteCurrent() {
    if (!pendingDeleteId || deleteConfirmText !== 'DELETE') return;
    const id = pendingDeleteId;
    setPendingDeleteId(null); setDeleteConfirmText('');
    setLoading(true);
    try {
      await apiCall('POST', { action: 'delete', id }, 'subs');
      setSubs(prev => prev.filter(s => s.id !== id));
      if (currentId) closeForm();
      toast('Subscription deleted.', 'error');
    } catch (err) { toast(`Delete failed — ${err.message}`, 'error'); }
    finally { setLoading(false); }
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = async ev => {
      const dataUrl = ev.target.result;
      setForm(f => ({ ...f, image: dataUrl }));
      setLoading(true);
      try {
        const base64 = dataUrl.split(',')[1];
        const result = await apiCall('POST', { action: 'uploadImage', filename: file.name, mimeType: file.type, data: base64 }, 'subs');
        setForm(f => ({ ...f, image: result.url }));
        toast('Image uploaded to Drive!', 'success');
      } catch (err) {
        toast(`Upload failed — ${err.message}`, 'error');
      } finally { setLoading(false); }
    };
    reader.readAsDataURL(file);
  }

  const isFormPanel = ['list','view','form'].includes(panel);

  return <>
    {/* ── Sidebar ── */}
    <aside className={`sidebar${sc ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar__brand">
        <img src="/butler-logo.png" alt="Butler Coffee"
          onError={e => { e.currentTarget.src=''; e.currentTarget.style.display='none'; }} />
        {!sc && <div className="sidebar__brand-text">
          <div className="sidebar__brand-name">Butler Coffee</div>
          <div className="sidebar__brand-sub">Admin DB</div>
        </div>}
      </div>

      <nav className="sidebar__nav">
        <div className="nav-section">
          {!sc && <div className="nav-section__label">Subscriptions</div>}
          <button
            className={`nav-link${isFormPanel ? ' active' : ''}`}
            onClick={() => setPanel('list')}
            title="Subscriptions"
          >
            <span className="nav-link__icon"><i className="fa-solid fa-layer-group" /></span>
            {!sc && <><span>Tiers</span><span className="nav-link__badge">{subs.length}</span></>}
          </button>
        </div>

        <div className="nav-section">
          {!sc && <div className="nav-section__label">Tools</div>}
          <button className="nav-link" onClick={() => loadFromSheet(true)} title="Sync">
            <span className="nav-link__icon"><i className="fa-solid fa-rotate" /></span>
            {!sc && <span>Sync</span>}
          </button>
        </div>
      </nav>

      <div className="sidebar__footer">
        <button className="nav-link" onClick={onBackToHub} title="Butler Society Hub">
          <span className="nav-link__icon"><i className="fa-solid fa-house" /></span>
          {!sc && <span>Butler Society</span>}
        </button>
        <button className="nav-link" onClick={logout} title="Sign out">
          <span className="nav-link__icon"><i className="fa-solid fa-right-from-bracket" /></span>
          {!sc && <span>Sign out</span>}
        </button>
      </div>

      <button
        className="sidebar__toggle"
        onClick={() => setSidebarCollapsed(p => !p)}
        title={sc ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <i className={`fa-solid ${sc ? 'fa-chevron-right' : 'fa-chevron-left'}`} />
      </button>
    </aside>

    {/* ── Main content ── */}
    <div className={`main${sc ? ' main--collapsed' : ''}`}>
      <div className="topbar">
        <div className="topbar__left">
          <span className="topbar__title">Subscriptions</span>
          {isFormPanel && <span className="topbar__count">{subs.length} tier{subs.length !== 1 ? 's' : ''}</span>}
        </div>
        <div className="topbar__right">
          {panel === 'list' && <button className="btn btn--primary" onClick={() => openForm(null)}>+ Add Tier</button>}
        </div>
      </div>

      <div className="content">
        {panel === 'list'
          ? <SubsListPanel {...{ search, setSearch, filtered, openForm, openView, setPendingDeleteId }} />
          : panel === 'view'
          ? <SubsViewPanel sub={subs.find(s => s.id === currentId)} onBack={closeForm} onEdit={openForm} />
          : <SubsFormPanel {...{ form, updateField, saveSub, closeForm, currentId, setPendingDeleteId, onImageUpload: handleImageUpload }} />
        }
      </div>
    </div>

    {/* ── Overlays ── */}
    {loading && (
      <div className="loading-overlay" style={{ display:'flex' }}>
        <div className="loading-spinner" />
        <div className="loading-label">Syncing with Google Sheet…</div>
      </div>
    )}
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          <span className="toast__icon">{t.type === 'success' ? '✓' : '✕'}</span>{t.msg}
        </div>
      ))}
    </div>
    {pendingDeleteId && (
      <div className="dialog-overlay open">
        <div className="dialog">
          <div className="dialog__title">Delete this subscription tier?</div>
          <div className="dialog__text">This permanently removes the entry from the database and cannot be undone.</div>
          <div className="dialog__confirm">
            <label className="dialog__confirm-label">Type DELETE to confirm</label>
            <input
              className="input" type="text" value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE" autoFocus
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
  </>;
}

// ── List Panel ─────────────────────────────────────────────────────────────────
function SubsListPanel({ search, setSearch, filtered, openForm, openView, setPendingDeleteId }) {
  return (
    <div id="list-panel">
      <div className="toolbar">
        <div className="search-wrap">
          <span className="search-wrap__icon">🔍</span>
          <input className="search-input" type="search" placeholder="Search tiers…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Image</th>
            <th style={{width:'25%'}}>Tier</th>
            <th>Eyebrow</th>
            <th>Short Description</th>
            <th>Pricing</th>
            <th style={{width:116}}>Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} className="tr--clickable" onClick={() => openView(s.id)}>
                <td style={{width:64}}>
                  <div style={{width:52,height:52,borderRadius:8,overflow:'hidden',background:'var(--surface-2)'}}>
                    <img
                      src={toImageUrl(s.image)}
                      alt={s.title}
                      style={{width:'100%',height:'100%',objectFit:'cover'}}
                      onError={e => { e.currentTarget.style.display='none'; }}
                    />
                  </div>
                </td>
                <td>
                  <div className="td-name">{s.title || '—'}</div>
                  {s.eyebrowEN && <div className="td-sub">{s.eyebrowEN}</div>}
                </td>
                <td style={{color:'var(--muted)',fontSize:'0.8rem'}}>{s.eyebrowEN || '—'}</td>
                <td style={{color:'var(--muted)',fontSize:'0.8rem',maxWidth:220}}>
                  <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.shortDescEN || '—'}</div>
                </td>
                <td>
                  <div className="size-chips">
                    {s.price250g && <span className="size-chip">250g €{s.price250g}</span>}
                    {s.price500g && <span className="size-chip">500g €{s.price500g}</span>}
                    {s.price1kg  && <span className="size-chip">1kg €{s.price1kg}</span>}
                    {!s.price250g && !s.price500g && !s.price1kg && '—'}
                  </div>
                </td>
                <td><div className="td-actions" onClick={e => e.stopPropagation()}>
                  <button className="btn btn--ghost btn--sm btn--icon" onClick={() => openView(s.id)} title="View">👁️</button>
                  <button className="btn btn--ghost btn--sm btn--icon" onClick={() => openForm(s.id)} title="Edit">✏️</button>
                  <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setPendingDeleteId(s.id)} title="Delete" style={{color:'var(--red)'}}>🗑️</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">🦆</div>
            <div className="empty-state__title">No subscription tiers yet</div>
            <div className="empty-state__text">Click "+ Add Tier" to create the first one.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── View Panel ─────────────────────────────────────────────────────────────────
function SubsViewPanel({ sub, onBack, onEdit }) {
  if (!sub) return (
    <div className="view-panel">
      <div className="form-header">
        <button className="form-header__back" onClick={onBack}>← Back</button>
        <h1 className="form-header__title">Tier not found</h1>
      </div>
    </div>
  );

  function VF({ label, value }) {
    if (!value) return null;
    return (
      <div className="view-field">
        <span className="view-field-label">{label}</span>
        <span className="view-field-value">{value}</span>
      </div>
    );
  }

  return (
    <div className="view-panel">
      <div className="form-header">
        <button className="form-header__back" onClick={onBack}>← Back</button>
        <h1 className="form-header__title">{sub.title || 'Untitled'}</h1>
        <button className="btn btn--ghost btn--sm" style={{marginLeft:'auto'}} onClick={() => onEdit(sub.id)}>✏️ Edit</button>
      </div>

      <div className="form-grid">

        {/* ── LEFT ── */}
        <div>
          {/* Image */}
          <div className="card">
            <div className="card__header"><span className="card__icon">🖼️</span><span className="card__title">Tier Image</span></div>
            <div className="card__body" style={{padding:0}}>
              <div className="view-img-wrap">
                <img
                  src={toImageUrl(sub.image)}
                  alt={sub.title}
                  onError={e => { e.currentTarget.style.display='none'; }}
                />
              </div>
            </div>
          </div>

          {/* Content EN */}
          <div className="card">
            <div className="card__header"><span className="card__icon">🇨🇦</span><span className="card__title">Content — English</span></div>
            <div className="card__body">
              <VF label="Eyebrow" value={sub.eyebrowEN} />
              <VF label="Short Description" value={sub.shortDescEN} />
              {sub.longDescEN && (
                <div className="view-field">
                  <span className="view-field-label">Long Description</span>
                  <div className="view-description md-rendered"
                    dangerouslySetInnerHTML={{__html: renderMarkdown(sub.longDescEN)}} />
                </div>
              )}
              <div style={{marginTop:12}}>
                {[sub.feat01EN,sub.feat02EN,sub.feat03EN,sub.feat04EN].filter(Boolean).map((f,i) => (
                  <div key={i} className="view-field">
                    <span className="view-field-label">Feature {i+1}</span>
                    <span className="view-field-value">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Profile EN */}
          <div className="card">
            <div className="card__header"><span className="card__icon">☕</span><span className="card__title">Coffee Profile — English</span></div>
            <div className="card__body">
              <div className="view-detail-grid">
                <VF label="Composition" value={sub.compositionEN} />
                <VF label="Flavor"      value={sub.flavorEN} />
                <VF label="Structure"   value={sub.structureEN} />
                <VF label="Purpose"     value={sub.purposeEN} />
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div>
          {/* Pricing */}
          <div className="card">
            <div className="card__header"><span className="card__icon">💶</span><span className="card__title">Pricing & Links</span></div>
            <div className="card__body">
              <div className="pricing-table">
                <div className="pricing-table-header">
                  <span>Size</span><span>Price €</span><span>Link</span>
                </div>
                {SIZES.map(({ key, label }) => {
                  const price = sub[`price${key}`];
                  const link  = sub[`link${key}`];
                  if (!price && !link) return null;
                  return (
                    <div className="pricing-row" key={key} style={{gridTemplateColumns:'80px 1fr 2fr'}}>
                      <span className="pricing-size">{label}</span>
                      <span className="pricing-ro">{price ? `€${price}` : '—'}</span>
                      <span style={{fontSize:'0.75rem',color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {link ? <a href={link} target="_blank" rel="noreferrer" style={{color:'var(--accent)'}}>🔗 Open</a> : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Content ES */}
          <div className="card">
            <div className="card__header"><span className="card__icon">🇪🇸</span><span className="card__title">Content — Español</span></div>
            <div className="card__body">
              <VF label="Eyebrow" value={sub.eyebrowES} />
              <VF label="Short Description" value={sub.shortDescES} />
              {sub.longDescES && (
                <div className="view-field">
                  <span className="view-field-label">Long Description</span>
                  <div className="view-description view-description--es md-rendered"
                    dangerouslySetInnerHTML={{__html: renderMarkdown(sub.longDescES)}} />
                </div>
              )}
              <div style={{marginTop:12}}>
                {[sub.feat01ES,sub.feat02ES,sub.feat03ES,sub.feat04ES].filter(Boolean).map((f,i) => (
                  <div key={i} className="view-field">
                    <span className="view-field-label">Feature {i+1}</span>
                    <span className="view-field-value">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Profile ES */}
          <div className="card">
            <div className="card__header"><span className="card__icon">☕</span><span className="card__title">Coffee Profile — Español</span></div>
            <div className="card__body">
              <div className="view-detail-grid">
                <VF label="Composition" value={sub.compositionES} />
                <VF label="Flavor"      value={sub.flavorES} />
                <VF label="Structure"   value={sub.structureES} />
                <VF label="Purpose"     value={sub.purposeES} />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Form Panel ─────────────────────────────────────────────────────────────────
function SubsFormPanel({ form, updateField, saveSub, closeForm, currentId, setPendingDeleteId, onImageUpload }) {
  return (
    <div id="form-panel" className="form-panel active">
      <div className="form-header">
        <button className="form-header__back" onClick={closeForm}>← Back</button>
        <h1 className="form-header__title">{currentId ? 'Edit Tier' : 'New Tier'}</h1>
      </div>

      <form onSubmit={saveSub}>
        <div className="form-grid">

          {/* ── LEFT COLUMN ── */}
          <div>
            {/* Identity */}
            <Card icon="✏️" title="Tier Identity">
              <Field label="Tier Title" required>
                <input className="input" required value={form.title}
                  onChange={e => updateField('title', e.target.value)}
                  placeholder="e.g. Base, Explorer, Alpine, Summit" />
              </Field>
            </Card>

            {/* Content EN */}
            <Card icon="🇨🇦" title="Content — English">
              <Field label="Eyebrow">
                <input className="input" value={form.eyebrowEN}
                  onChange={e => updateField('eyebrowEN', e.target.value)}
                  placeholder="Short label above the title" />
              </Field>
              <Field label="Short Description">
                <input className="input" value={form.shortDescEN}
                  onChange={e => updateField('shortDescEN', e.target.value)}
                  placeholder="One-liner shown in listings" />
              </Field>
              <MarkdownField
                label="Long Description"
                value={form.longDescEN}
                onChange={v => updateField('longDescEN', v)}
                placeholder="Full marketing copy (supports **bold**, *italic*, # headings, - lists)"
              />
              <div className="field-row" style={{gridTemplateColumns:'1fr 1fr'}}>
                {['feat01EN','feat02EN','feat03EN','feat04EN'].map((key, i) => (
                  <Field key={key} label={`Feature ${i+1}`}>
                    <input className="input" value={form[key]}
                      onChange={e => updateField(key, e.target.value)}
                      placeholder={`Feature ${i+1}`} />
                  </Field>
                ))}
              </div>
            </Card>

            {/* Coffee Profile EN */}
            <Card icon="☕" title="Coffee Profile — English">
              <div className="field-row">
                <Field label="Composition">
                  <input className="input" value={form.compositionEN}
                    onChange={e => updateField('compositionEN', e.target.value)} />
                </Field>
                <Field label="Flavor">
                  <input className="input" value={form.flavorEN}
                    onChange={e => updateField('flavorEN', e.target.value)} />
                </Field>
              </div>
              <div className="field-row">
                <Field label="Structure">
                  <input className="input" value={form.structureEN}
                    onChange={e => updateField('structureEN', e.target.value)} />
                </Field>
                <Field label="Purpose">
                  <input className="input" value={form.purposeEN}
                    onChange={e => updateField('purposeEN', e.target.value)} />
                </Field>
              </div>
            </Card>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div>
            {/* Image */}
            <Card icon="🖼️" title="Tier Image">
              <div className="img-preview">
                {form.image
                  ? <img src={toImageUrl(form.image)} alt="Preview"
                      onError={e => { e.currentTarget.style.display='none'; }} />
                  : <div className="img-preview__empty">
                      <div className="img-preview__empty-icon">🦆</div>
                      <span>No image set</span>
                    </div>
                }
              </div>
              <div className="img-upload-row">
                <label className="btn btn--ghost btn--sm" style={{cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6}}>
                  📁 Upload image
                  <input type="file" accept="image/*" style={{display:'none'}} onChange={onImageUpload} />
                </label>
                <button type="button" className="btn btn--ghost btn--sm"
                  onClick={() => updateField('image', '')}>Clear</button>
              </div>
              <Field label="Google Drive URL or File ID">
                <input className="input input--mono" type="text" value={form.image}
                  onChange={e => updateField('image', e.target.value)}
                  placeholder="Paste a Drive share link, /d/…/view URL, or bare file ID" />
                <div className="field-hint">Any Drive URL is auto-converted to the correct embed format on preview.</div>
              </Field>
            </Card>

            {/* Pricing & Links */}
            <Card icon="💶" title="Pricing & Links">
              {SIZES.map(({ key, label }) => (
                <div key={key} style={{marginBottom:16}}>
                  <div style={{fontSize:'0.75rem',fontWeight:600,color:'var(--muted)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div>
                  <div className="field-row">
                    <Field label="Price (€)">
                      <input className="input" type="number" step="0.01" min="0" placeholder="0.00"
                        value={form[`price${key}`]}
                        onChange={e => updateField(`price${key}`, e.target.value)} />
                    </Field>
                    <Field label="Buy Link">
                      <input className="input" type="url" placeholder="https://…"
                        value={form[`link${key}`]}
                        onChange={e => updateField(`link${key}`, e.target.value)} />
                    </Field>
                  </div>
                </div>
              ))}
            </Card>

            {/* Content ES */}
            <Card icon="🇪🇸" title="Content — Español">
              <Field label="Eyebrow">
                <input className="input" value={form.eyebrowES}
                  onChange={e => updateField('eyebrowES', e.target.value)} />
              </Field>
              <Field label="Short Description">
                <input className="input" value={form.shortDescES}
                  onChange={e => updateField('shortDescES', e.target.value)} />
              </Field>
              <MarkdownField
                label="Long Description"
                value={form.longDescES}
                onChange={v => updateField('longDescES', v)}
                placeholder="Descripción larga en español…"
              />
              <div className="field-row" style={{gridTemplateColumns:'1fr 1fr'}}>
                {['feat01ES','feat02ES','feat03ES','feat04ES'].map((key, i) => (
                  <Field key={key} label={`Feature ${i+1}`}>
                    <input className="input" value={form[key]}
                      onChange={e => updateField(key, e.target.value)} />
                  </Field>
                ))}
              </div>
            </Card>

            {/* Coffee Profile ES */}
            <Card icon="☕" title="Coffee Profile — Español">
              <div className="field-row">
                <Field label="Composition">
                  <input className="input" value={form.compositionES}
                    onChange={e => updateField('compositionES', e.target.value)} />
                </Field>
                <Field label="Flavor">
                  <input className="input" value={form.flavorES}
                    onChange={e => updateField('flavorES', e.target.value)} />
                </Field>
              </div>
              <div className="field-row">
                <Field label="Structure">
                  <input className="input" value={form.structureES}
                    onChange={e => updateField('structureES', e.target.value)} />
                </Field>
                <Field label="Purpose">
                  <input className="input" value={form.purposeES}
                    onChange={e => updateField('purposeES', e.target.value)} />
                </Field>
              </div>
            </Card>
          </div>

        </div>

        {/* ── Full-width actions ── */}
        <div className="form-actions-row">
          {currentId
            ? <button type="button" className="btn btn--danger btn--sm" onClick={() => setPendingDeleteId(currentId)}>🗑️ Delete</button>
            : <div />
          }
          <div style={{flex:1}} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={closeForm}>Cancel</button>
          <button type="submit" className="btn btn--primary">Save Tier</button>
        </div>
      </form>
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────
function Card({ icon, title, children }) {
  return (
    <div className="card">
      <div className="card__header"><span className="card__icon">{icon}</span><span className="card__title">{title}</span></div>
      <div className="card__body">{children}</div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div className="field">
      <label>{label}{required && <span className="req"> *</span>}</label>
      {children}
    </div>
  );
}

function MarkdownField({ label, value, onChange, placeholder, minHeight = 130 }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="field">
      <div className="md-header">
        <label style={{margin:0}}>{label}</label>
        <div className="md-tabs">
          <button type="button" className={`md-tab${!preview ? ' md-tab--active' : ''}`} onClick={() => setPreview(false)}>Edit</button>
          <button type="button" className={`md-tab${preview  ? ' md-tab--active' : ''}`} onClick={() => setPreview(true)}>Preview</button>
        </div>
      </div>
      {preview
        ? <div className="md-preview" style={{minHeight}}
            dangerouslySetInnerHTML={{__html: renderMarkdown(value) || '<p class="md-empty">Nothing to preview</p>'}} />
        : <textarea className="textarea-input" style={{minHeight}}
            value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      }
      <div className="field-hint">**bold** &nbsp;·&nbsp; *italic* &nbsp;·&nbsp; # heading &nbsp;·&nbsp; - list item</div>
    </div>
  );
}
