/**
 * SubscriptionPanel — full CRUD for Subscription Levels.
 * Mounted at route `butlercoffee/subscription/*` (wildcard keeps component
 * alive across list / view / form navigation — no remount, no data refetch).
 *
 * URL scheme:
 *   /butlercoffee/subscription            → list
 *   /butlercoffee/subscription/new        → new-level form
 *   /butlercoffee/subscription/:id        → view
 *   /butlercoffee/subscription/:id/edit   → edit form
 *
 * Images: upload manually to the shared Drive folder, then paste the URL/ID here.
 * Drive folder: https://drive.google.com/drive/folders/1Ek32YHfrAmUryNTp4oz7Sz02tE4Jerz5
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiCall } from './lib/api.js';

// ── Image helpers ─────────────────────────────────────────────────────────────
const DRIVE_IMG_FALLBACK = '1LYVoFp3Y1jv2i1ow7G7nPxCCQQzLSVZp';
const DEFAULT_IMAGE = `https://drive.google.com/thumbnail?id=${DRIVE_IMG_FALLBACK}&sz=w400`;

function toImageUrl(url) {
  if (!url) return DEFAULT_IMAGE;
  // Blob previews — use as-is
  if (url.startsWith('blob:')) return url;
  // Drive URLs (any format: /d/ID/view, ?id=ID, &id=ID) → thumbnail embed
  // This check MUST come before the generic https:// passthrough
  const m = url.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
  // Bare Drive file ID (no slashes or query chars, 20+ alphanum chars)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim()))
    return `https://drive.google.com/thumbnail?id=${url.trim()}&sz=w400`;
  // Any other direct image URL — use as-is
  return url;
}

// ── Pricing helpers ───────────────────────────────────────────────────────────

/** Round to max 2 decimal places; returns '' for empty/invalid. */
function fmtMoney(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = parseFloat(v);
  return isNaN(n) ? '' : String(Math.round(n * 100) / 100);
}

/** Returns { marginAmt, marginPct } or null if cost/price are missing. */
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

// ── Data model ────────────────────────────────────────────────────────────────
const emptySub = {
  id: '', title: '',
  eyebrowEN: '', shortDescEN: '', longDescEN: '',
  feat01EN: '', feat02EN: '', feat03EN: '', feat04EN: '',
  compositionEN: '', flavorEN: '', structureEN: '', purposeEN: '',
  eyebrowES: '', shortDescES: '', longDescES: '',
  feat01ES: '', feat02ES: '', feat03ES: '', feat04ES: '',
  compositionES: '', flavorES: '', structureES: '', purposeES: '',
  cost200g: '', cost250g: '', cost500g: '', cost1kg: '',
  price200g: '', price250g: '', price500g: '', price1kg: '',
  link200g: '', link250g: '', link500g: '', link1kg: '',
  image: '', updatedAt: ''
};

