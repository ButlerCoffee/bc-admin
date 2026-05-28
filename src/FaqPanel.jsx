/**
 * FaqPanel — CRUD for the FAQ section of the public website.
 * Mounted at route `butlercoffee/faq/*`.
 *
 * URL scheme:
 *   /butlercoffee/faq            → list
 *   /butlercoffee/faq/new        → new question form
 *   /butlercoffee/faq/:id        → view
 *   /butlercoffee/faq/:id/edit   → edit form
 *
 * Data model (one row per FAQ entry in a "faq" Google Sheet):
 *   id, question_en, answer_en, question_es, answer_es,
 *   sort_order, visible, updatedAt
 *
 * Answers support Markdown: **bold**, *italic*, [link text](url), - list items.
 *
 * The GAS backend needs a "faq" sheet and handler (same pattern as machines/coffee).
 * Until the partner adds that, the panel loads gracefully with an empty list.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiCall } from './lib/api.js';
import { newId } from './CoffeeContext.jsx';
import { getCached, setCached, clearCached } from './lib/cache.js';

// ── Markdown renderer (links supported) ───────────────────────────────────────
function renderMarkdown(md) {
  if (!md) return '';
  const esc    = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => s
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,         '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" style="color:var(--yellow)">$1</a>');
  return esc(md).split(/\n\n+/).map(block => {
    const lines = block.split('\n');
    if (lines.some(l => /^[\-\*] /.test(l.trim()))) {
      const items = lines.filter(l => l.trim())
        .map(l => `<li>${inline(l.replace(/^[\-\*]\s+/, ''))}</li>`).join('');
      return `<ul class="md-ul">${items}</ul>`;
    }
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

// ── Empty template ─────────────────────────────────────────────────────────────
const emptyFaq = {
  id: '', question_en: '', answer_en: '', question_es: '', answer_es: '',
  sort_order: '', visible: true, updatedAt: '',
};

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
        ? <div className="md-preview" style={{ minHeight }} dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || '<p class="md-empty">Nothing to preview</p>' }} />
        : <textarea className="textarea-input" style={{ minHeight }} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      }
      <div className="field-hint">**bold** · *italic* · [link text](url) · - list item</div>
    </div>
  );
}

// ── Toast helper ──────────────────────────────────────────────────────────────
function useToasts() {
  const [toasts, setToasts] = useState([]);
  function toast(msg, type = 'success') {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }
  const ToastUI = () => (
    <div className="toasts">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
  return { toast, ToastUI };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component — handles its own sub-routing via location.pathname
// ─────────────────────────────────────────────────────────────────────────────
export default function FaqPanel() {
  const location = useLocation();
  const path     = location.pathname.replace(/\/$/, '');

  // Parse sub-route
  const base   = '/butlercoffee/faq';
  const isNew  = path === `${base}/new`;
  const isEdit = /\/edit$/.test(path) && path !== `${base}/edit`;
  const isView = !isNew && !isEdit && path !== base && path.startsWith(base + '/');
  const editId = isEdit ? path.replace(`${base}/`, '').replace('/edit', '') : null;
  const viewId = isView ? path.replace(`${base}/`, '') : null;

  // Shared state
  const [faqs,    setFaqs]    = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast, ToastUI }    = useToasts();

  // Load on mount — use cache if fresh (today), otherwise fetch from sheet
  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(force = false) {
    if (!force) {
      const cached = getCached('faq');
      if (cached) { setFaqs(cached); return; }
    }
    setLoading(true);
    try {
      const data = await apiCall('GET', undefined, 'faq');
      const list = Array.isArray(data) ? data : [];
      setFaqs(list);
      setCached('faq', list);
    } catch (err) {
      // Silently handle — backend sheet may not exist yet
      console.warn('FAQ sheet not yet available:', err.message);
      setFaqs([]);
    } finally {
      setLoading(false);
    }
  }

  function handlePull() {
    clearCached('faq');
    load(true);
  }

  async function saveFaq(faq) {
    const payload = {
      ...faq,
      id: faq.id || newId(),
      sort_order: faq.sort_order || faqs.length + 1,
      updatedAt: new Date().toISOString(),
    };
    setLoading(true);
    try {
      const saved = await apiCall('POST', { action: 'save', faq: payload }, 'faq');
      setFaqs(prev =>
        prev.some(f => f.id === saved.id)
          ? prev.map(f => f.id === saved.id ? saved : f)
          : [...prev, saved]
      );
      toast('FAQ saved!', 'success');
      return saved;
    } catch (err) {
      toast(`Save failed — ${err.message}`, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function pushToSheet() {
    if (!faqs.length) { toast('Nothing to push.', 'error'); return; }
    setLoading(true);
    try {
      for (const faq of faqs) {
        await apiCall('POST', { action: 'save', faq }, 'faq');
      }
      toast(`Pushed ${faqs.length} FAQ${faqs.length === 1 ? '' : 's'} to sheet.`, 'success');
    } catch (err) {
      toast(`Push failed — ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function deleteFaq(id) {
    setLoading(true);
    try {
      await apiCall('POST', { action: 'delete', id }, 'faq');
      setFaqs(prev => prev.filter(f => f.id !== id));
      toast('FAQ entry deleted.', 'error');
    } catch (err) {
      toast(`Delete failed — ${err.message}`, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // Route to the right sub-view
  if (isNew)       return <FaqForm key="new"       faqs={faqs} onSave={saveFaq} onDelete={deleteFaq} toast={toast} ToastUI={ToastUI} loading={loading} />;
  if (isEdit)      return <FaqForm key={editId}    faqs={faqs} editId={editId}  onSave={saveFaq} onDelete={deleteFaq} toast={toast} ToastUI={ToastUI} loading={loading} />;
  if (isView)      return <FaqView key={viewId}    faqs={faqs} viewId={viewId}  onDelete={deleteFaq} toast={toast} ToastUI={ToastUI} loading={loading} />;
  return                  <FaqList                 faqs={faqs} setFaqs={setFaqs} onRefresh={handlePull} onPush={pushToSheet} toast={toast} ToastUI={ToastUI} loading={loading} />;
}

// ── FAQ List ──────────────────────────────────────────────────────────────────
const BADGE = {
  base: { fontSize:'0.68rem', color:'var(--muted)', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:3, padding:'1px 5px', display:'inline-block' },
};

function FaqList({ faqs, setFaqs, onRefresh, onPush, toast, ToastUI, loading }) {
  const navigate   = useNavigate();
  const [sorted, setSorted] = useState(() => [...faqs].sort((a, b) => Number(a.sort_order) - Number(b.sort_order)));
  const dragIdx    = useRef(null);

  // Keep sorted in sync when faqs prop changes (e.g. after pull)
  useEffect(() => {
    setSorted([...faqs].sort((a, b) => Number(a.sort_order) - Number(b.sort_order)));
  }, [faqs]);

  // ── Drag handlers ────────────────────────────────────────────────────────────
  function handleDragStart(e, idx) {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIdx.current === null || dragIdx.current === idx) return;

    setSorted(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx.current, 1);
      next.splice(idx, 0, moved);
      dragIdx.current = idx;
      return next;
    });
  }

  function handleDrop(e) {
    e.preventDefault();
    // Commit new sort_order values (1-based) back to parent state + cache
    setSorted(prev => {
      const reordered = prev.map((f, i) => ({ ...f, sort_order: i + 1 }));
      setFaqs(reordered);
      return reordered;
    });
    dragIdx.current = null;
    toast('Order updated — hit Push to save to sheet.', 'success');
  }

  function handleDragEnd() {
    dragIdx.current = null;
  }

  return (
    <div id="list-panel">
      <ToastUI />
      {loading && <div className="loading-bar" />}

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div style={{ flex: 1 }} />
        <button className="btn btn--ghost btn--sm" onClick={onRefresh} title="Pull from sheet">
          <i className="fa-solid fa-cloud-arrow-down" style={{ marginRight: 6 }} />Pull
        </button>
        <button className="btn btn--ghost btn--sm" onClick={onPush} title="Push to sheet" disabled={loading}>
          <i className="fa-solid fa-cloud-arrow-up" style={{ marginRight: 6 }} />Push
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">❓</div>
          <div className="empty-state__title">No FAQ entries yet</div>
          <div className="empty-state__text">
            {loading ? 'Loading…' : 'Add your first question to get started. The backend sheet will be set up by your partner.'}
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>Question</th>
                <th style={{ width: 90 }}>Visible</th>
                <th style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((f, idx) => (
                <tr
                  key={f.id}
                  className="tr--clickable"
                  draggable
                  onDragStart={e => handleDragStart(e, idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  onClick={() => navigate(`/butlercoffee/faq/${f.id}`)}
                  style={{ cursor: 'grab' }}
                >
                  {/* Drag handle */}
                  <td style={{ color:'var(--border)', fontSize:'1rem', textAlign:'center', paddingRight:0, cursor:'grab' }}
                    onClick={e => e.stopPropagation()}>
                    <i className="fa-solid fa-grip-vertical" />
                  </td>

                  {/* Question column */}
                  <td>
                    <div className="td-name">{f.question_en || '—'}</div>
                    {f.answer_en && (
                      <div className="td-sub" style={{ maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.answer_en.replace(/[*_#\[\]()]/g, '').slice(0, 90)}{f.answer_en.length > 90 ? '…' : ''}
                      </div>
                    )}
                    <div style={{ marginTop: 4, display:'flex', gap:4 }}>
                      {f.question_en && <span style={BADGE.base}>🇨🇦 EN</span>}
                      {f.question_es && <span style={BADGE.base}>🇪🇸 ES</span>}
                    </div>
                  </td>

                  <td>
                    {f.visible
                      ? <span className="level-badge level--explorer">Visible</span>
                      : <span className="hidden-badge">Hidden</span>}
                  </td>
                  <td>
                    <div className="td-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn--ghost btn--sm btn--icon" onClick={() => navigate(`/butlercoffee/faq/${f.id}`)} title="View">👁️</button>
                      <button className="btn btn--ghost btn--sm btn--icon" onClick={() => navigate(`/butlercoffee/faq/${f.id}/edit`)} title="Edit">✏️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sorted.length > 0 && (
        <div style={{ marginTop: 8, fontSize:'0.75rem', color:'var(--muted)' }}>
          Drag rows to reorder · {sorted.length} question{sorted.length === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}

// ── FAQ View ──────────────────────────────────────────────────────────────────
function FaqView({ faqs, viewId, onDelete, toast, ToastUI, loading }) {
  const navigate = useNavigate();
  const faq      = faqs.find(f => f.id === viewId);

  const [pendingDelete,  setPendingDelete]  = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  async function confirmDelete() {
    if (deleteConfirmText !== 'DELETE') return;
    try {
      await onDelete(faq.id);
      navigate('/butlercoffee/faq');
    } catch {}
  }

  if (!faq) return (
    <div className="view-panel">
      <div className="form-header">
        <button className="form-header__back" onClick={() => navigate('/butlercoffee/faq')}>← Back</button>
        <h1 className="form-header__title">FAQ entry not found</h1>
      </div>
    </div>
  );

  return (
    <div className="view-panel">
      <ToastUI />
      <div className="form-header">
        <button className="form-header__back" onClick={() => navigate('/butlercoffee/faq')}>← Back</button>
        <h1 className="form-header__title" style={{ fontSize: '1rem', maxWidth: 600 }}>{faq.question_en || 'Untitled'}</h1>
        <button className="btn btn--ghost btn--sm" style={{ marginLeft: 'auto' }} onClick={() => navigate(`/butlercoffee/faq/${faq.id}/edit`)}>✏️ Edit</button>
      </div>

      {!faq.visible && (
        <div className="visibility-warning">
          <span>⚠️</span><span>This FAQ entry is <strong>not visible</strong> on the public website.</span>
        </div>
      )}

      <div className="form-grid">
        <div>
          <Card icon="🇨🇦" title="English">
            <div className="view-field" style={{ marginBottom: 12 }}>
              <span className="view-field-label">Question</span>
              <span className="view-field-value" style={{ fontWeight: 600 }}>{faq.question_en || '—'}</span>
            </div>
            <div className="view-field">
              <span className="view-field-label">Answer</span>
              {faq.answer_en
                ? <div className="view-description md-rendered" dangerouslySetInnerHTML={{ __html: renderMarkdown(faq.answer_en) }} />
                : <span className="view-field-value" style={{ opacity: 0.4 }}>—</span>}
            </div>
          </Card>
        </div>
        <div>
          <Card icon="🇪🇸" title="Español">
            <div className="view-field" style={{ marginBottom: 12 }}>
              <span className="view-field-label">Pregunta</span>
              <span className="view-field-value" style={{ fontWeight: 600 }}>{faq.question_es || '—'}</span>
            </div>
            <div className="view-field">
              <span className="view-field-label">Respuesta</span>
              {faq.answer_es
                ? <div className="view-description md-rendered" dangerouslySetInnerHTML={{ __html: renderMarkdown(faq.answer_es) }} />
                : <span className="view-field-value" style={{ opacity: 0.4 }}>—</span>}
            </div>
          </Card>
          <Card icon="⚙️" title="Settings">
            <div className="view-field" style={{ marginBottom: 8 }}>
              <span className="view-field-label">Sort Order</span>
              <span className="view-field-value">{faq.sort_order || '—'}</span>
            </div>
            <div className="view-field">
              <span className="view-field-label">Visibility</span>
              <span className="view-field-value">
                {faq.visible
                  ? <span className="level-badge level--explorer">Visible</span>
                  : <span className="hidden-badge">Hidden</span>}
              </span>
            </div>
          </Card>
        </div>
      </div>

      <div className="form-actions-row">
        <button type="button" className="btn btn--danger btn--sm" onClick={() => setPendingDelete(true)}>🗑️ Delete</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn--ghost btn--sm" onClick={() => navigate('/butlercoffee/faq')}>Back to list</button>
        <button className="btn btn--primary" onClick={() => navigate(`/butlercoffee/faq/${faq.id}/edit`)}>✏️ Edit</button>
      </div>

      {pendingDelete && (
        <div className="dialog-overlay open">
          <div className="dialog">
            <div className="dialog__title">Delete this FAQ entry?</div>
            <div className="dialog__text">This will permanently remove the question and answer. This action cannot be undone.</div>
            <div className="dialog__confirm">
              <label className="dialog__confirm-label">Type DELETE to confirm</label>
              <input className="input" type="text" value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)} placeholder="DELETE" autoFocus
                onKeyDown={e => e.key === 'Enter' && confirmDelete()} />
            </div>
            <div className="dialog__actions">
              <button className="btn btn--ghost btn--sm" onClick={() => { setPendingDelete(false); setDeleteConfirmText(''); }}>Cancel</button>
              <button className="btn btn--danger btn--sm" onClick={confirmDelete} disabled={deleteConfirmText !== 'DELETE'}>Yes, delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FAQ Form (new + edit) ──────────────────────────────────────────────────────
function FaqForm({ faqs, editId, onSave, onDelete, toast, ToastUI, loading }) {
  const navigate  = useNavigate();
  const isNew     = !editId;
  const existing  = editId ? faqs.find(f => f.id === editId) : null;

  const [form,          setForm]          = useState(() => existing ? { ...emptyFaq, ...existing } : { ...emptyFaq });
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleteText,    setDeleteText]    = useState('');

  // Keep form in sync if faqs load after mount
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!syncedRef.current && existing) {
      setForm({ ...emptyFaq, ...existing });
      syncedRef.current = true;
    }
  }, [existing]);

  function updateField(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const saved = await onSave(form);
      navigate(`/butlercoffee/faq/${saved.id}`);
    } catch {}
  }

  async function confirmDelete() {
    if (deleteText !== 'DELETE') return;
    try {
      await onDelete(editId);
      navigate('/butlercoffee/faq');
    } catch {}
  }

  return (
    <div id="form-panel" className="form-panel active">
      <ToastUI />
      <div className="form-header">
        <button className="form-header__back" onClick={() => navigate(isNew ? '/butlercoffee/faq' : `/butlercoffee/faq/${editId}`)}>← Back</button>
        <h1 className="form-header__title">{isNew ? 'New FAQ Entry' : 'Edit FAQ Entry'}</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          {/* Left column: EN then ES */}
          <div>
            <Card icon="🇨🇦" title="English">
              <Field label="Question (EN)" required>
                <input
                  className="input" required
                  value={form.question_en}
                  onChange={e => updateField('question_en', e.target.value)}
                  placeholder="How do subscriptions work?"
                />
              </Field>
              <MarkdownField
                label="Answer (EN)"
                value={form.answer_en}
                onChange={v => updateField('answer_en', v)}
                placeholder={"Our subscriptions are simple and flexible...\n\nYou can use **bold**, *italic*, [links](https://example.com), and - list items."}
                minHeight={150}
              />
            </Card>

            <Card icon="🇪🇸" title="Español">
              <Field label="Pregunta (ES)">
                <input
                  className="input"
                  value={form.question_es}
                  onChange={e => updateField('question_es', e.target.value)}
                  placeholder="¿Cómo funcionan las suscripciones?"
                />
              </Field>
              <MarkdownField
                label="Respuesta (ES)"
                value={form.answer_es}
                onChange={v => updateField('answer_es', v)}
                placeholder={"Nuestras suscripciones son simples y flexibles..."}
                minHeight={150}
              />
            </Card>
          </div>

          {/* Right column: Settings */}
          <div>
            <Card icon="⚙️" title="Settings">
              <Field
                label="Sort Order"
                hint="Lower numbers appear first. Leave blank to append at end."
              >
                <input
                  className="input" type="number" min="1" step="1"
                  style={{ width: 100 }}
                  value={form.sort_order}
                  onChange={e => updateField('sort_order', e.target.value)}
                  placeholder={String(faqs.length + 1)}
                />
              </Field>
              <div className="field">
                <label className={`visible-toggle${form.visible ? ' visible-toggle--on' : ' visible-toggle--off'}`}>
                  <input type="checkbox" checked={!!form.visible} onChange={e => updateField('visible', e.target.checked)} />
                  <span className="visible-toggle__track" />
                  <span className="visible-toggle__label">{form.visible ? '✓ Visible on website' : '⚠ Hidden from website'}</span>
                </label>
              </div>
            </Card>
          </div>
        </div>

        <div className="form-actions-row">
          {!isNew
            ? <button type="button" className="btn btn--danger btn--sm" onClick={() => setPendingDelete(true)}>🗑️ Delete</button>
            : <div />
          }
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate(isNew ? '/butlercoffee/faq' : `/butlercoffee/faq/${editId}`)}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={loading}>Save FAQ</button>
        </div>
      </form>

      {pendingDelete && (
        <div className="dialog-overlay open">
          <div className="dialog">
            <div className="dialog__title">Delete this FAQ entry?</div>
            <div className="dialog__text">This will permanently remove the question and answer. This action cannot be undone.</div>
            <div className="dialog__confirm">
              <label className="dialog__confirm-label">Type DELETE to confirm</label>
              <input className="input" type="text" value={deleteText} onChange={e => setDeleteText(e.target.value)} placeholder="DELETE" autoFocus onKeyDown={e => e.key === 'Enter' && confirmDelete()} />
            </div>
            <div className="dialog__actions">
              <button className="btn btn--ghost btn--sm" onClick={() => { setPendingDelete(false); setDeleteText(''); }}>Cancel</button>
              <button className="btn btn--danger btn--sm" onClick={confirmDelete} disabled={deleteText !== 'DELETE'}>Yes, delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
