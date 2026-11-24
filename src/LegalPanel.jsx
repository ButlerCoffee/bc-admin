/**
 * LegalPanel — edit the website's legal pages (Privacy, Cookies, Shipping,
 * Terms, Disclaimer, AI Policy…) in English and Spanish. Stored in the
 * "Legal" sheet tab; saving triggers a website rebuild (auto-publish).
 *
 * Text can use {company} {address} {taxId} {email} — filled in from
 * Site Settings — and [[ … ]] for a part that is hidden when any value
 * inside it is empty.
 */
import { useEffect, useState } from 'react';
import { apiCall } from './lib/api.js';
import { LEGAL_DEFAULTS } from './lib/legalDefaults.js';

const emptySection = () => ({ heading: { en: '', es: '' }, body: { en: '', es: '' } });
const emptyPage = order => ({
  slug: '', originalSlug: '', order, visible: true, lastUpdated: '',
  title: { en: '', es: '' }, intro: { en: '', es: '' }, sections: [emptySection()],
});

const label = { display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: 4, opacity: 0.8 };
const two = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 };

function Bilingual({ title, value, onChange, multiline, rows = 4 }) {
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

export default function LegalPanel() {
  const [pages, setPages]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [status, setStatus]   = useState(null);
  const [edit, setEdit]       = useState(null); // page being edited (copy)
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiCall('GET', undefined, 'legal');
      setPages(Array.isArray(data) ? data : []);
    } catch (err) {
      setStatus({ type: 'error', msg: `Could not load legal pages: ${err.message}` });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function importDefaults() {
    setBusy(true); setStatus(null);
    try {
      const data = await apiCall('POST', { action: 'import', pages: LEGAL_DEFAULTS }, 'legal');
      setPages(data);
      setStatus({ type: 'success', msg: `Loaded ${data.length} legal pages into the database. The website will update in about a minute.` });
    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    } finally { setBusy(false); }
  }

  function openPage(p) {
    setEdit(JSON.parse(JSON.stringify({ ...p, originalSlug: p.slug })));
    setStatus(null); setConfirmDelete(false);
  }

  function update(patch) { setEdit(e => ({ ...e, ...patch })); }
  function updateSection(i, patch) {
    setEdit(e => ({ ...e, sections: e.sections.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  }
  function moveSection(i, dir) {
    setEdit(e => {
      const s = [...e.sections]; const j = i + dir;
      if (j < 0 || j >= s.length) return e;
      [s[i], s[j]] = [s[j], s[i]];
      return { ...e, sections: s };
    });
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true); setStatus(null);
    try {
      const saved = await apiCall('POST', { action: 'save', page: edit }, 'legal');
      await load();
      setEdit({ ...saved, originalSlug: saved.slug });
      setStatus({ type: 'success', msg: 'Saved. The website will update in about a minute.' });
    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setStatus(null);
    try {
      await apiCall('POST', { action: 'delete', slug: edit.originalSlug }, 'legal');
      await load();
      setEdit(null);
      setStatus({ type: 'success', msg: 'Page deleted. The website will update in about a minute.' });
    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    } finally { setBusy(false); setConfirmDelete(false); }
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  if (edit) {
    const isNew = !edit.originalSlug;
    return (
      <div className="form-panel active">
        <div className="form-header">
          <button className="form-header__back" onClick={() => { setEdit(null); setStatus(null); }}>← Back</button>
          <h1 className="form-header__title">{isNew ? 'New legal page' : (edit.title?.en || 'Legal page')}</h1>
        </div>

        <form onSubmit={save} style={{ maxWidth: 980 }}>
          <div className="card">
            <div className="card__header"><span className="card__icon">📄</span><span className="card__title">Page</span></div>
            <div className="card__body">
              <Bilingual title="Title" value={edit.title} onChange={v => update({ title: v })} />
              <div style={two}>
                <div className="field">
                  <label style={label}>Page address</label>
                  <input className="input" value={edit.slug}
                    onChange={e => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                    placeholder="privacy-policy" />
                  <div className="field-hint">butler.coffee/legal/{edit.slug || '…'}</div>
                </div>
                <div className="field">
                  <label style={label}>“Last updated” (optional)</label>
                  <input className="input" value={edit.lastUpdated || ''} onChange={e => update({ lastUpdated: e.target.value })}
                    placeholder="24 November 2026" />
                  <div className="field-hint">The date in Site Settings, if set, is shown instead.</div>
                </div>
                <div className="field">
                  <label style={label}>Order in menu</label>
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
              <Bilingual title="Introduction" value={edit.intro} onChange={v => update({ intro: v })} multiline rows={3} />
              <div className="field-hint">
                Placeholders: <code>{'{company}'}</code> <code>{'{address}'}</code> <code>{'{taxId}'}</code> <code>{'{email}'}</code> come from Site Settings.
                Wrap a part in <code>[[ … ]]</code> to hide it when a value inside is empty, e.g. <code>[[ CIF: {'{taxId}'}.]]</code>
              </div>
            </div>
          </div>

          {edit.sections.map((s, i) => (
            <div className="card" key={i}>
              <div className="card__header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="card__icon">§</span>
                <span className="card__title">Section {i + 1}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn--ghost btn--sm" disabled={i === 0} onClick={() => moveSection(i, -1)} title="Move up">↑</button>
                  <button type="button" className="btn btn--ghost btn--sm" disabled={i === edit.sections.length - 1} onClick={() => moveSection(i, 1)} title="Move down">↓</button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => update({ sections: edit.sections.filter((_, k) => k !== i) })} title="Remove section">✕</button>
                </span>
              </div>
              <div className="card__body">
                <Bilingual title="Heading" value={s.heading} onChange={v => updateSection(i, { heading: v })} />
                <Bilingual title="Text" value={s.body} onChange={v => updateSection(i, { body: v })} multiline rows={6} />
              </div>
            </div>
          ))}

          <button type="button" className="btn btn--ghost btn--sm" style={{ marginBottom: 16 }}
            onClick={() => update({ sections: [...edit.sections, emptySection()] })}>+ Add section</button>

          <Status status={status} />

          <div className="form-actions-row">
            {!isNew && (
              confirmDelete ? (
                <>
                  <span style={{ fontSize: '0.85rem' }}>Delete this page from the website?</span>
                  <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={remove}>Yes, delete</button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </>
              ) : (
                <button type="button" className="btn btn--danger btn--sm" onClick={() => setConfirmDelete(true)}>🗑️ Delete</button>
              )
            )}
            <span style={{ flex: 1 }} />
            <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save page'}</button>
          </div>
        </form>
      </div>
    );
  }

  // ── List ──────────────────────────────────────────────────────────────────
  return (
    <div className="form-panel active">
      <div className="form-header">
        <h1 className="form-header__title">Legal Pages</h1>
        {!loading && pages.length > 0 && (
          <button className="btn btn--primary btn--sm" style={{ marginLeft: 'auto' }}
            onClick={() => openPage({ ...emptyPage(pages.length + 1), originalSlug: '' })}>+ New page</button>
        )}
      </div>

      <Status status={status} />

      {loading ? (
        <div style={{ padding: 24, opacity: 0.7 }}>Loading legal pages…</div>
      ) : pages.length === 0 ? (
        <div className="card" style={{ maxWidth: 640 }}>
          <div className="card__body">
            <p style={{ marginTop: 0 }}>
              The legal pages aren’t in the database yet. The website is still showing its built-in text.
            </p>
            <p>
              Load the current pages ({LEGAL_DEFAULTS.map(p => p.title.en).join(', ')}) into the database, then edit them here.
            </p>
            <button className="btn btn--primary" disabled={busy} onClick={importDefaults}>
              {busy ? 'Loading…' : 'Load current pages'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 820 }}>
          <div className="card__body" style={{ padding: 0 }}>
            {pages.map(p => (
              <button key={p.slug} type="button" onClick={() => openPage(p)}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: 12, padding: '14px 18px',
                  background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)',
                  color: 'inherit', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                }}>
                <span style={{ width: 24, opacity: 0.5 }}>{p.order}</span>
                <span style={{ flex: 1 }}>
                  <strong>{p.title.en}</strong>
                  <span style={{ opacity: 0.6 }}> · {p.title.es}</span>
                  <div style={{ fontSize: '0.78rem', opacity: 0.55 }}>/legal/{p.slug} · {p.sections.length} sections</div>
                </span>
                {p.visible === false && <span className="nav-link__badge">hidden</span>}
                <span style={{ opacity: 0.6 }}>Edit →</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