// ── Smart sizing — Summit gets 200g only; all others get 250g/500g/1kg ────────
const SUMMIT_SIZES = [{ key: '200g', label: '200 g' }];
const OTHER_SIZES  = [
  { key: '250g', label: '250 g' },
  { key: '500g', label: '500 g' },
  { key: '1kg',  label: '1 kg'  },
];
function sizesFor(title) {
  return (title || '').toLowerCase().includes('summit') ? SUMMIT_SIZES : OTHER_SIZES;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SubscriptionPanel() {
  // ── URL routing ────────────────────────────────────────────────────────────
  const { '*': splat = '' } = useParams();
  const navigate = useNavigate();

  const splatParts = splat.split('/').filter(Boolean);
  const isNew      = splatParts[0] === 'new';
  const isEdit     = splatParts[1] === 'edit';
  const urlId      = (!isNew && splatParts[0]) ? splatParts[0] : null;
  const mode       = !splatParts[0] ? 'list' : isNew ? 'form' : isEdit ? 'form' : 'view';
  const currentId  = urlId;

  function openView(id)        { navigate(`/butlercoffee/subscription/${id}`); }
  function openForm(id = null) { navigate(id ? `/butlercoffee/subscription/${id}/edit` : '/butlercoffee/subscription/new'); }
  function backToList()        { navigate('/butlercoffee/subscription'); }

  // ── Data state ─────────────────────────────────────────────────────────────
  const [subs,    setSubs]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [toasts,  setToasts]  = useState([]);
  const [form, setForm] = useState(emptySub);
  const [search, setSearch] = useState('');
  const [pendingDeleteId,   setPendingDeleteId]   = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // ── Form initialization ────────────────────────────────────────────────────
  const formKeyRef = useRef('');

  useEffect(() => {
    if (mode !== 'form') { formKeyRef.current = ''; return; }
    const key = currentId || 'new';
    if (formKeyRef.current === key) return;
    if (currentId && subs.length === 0) return; // wait for data
    const sub = currentId ? subs.find(s => s.id === currentId) : null;
    if (currentId && !sub) return; // ID not found yet
    setForm(sub ? { ...emptySub, ...sub } : { ...emptySub });
    formKeyRef.current = key;
    window.scrollTo(0, 0);
  }, [mode, currentId, subs]); // eslint-disable-line react-hooks/exhaustive-deps

  function toast(msg, type = 'success') {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }

  // ── Pull from sheet ──────────────────────────────────────────────────────────
  async function pullFromSheet(showToast = false) {
    setLoading(true);
    try {
      const data = await apiCall('GET', undefined, 'subs');
      setSubs(Array.isArray(data) ? data : []);
      if (showToast) toast('Pulled latest from Google Sheet!');
    } catch (err) {
      toast('Could not connect to Sheet — check API URL.', 'error');
    } finally { setLoading(false); }
  }
  useEffect(() => { pullFromSheet(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Push all to sheet ────────────────────────────────────────────────────────
  async function pushToSheet() {
    if (!subs.length) { toast('Nothing to push — no tiers loaded.', 'error'); return; }
    if (!window.confirm(`Push all ${subs.length} tier(s) to Google Sheet?\n\nThis will overwrite the sheet's data rows. Pull first if you have unsaved sheet edits.`)) return;
    setLoading(true);
    try {
      await apiCall('POST', { action: 'import', subscriptions: subs }, 'subs');
      toast(`Pushed ${subs.length} tier(s) to Google Sheet!`);
    } catch (err) {
      toast(`Push failed — ${err.message}`, 'error');
    } finally { setLoading(false); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return !q ? subs : subs.filter(s =>
      [s.title, s.eyebrowEN, s.shortDescEN].some(v => (v || '').toLowerCase().includes(q))
    );
  }, [subs, search]);

  function updateField(key, value) { setForm(f => ({ ...f, [key]: value })); }

  // ── Save individual tier ─────────────────────────────────────────────────────
  async function saveSub(e) {
    e.preventDefault();
    const sub = { ...form, updatedAt: new Date().toISOString() };
    if (!sub.id) sub.id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setLoading(true);
    try {
      const saved = await apiCall('POST', { action: 'save', subscription: sub }, 'subs');
      setSubs(prev => prev.some(s => s.id === saved.id)
        ? prev.map(s => s.id === saved.id ? saved : s)
        : [saved, ...prev]);
      toast('Subscription level saved!');
      navigate(`/butlercoffee/subscription/${saved.id}`); // go to view after save
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
      navigate('/butlercoffee/subscription'); // go to list after delete
      toast('Tier deleted.', 'error');
    } catch (err) { toast(`Delete failed — ${err.message}`, 'error'); }
    finally { setLoading(false); }
  }

  return <>
    {mode === 'list' && (
      <SubsListPanel
        search={search} setSearch={setSearch}
        filtered={filtered} total={subs.length}
        openForm={openForm} openView={openView}
        setPendingDeleteId={setPendingDeleteId}
        onPull={() => pullFromSheet(true)}
        onPush={pushToSheet}
      />
    )}
    {mode === 'view' && (
      <SubsViewPanel
        sub={subs.find(s => s.id === currentId)}
        onBack={backToList} onEdit={openForm}
      />
    )}
    {mode === 'form' && (
      <SubsFormPanel
        form={form} updateField={updateField}
        saveSub={saveSub} closeForm={backToList}
        currentId={currentId}
        setPendingDeleteId={setPendingDeleteId}
      />
    )}

    {loading && (
      <div className="loading-overlay" style={{ display: 'flex' }}>
        <div className="loading-spinner" />
        <div className="loading-label">Syncing…</div>
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
          <div className="dialog__title">Delete this tier?</div>
          <div className="dialog__text">This permanently removes the entry from the database. It cannot be undone.</div>
          <div className="dialog__confirm">
            <label className="dialog__confirm-label">Type DELETE to confirm</label>
            <input className="input" type="text" value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE" autoFocus
              onKeyDown={e => e.key === 'Enter' && deleteCurrent()} />
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

// ── List Panel ────────────────────────────────────────────────────────────────
function SubsListPanel({ search, setSearch, filtered, total, openForm, openView, setPendingDeleteId, onPull, onPush }) {
  return (
    <div id="list-panel">
      <div className="toolbar">
        <div className="search-wrap">
          <span className="search-wrap__icon">🔍</span>
          <input className="search-input" type="search" placeholder="Search levels…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn--primary" onClick={() => openForm(null)}>+ Add Level</button>
        <button className="btn btn--ghost btn--sm" onClick={onPull} title="Pull latest from Google Sheet">
          <i className="fa-solid fa-cloud-arrow-down" style={{marginRight:5}} />Pull
        </button>
        <button className="btn btn--ghost btn--sm" onClick={onPush} title="Push all local tiers to Google Sheet">
          <i className="fa-solid fa-cloud-arrow-up" style={{marginRight:5}} />Push
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th style={{ width: 64 }}>Image</th>
            <th>Tier</th>
            <th>Eyebrow (EN)</th>
            <th>Short Description</th>
            <th>Prices</th>
            <th style={{ width: 116 }}>Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map(s => {
              const sizes = sizesFor(s.title);
              return (
                <tr key={s.id} className="tr--clickable" onClick={() => openView(s.id)}>
                  <td>
                    <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', background: 'var(--surface-2)', flexShrink: 0 }}>
                      <img src={toImageUrl(s.image)} alt={s.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={e => { e.currentTarget.style.display = 'none'; }} />
                    </div>
                  </td>
                  <td><div className="td-name">{s.title || '—'}</div></td>
                  <td style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{s.eyebrowEN || '—'}</td>
                  <td style={{ color: 'var(--muted)', fontSize: '0.8rem', maxWidth: 200 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.shortDescEN || '—'}</div>
                  </td>
                  <td>
                    <div className="size-chips">
                      {sizes.map(({ key, label }) => s[`price${key}`]
                        ? <span className="size-chip" key={key}>{label} €{s[`price${key}`]}</span>
                        : null
                      )}
                      {sizes.every(({ key }) => !s[`price${key}`]) && '—'}
                    </div>
                  </td>
                  <td><div className="td-actions" onClick={e => e.stopPropagation()}>
                    <button className="btn btn--ghost btn--sm btn--icon" onClick={() => openView(s.id)} title="View">👁️</button>
                    <button className="btn btn--ghost btn--sm btn--icon" onClick={() => openForm(s.id)} title="Edit">✏️</button>
                    <button className="btn btn--ghost btn--sm btn--icon" style={{ color: 'var(--red)' }}
                      onClick={() => setPendingDeleteId(s.id)} title="Delete">🗑️</button>
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">🦆</div>
            <div className="empty-state__title">No subscription levels yet</div>
            <div className="empty-state__text">Click "+ Add Level" to create one, or Pull to sync from the sheet.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── View Panel ────────────────────────────────────────────────────────────────
function SubsViewPanel({ sub, onBack, onEdit }) {
  if (!sub) return (
    <div className="view-panel">
      <div className="form-header">
        <button className="form-header__back" onClick={onBack}>← Back</button>
        <h1 className="form-header__title">Level not found</h1>
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

  const sizes = sizesFor(sub.title);

  return (
    <div className="view-panel">
      <div className="form-header">
        <button className="form-header__back" onClick={onBack}>← Back</button>
        <h1 className="form-header__title">{sub.title || 'Untitled level'}</h1>
        <button className="btn btn--ghost btn--sm" style={{ marginLeft: 'auto' }} onClick={() => onEdit(sub.id)}>✏️ Edit</button>
      </div>

      <div className="form-grid">

        {/* ── LEFT: Identity · Content (both langs) · Profile (both langs) ── */}
        <div>

          {/* Tier Identity */}
          <div className="card">
            <div className="card__header"><span className="card__icon">🏷️</span><span className="card__title">Tier Identity</span></div>
            <div className="card__body">
              <div className="view-name">{sub.title}</div>
              {(sub.eyebrowEN || sub.eyebrowES) && (
                <div style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {sub.eyebrowEN && <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>🇨🇦 {sub.eyebrowEN}</span>}
                  {sub.eyebrowES && <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>🇪🇸 {sub.eyebrowES}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Content — both languages */}
          <div className="card">
            <div className="card__header"><span className="card__icon">📝</span><span className="card__title">Content</span></div>
            <div className="card__body">
              {/* English */}
              <div className="view-lang-divider"><span className="view-lang-tag">🇨🇦 English</span></div>
              <VF label="Eyebrow"     value={sub.eyebrowEN} />
              <VF label="Short Desc"  value={sub.shortDescEN} />
              {sub.longDescEN && (
                <div className="view-field">
                  <span className="view-field-label">Long Description</span>
                  <div className="view-description md-rendered"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(sub.longDescEN) }} />
                </div>
              )}
              {[sub.feat01EN, sub.feat02EN, sub.feat03EN, sub.feat04EN].filter(Boolean).map((f, i) => (
                <VF key={i} label={`Feature ${i + 1}`} value={f} />
              ))}

              {/* Spanish */}
              <div className="view-lang-divider" style={{ marginTop: 16 }}><span className="view-lang-tag">🇪🇸 Español</span></div>
              <VF label="Eyebrow"     value={sub.eyebrowES} />
              <VF label="Short Desc"  value={sub.shortDescES} />
              {sub.longDescES && (
                <div className="view-field">
                  <span className="view-field-label">Long Description</span>
                  <div className="view-description view-description--es md-rendered"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(sub.longDescES) }} />
                </div>
              )}
              {[sub.feat01ES, sub.feat02ES, sub.feat03ES, sub.feat04ES].filter(Boolean).map((f, i) => (
                <VF key={i} label={`Feature ${i + 1}`} value={f} />
              ))}
            </div>
          </div>

          {/* Coffee Profile — both languages */}
          <div className="card">
            <div className="card__header"><span className="card__icon">☕</span><span className="card__title">Coffee Profile</span></div>
            <div className="card__body">
              <div className="view-lang-divider"><span className="view-lang-tag">🇨🇦 English</span></div>
              <div className="view-detail-grid">
                <VF label="Composition" value={sub.compositionEN} />
                <VF label="Flavor"      value={sub.flavorEN} />
                <VF label="Structure"   value={sub.structureEN} />
                <VF label="Purpose"     value={sub.purposeEN} />
              </div>
              <div className="view-lang-divider" style={{ marginTop: 16 }}><span className="view-lang-tag">🇪🇸 Español</span></div>
              <div className="view-detail-grid">
                <VF label="Composition" value={sub.compositionES} />
                <VF label="Flavor"      value={sub.flavorES} />
                <VF label="Structure"   value={sub.structureES} />
                <VF label="Purpose"     value={sub.purposeES} />
              </div>
            </div>
          </div>

        </div>

        {/* ── RIGHT: Image · Pricing ── */}
        <div>

          {/* Image */}
          <div className="card">
            <div className="card__header"><span className="card__icon">🖼️</span><span className="card__title">Tier Image</span></div>
            <div className="card__body" style={{ padding: 0 }}>
              <div className="view-img-wrap">
                <img src={toImageUrl(sub.image)} alt={sub.title}
                  onError={e => { e.currentTarget.style.display = 'none'; }} />
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="card">
            <div className="card__header"><span className="card__icon">💶</span><span className="card__title">Pricing & Links</span></div>
            <div className="card__body">
              <div className="pricing-table">
                <div className="pricing-table-header" style={{ gridTemplateColumns: '70px 1fr 1fr 1fr 1fr' }}>
                  <span>Size</span><span>Cost</span><span>Price</span><span>Profit</span><span>Margin</span>
                </div>
                {sizes.map(({ key, label }) => {
                  const cost  = sub[`cost${key}`];
                  const price = sub[`price${key}`];
                  const link  = sub[`link${key}`];
                  if (!cost && !price && !link) return null;
                  const mg  = calcMargin(cost, price);
                  const cls = mg ? marginClass(mg.marginPct) : 'margin--none';
                  return (
                    <div key={key}>
                      <div className="pricing-row" style={{ gridTemplateColumns: '70px 1fr 1fr 1fr 1fr' }}>
                        <span className="pricing-size">{label}</span>
                        <span className="pricing-ro">{cost  ? `€${parseFloat(cost).toFixed(2)}`  : '—'}</span>
                        <span className="pricing-ro">{price ? `€${parseFloat(price).toFixed(2)}` : '—'}</span>
                        <span className={`pricing-profit ${cls}`}>{mg ? `€${mg.marginAmt.toFixed(2)}` : '—'}</span>
                        <span className={`pricing-margin ${cls}`}>{mg ? `${mg.marginPct.toFixed(1)}%` : '—'}</span>
                      </div>
                      {link && <LinkBar link={link} />}
                    </div>
                  );
                })}
                {sizes.every(({ key }) => !sub[`cost${key}`] && !sub[`price${key}`] && !sub[`link${key}`]) && (
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '8px 0' }}>No pricing set yet.</div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Form Panel ────────────────────────────────────────────────────────────────
function SubsFormPanel({ form, updateField, saveSub, closeForm, currentId, setPendingDeleteId }) {
  const sizes = sizesFor(form.title);

  return (
    <div id="form-panel" className="form-panel active">
      <div className="form-header">
        <button className="form-header__back" onClick={closeForm}>← Back</button>
        <h1 className="form-header__title">{currentId ? 'Edit Level' : 'New Level'}</h1>
      </div>

      <form onSubmit={saveSub}>
        <div className="form-grid">

          {/* ── LEFT: Identity · Content · Coffee Profile ── */}
          <div>

            <Card icon="🏷️" title="Tier Identity">
              <Field label="Tier Title" required>
                <input className="input" required value={form.title}
                  onChange={e => updateField('title', e.target.value)}
                  placeholder="e.g. Base, Explorer, Alpine, Summit" />
                <div className="field-hint">Title determines which bag sizes are shown — Summit gets 200 g, all others get 250 g / 500 g / 1 kg.</div>
              </Field>
            </Card>

            {/* Content — both languages in one card */}
            <Card icon="📝" title="Content">
              {/* English */}
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                🇨🇦 English
              </div>
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
              <MarkdownField label="Long Description"
                value={form.longDescEN} onChange={v => updateField('longDescEN', v)}
                placeholder="Full marketing copy — **bold**, *italic*, # heading, - list" />
              <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {['feat01EN', 'feat02EN', 'feat03EN', 'feat04EN'].map((key, i) => (
                  <Field key={key} label={`Feature ${i + 1}`}>
                    <input className="input" value={form[key]}
                      onChange={e => updateField(key, e.target.value)} placeholder={`Feature ${i + 1}`} />
                  </Field>
                ))}
              </div>

              {/* Divider */}
              <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0 16px' }} />

              {/* Spanish */}
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                🇪🇸 Español
              </div>
              <Field label="Eyebrow">
                <input className="input" value={form.eyebrowES}
                  onChange={e => updateField('eyebrowES', e.target.value)}
                  placeholder="Etiqueta corta sobre el título" />
              </Field>
              <Field label="Short Description">
                <input className="input" value={form.shortDescES}
                  onChange={e => updateField('shortDescES', e.target.value)}
                  placeholder="Una línea para listados" />
              </Field>
              <MarkdownField label="Long Description"
                value={form.longDescES} onChange={v => updateField('longDescES', v)}
                placeholder="Descripción larga en español…" />
              <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {['feat01ES', 'feat02ES', 'feat03ES', 'feat04ES'].map((key, i) => (
                  <Field key={key} label={`Feature ${i + 1}`}>
                    <input className="input" value={form[key]}
                      onChange={e => updateField(key, e.target.value)} />
                  </Field>
                ))}
              </div>
            </Card>

            {/* Coffee Profile — both languages */}
            <Card icon="☕" title="Coffee Profile">
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                🇨🇦 English
              </div>
              <div className="field-row">
                <Field label="Composition"><input className="input" value={form.compositionEN} onChange={e => updateField('compositionEN', e.target.value)} /></Field>
                <Field label="Flavor">     <input className="input" value={form.flavorEN}      onChange={e => updateField('flavorEN',      e.target.value)} /></Field>
              </div>
              <div className="field-row">
                <Field label="Structure">  <input className="input" value={form.structureEN}   onChange={e => updateField('structureEN',   e.target.value)} /></Field>
                <Field label="Purpose">    <input className="input" value={form.purposeEN}     onChange={e => updateField('purposeEN',     e.target.value)} /></Field>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0 16px' }} />

              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                🇪🇸 Español
              </div>
              <div className="field-row">
                <Field label="Composition"><input className="input" value={form.compositionES} onChange={e => updateField('compositionES', e.target.value)} /></Field>
                <Field label="Flavor">     <input className="input" value={form.flavorES}      onChange={e => updateField('flavorES',      e.target.value)} /></Field>
              </div>
              <div className="field-row">
                <Field label="Structure">  <input className="input" value={form.structureES}   onChange={e => updateField('structureES',   e.target.value)} /></Field>
                <Field label="Purpose">    <input className="input" value={form.purposeES}     onChange={e => updateField('purposeES',     e.target.value)} /></Field>
              </div>
            </Card>

          </div>

          {/* ── RIGHT: Image · Pricing ── */}
          <div>

            <Card icon="🖼️" title="Tier Image">
              <div className="img-preview">
                {form.image
                  ? <img src={toImageUrl(form.image)} alt="Preview"
                      onError={e => { e.currentTarget.style.display = 'none'; }} />
                  : <div className="img-preview__empty">
                      <div className="img-preview__empty-icon">🦆</div>
                      <span>No image set</span>
                    </div>
                }
              </div>
              <div className="img-upload-row">
                <a
                  href="https://drive.google.com/drive/folders/1Ek32YHfrAmUryNTp4oz7Sz02tE4Jerz5"
                  target="_blank" rel="noreferrer"
                  className="btn btn--ghost btn--sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  📂 Open image folder
                </a>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => updateField('image', '')}>Clear</button>
              </div>
              <Field label="Google Drive URL or File ID">
                <input className="input input--mono" type="text" value={form.image}
                  onChange={e => updateField('image', e.target.value)}
                  placeholder="Paste a Drive share link or bare file ID…" />
                <div className="field-hint">
                  Drop the image into the Drive folder above, then paste the share link or bare file ID here. Make sure the file is shared as <strong>Anyone with the link → Viewer</strong>, otherwise the image won't display.
                </div>
              </Field>
            </Card>

            <Card icon="💶" title="Pricing & Links">
              <div className="field-hint" style={{ marginBottom: 12 }}>
                {sizes.length === 1
                  ? 'Summit tier — 200 g only'
                  : 'Base · Explorer · Alpine — 250 g, 500 g, 1 kg'}
              </div>
              {sizes.map(({ key, label }) => {
                const mg  = calcMargin(form[`cost${key}`], form[`price${key}`]);
                const cls = mg ? marginClass(mg.marginPct) : 'margin--none';
                return (
                  <div key={key} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      {label}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <Field label="Cost">
                        <input className="input" type="number" step="0.01" min="0" placeholder="0.00"
                          value={form[`cost${key}`]}
                          onChange={e => updateField(`cost${key}`, e.target.value)}
                          onBlur={e  => updateField(`cost${key}`,  fmtMoney(e.target.value))} />
                      </Field>
                      <Field label="Price">
                        <input className="input" type="number" step="0.01" min="0" placeholder="0.00"
                          value={form[`price${key}`]}
                          onChange={e => updateField(`price${key}`, e.target.value)}
                          onBlur={e  => updateField(`price${key}`,  fmtMoney(e.target.value))} />
                      </Field>
                    </div>
                    {mg && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '4px 0 8px', paddingLeft: 2 }}>
                        Profit:&nbsp;<span className={`pricing-profit ${cls}`}>€{mg.marginAmt.toFixed(2)}</span>
                        <span style={{ margin: '0 5px', opacity: 0.4 }}>·</span>
                        Margin:&nbsp;<span className={`pricing-margin ${cls}`}>{mg.marginPct.toFixed(1)}%</span>
                      </div>
                    )}
                    <Field label="Link">
                      <input className="input" type="url" placeholder="https://…"
                        value={form[`link${key}`]} onChange={e => updateField(`link${key}`, e.target.value)} />
                    </Field>
                  </div>
                );
              })}
            </Card>

          </div>
        </div>

        <div className="form-actions-row">
          {currentId
            ? <button type="button" className="btn btn--danger btn--sm" onClick={() => setPendingDeleteId(currentId)}>🗑️ Delete</button>
            : <div />}
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={closeForm}>Cancel</button>
          <button type="submit" className="btn btn--primary">Save Level</button>
        </div>
      </form>
    </div>
  );
}

// ── Link bar — shown under each pricing row in the view ───────────────────────
function LinkBar({ link }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(link)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'var(--surface-2)', borderRadius: 6,
      padding: '5px 8px', marginBottom: 10, marginTop: 3,
    }}>
      <span style={{ color: 'var(--muted)', fontSize: '0.72rem', flexShrink: 0 }}>🔗</span>
      <span style={{
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: 'var(--muted)', fontFamily: 'monospace', fontSize: '0.72rem',
      }}>{link}</span>
      <a href={link} target="_blank" rel="noreferrer"
        className="btn btn--ghost btn--sm"
        style={{ fontSize: '0.72rem', padding: '2px 8px', flexShrink: 0, lineHeight: 1.6 }}>
        View ↗
      </a>
      <button type="button" onClick={copy}
        className="btn btn--ghost btn--sm"
        style={{ fontSize: '0.72rem', padding: '2px 8px', flexShrink: 0, lineHeight: 1.6, minWidth: 54 }}>
        {copied ? '✓ Copied' : 'Copy'}
      </button>
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
function MarkdownField({ label, value, onChange, placeholder, minHeight = 120 }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="field">
      <div className="md-header">
        <label style={{ margin: 0 }}>{label}</label>
        <div className="md-tabs">
          <button type="button" className={`md-tab${!preview ? ' md-tab--active' : ''}`} onClick={() => setPreview(false)}>Edit</button>
          <button type="button" className={`md-tab${preview  ? ' md-tab--active' : ''}`} onClick={() => setPreview(true)}>Preview</button>
        </div>
      </div>
      {preview
        ? <div className="md-preview" style={{ minHeight }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || '<p class="md-empty">Nothing to preview</p>' }} />
        : <textarea className="textarea-input" style={{ minHeight }}
            value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      }
      <div className="field-hint">**bold** · *italic* · # heading · - list</div>
    </div>
  );
}
