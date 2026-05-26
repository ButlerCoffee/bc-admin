/**
 * BlogPanel — full CRUD for blog posts.
 * Mounted at route `butlercoffee/blog/*` (wildcard keeps component alive
 * across list / view / form navigation — no remount, no refetch).
 *
 * URL scheme:
 *   /butlercoffee/blog              → post list (all, including drafts)
 *   /butlercoffee/blog/new          → new post form
 *   /butlercoffee/blog/:slug        → view post
 *   /butlercoffee/blog/:slug/edit   → edit post form
 *
 * Content is written in Markdown and stored in the "Blog" Google Sheet tab.
 * The same GAS endpoint handles reads/writes via sheet=blog.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiCall } from './lib/api.js';
import { toSlug } from './CoffeeContext.jsx';

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderMarkdown(md) {
  if (!md) return '';
  const esc    = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => s
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,         '<em>$1</em>')
    .replace(/`(.+?)`/g,           '<code style="font-family:monospace;font-size:0.88em;background:var(--bg);padding:1px 5px;border-radius:3px;border:1px solid var(--border)">$1</code>');
  return esc(md).split(/\n\n+/).map(block => {
    const lines = block.split('\n');
    // Headings
    if (lines.length === 1 && /^#{1,4} /.test(lines[0])) {
      const lvl = lines[0].match(/^(#+)/)[1].length;
      const sizes = { 1:'1.5rem', 2:'1.2rem', 3:'1rem', 4:'0.9rem' };
      return `<h${lvl} style="font-family:var(--font-head);font-size:${sizes[lvl]};font-weight:800;margin:1.4em 0 0.4em;line-height:1.25;">${inline(lines[0].replace(/^#+\s+/, ''))}</h${lvl}>`;
    }
    // Horizontal rule
    if (/^---+$/.test(lines[0].trim())) {
      return '<hr style="border:none;border-top:1px solid var(--border);margin:2em 0;">';
    }
    // Blockquote
    if (lines[0].startsWith('> ')) {
      const text = lines.map(l => l.replace(/^>\s?/, '')).join('<br>');
      return `<blockquote style="margin:1em 0;padding:12px 16px;border-left:3px solid var(--yellow);background:var(--bg);border-radius:0 var(--r) var(--r) 0;font-style:italic;color:var(--muted);">${inline(text)}</blockquote>`;
    }
    // Unordered list
    if (lines.some(l => /^[\-\*] /.test(l.trim()))) {
      const items = lines.filter(l => l.trim())
        .map(l => `<li style="margin-bottom:0.25em">${inline(l.replace(/^[\-\*] /, ''))}</li>`).join('');
      return `<ul style="margin:0.5em 0 1em 1.4em">${items}</ul>`;
    }
    // Ordered list
    if (lines.some(l => /^\d+\. /.test(l.trim()))) {
      const items = lines.filter(l => l.trim())
        .map(l => `<li style="margin-bottom:0.25em">${inline(l.replace(/^\d+\.\s/, ''))}</li>`).join('');
      return `<ol style="margin:0.5em 0 1em 1.4em">${items}</ol>`;
    }
    return `<p style="margin:0 0 0.9em;line-height:1.8;">${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

// ── Data model ────────────────────────────────────────────────────────────────
const emptyPost = {
  id: '', title: '', slug: '', status: 'draft', content: '', updatedAt: '',
};

function newPostId() {
  return `blog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

// ── Shared primitives ─────────────────────────────────────────────────────────
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

// ── Markdown editor with live preview ─────────────────────────────────────────
function MarkdownEditor({ value, onChange }) {
  const [tab, setTab] = useState('write'); // 'write' | 'preview'

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {['write', 'preview'].map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: '3px 12px',
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: 600,
                background: tab === t ? 'var(--yellow)' : 'transparent',
                color: 'var(--text)',
                textTransform: 'capitalize',
              }}
            >
              {t === 'write' ? '✏️ Write' : '👁️ Preview'}
            </button>
          ))}
        </div>
        <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
          Markdown · **bold** · *italic* · # Heading · - list · &gt; quote
        </span>
      </div>

      {/* Write pane */}
      {tab === 'write' && (
        <textarea
          className="textarea-input"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={`Start writing your article here…\n\n# Use headings to structure your content\n\nParagraphs separated by a blank line become separate blocks.\n\n- Bullet lists work like this\n- Just use a dash at the start\n\n> Block quotes look great for pull quotes or key tips.\n\n**Bold** and *italic* text work inline.`}
          style={{
            minHeight: 420,
            borderRadius: 0,
            border: 'none',
            resize: 'vertical',
            fontFamily: 'monospace',
            fontSize: '0.88rem',
            lineHeight: 1.7,
            padding: '16px',
          }}
        />
      )}

      {/* Preview pane */}
      {tab === 'preview' && (
        <div style={{ minHeight: 420, padding: '20px 24px', fontSize: '0.93rem', lineHeight: 1.8, color: 'var(--text)' }}>
          {value
            ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />
            : <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Nothing to preview yet.</p>
          }
        </div>
      )}

      {/* Word count */}
      <div style={{
        padding: '6px 12px',
        background: 'var(--bg)',
        borderTop: '1px solid var(--border)',
        fontSize: '0.72rem',
        color: 'var(--muted)',
        display: 'flex',
        gap: 16,
      }}>
        <span>{(value || '').split(/\s+/).filter(Boolean).length} words</span>
        <span>{(value || '').length} characters</span>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const published = status === 'published';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: '0.72rem',
      fontWeight: 700,
      background: published ? '#f0fdf4' : 'var(--yellow-bg)',
      color:      published ? 'var(--green)' : '#7a6400',
      border:     `1px solid ${published ? '#bbf7d0' : 'var(--yellow-bd)'}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: published ? 'var(--green)' : 'var(--yellow)', display: 'inline-block' }} />
      {published ? 'Published' : 'Draft'}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BlogPanel() {
  // ── URL routing ────────────────────────────────────────────────────────────
  const { '*': splat = '' } = useParams();
  const navigate = useNavigate();

  const splatParts = splat.split('/').filter(Boolean);
  const isNew      = splatParts[0] === 'new';
  const isEdit     = splatParts[1] === 'edit';
  const urlSlug    = (!isNew && splatParts[0]) ? splatParts[0] : null;
  const mode       = !splatParts[0] ? 'list' : isNew ? 'form' : isEdit ? 'form' : 'view';
  const currentSlug = urlSlug;

  function openView(slug)     { navigate(`/butlercoffee/blog/${slug}`); }
  function openForm(slug = null) {
    navigate(slug ? `/butlercoffee/blog/${slug}/edit` : '/butlercoffee/blog/new');
  }
  function backToList()       { navigate('/butlercoffee/blog'); }

  // ── Data state ─────────────────────────────────────────────────────────────
  const [posts,   setPosts]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [toasts,  setToasts]  = useState([]);
  const [form,    setForm]    = useState(emptyPost);
  const [search,  setSearch]  = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [pendingDeleteSlug,   setPendingDeleteSlug]   = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // ── Form initialization ────────────────────────────────────────────────────
  const formKeyRef = useRef('');

  useEffect(() => {
    if (mode !== 'form') { formKeyRef.current = ''; return; }
    const key = currentSlug || 'new';
    if (formKeyRef.current === key) return;
    if (currentSlug && posts.length === 0) return; // wait for data
    const post = currentSlug ? posts.find(p => p.slug === currentSlug) : null;
    if (currentSlug && !post) return; // not found yet
    setForm(post ? { ...emptyPost, ...post } : { ...emptyPost });
    setSlugManual(Boolean(post?.slug));
    formKeyRef.current = key;
    window.scrollTo(0, 0);
  }, [mode, currentSlug, posts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── API ────────────────────────────────────────────────────────────────────
  function toast(msg, type = 'success') {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }

  async function pullFromSheet(showToast = false) {
    setLoading(true);
    try {
      const data = await apiCall('GET', undefined, 'blog');
      setPosts(Array.isArray(data) ? data : []);
      if (showToast) toast('Synced from Google Sheet!');
    } catch (err) {
      toast(`Could not load posts — ${err.message}`, 'error');
    } finally { setLoading(false); }
  }

  useEffect(() => { pullFromSheet(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updateField(key, value) {
    setForm(f => {
      const next = { ...f, [key]: value };
      if (key === 'title' && !slugManual) next.slug = toSlug(value);
      return next;
    });
  }

  async function savePost(e) {
    e.preventDefault();
    const post = {
      ...form,
      id:        form.id || newPostId(),
      slug:      form.slug || toSlug(form.title),
      updatedAt: new Date().toISOString(),
    };
    setLoading(true);
    try {
      const saved = await apiCall('POST', { action: 'save', post }, 'blog');
      setPosts(prev =>
        prev.some(p => p.id === saved.id)
          ? prev.map(p => p.id === saved.id ? saved : p)
          : [saved, ...prev]
      );
      toast('Post saved!');
      navigate(`/butlercoffee/blog/${saved.slug}`);
    } catch (err) { toast(`Save failed — ${err.message}`, 'error'); }
    finally { setLoading(false); }
  }

  async function deletePost() {
    if (!pendingDeleteSlug || deleteConfirmText !== 'DELETE') return;
    const post = posts.find(p => p.slug === pendingDeleteSlug);
    if (!post) return;
    const id = post.id;
    setPendingDeleteSlug(null); setDeleteConfirmText('');
    setLoading(true);
    try {
      await apiCall('POST', { action: 'delete', id }, 'blog');
      setPosts(prev => prev.filter(p => p.id !== id));
      navigate('/butlercoffee/blog');
      toast('Post deleted.', 'error');
    } catch (err) { toast(`Delete failed — ${err.message}`, 'error'); }
    finally { setLoading(false); }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered = posts.filter(p => {
    const q = search.toLowerCase();
    return !q || [p.title, p.content].some(v => (v || '').toLowerCase().includes(q));
  });

  const currentPost = currentSlug ? posts.find(p => p.slug === currentSlug) : null;

  return (
    <>
      {/* ── LIST ──────────────────────────────────────────────────────────── */}
      {mode === 'list' && (
        <div>
          {/* Toolbar */}
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <div className="search-wrap">
              <span className="search-wrap__icon">🔍</span>
              <input className="search-input" type="search" placeholder="Search posts…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => pullFromSheet(true)} title="Pull from Sheet">
              <i className="fa-solid fa-cloud-arrow-down" style={{ marginRight: 5 }} />Pull
            </button>
            <button className="btn btn--primary btn--sm" onClick={() => openForm(null)}>
              + New Post
            </button>
          </div>

          {/* Table */}
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Title</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 130 }}>Updated</th>
                <th style={{ width: 116 }}>Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="tr--clickable" onClick={() => openView(p.slug)}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.title || '(Untitled)'}</div>
                      {p.slug && <div className="td-sub">/blog/{p.slug}</div>}
                    </td>
                    <td><StatusBadge status={p.status} /></td>
                    <td style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{formatDate(p.updatedAt)}</td>
                    <td>
                      <div className="td-actions" onClick={e => e.stopPropagation()}>
                        <button className="btn btn--ghost btn--sm btn--icon" onClick={() => openView(p.slug)} title="View">👁️</button>
                        <button className="btn btn--ghost btn--sm btn--icon" onClick={() => openForm(p.slug)} title="Edit">✏️</button>
                        <button className="btn btn--ghost btn--sm btn--icon" style={{ color: 'var(--red)' }} onClick={() => setPendingDeleteSlug(p.slug)} title="Delete">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="empty-state">
                <div className="empty-state__icon">✍️</div>
                <div className="empty-state__title">No posts yet</div>
                <div className="empty-state__text">Click "+ New Post" to write your first article.</div>
              </div>
            )}
          </div>

          {/* Stats */}
          {posts.length > 0 && (
            <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: '0.78rem', color: 'var(--muted)' }}>
              <span>{posts.filter(p => p.status === 'published').length} published</span>
              <span>{posts.filter(p => p.status === 'draft').length} drafts</span>
            </div>
          )}
        </div>
      )}

      {/* ── VIEW ──────────────────────────────────────────────────────────── */}
      {mode === 'view' && currentPost && (
        <div className="view-panel">
          <div className="form-header">
            <button className="form-header__back" onClick={backToList}>← Blog</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
              <h1 className="form-header__title">{currentPost.title || '(Untitled)'}</h1>
              <StatusBadge status={currentPost.status} />
            </div>
            <button className="btn btn--ghost btn--sm" style={{ marginLeft: 'auto' }} onClick={() => openForm(currentPost.slug)}>
              ✏️ Edit
            </button>
          </div>

          {/* Article meta */}
          <div style={{
            display: 'flex', gap: 16, alignItems: 'center',
            padding: '10px 0 20px',
            borderBottom: '1px solid var(--border)',
            marginBottom: 28,
            fontSize: '0.78rem', color: 'var(--muted)',
          }}>
            <span><i className="fa-regular fa-clock" style={{ marginRight: 4 }} />{formatDate(currentPost.updatedAt)}</span>
            <span style={{ fontFamily: 'monospace' }}>/blog/{currentPost.slug}</span>
          </div>

          {/* Yellow rule + title */}
          <div style={{ maxWidth: 700 }}>
            <div style={{ width: 32, height: 3, background: 'var(--yellow)', borderRadius: 2, marginBottom: 20 }} />
            <h2 style={{
              fontFamily: 'var(--font-head)',
              fontSize: 'clamp(1.5rem, 3vw, 2.1rem)',
              fontWeight: 800,
              lineHeight: 1.2,
              margin: '0 0 32px',
              letterSpacing: '-0.02em',
            }}>
              {currentPost.title}
            </h2>

            {/* Rendered article */}
            <div
              style={{ fontSize: '0.93rem', color: 'var(--text)' }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(currentPost.content) || '<p style="color:var(--muted);font-style:italic">No content yet.</p>' }}
            />
          </div>
        </div>
      )}

      {/* View: not found */}
      {mode === 'view' && !currentPost && !loading && (
        <div className="empty-state" style={{ padding: '60px 24px' }}>
          <div className="empty-state__icon">🔍</div>
          <div className="empty-state__title">Post not found</div>
          <button className="btn btn--ghost btn--sm" style={{ marginTop: 16 }} onClick={backToList}>← Back to Blog</button>
        </div>
      )}

      {/* ── FORM ──────────────────────────────────────────────────────────── */}
      {mode === 'form' && (
        <div className="form-panel active">
          <div className="form-header">
            <button className="form-header__back" onClick={backToList}>← Back</button>
            <h1 className="form-header__title">{currentSlug ? 'Edit Post' : 'New Post'}</h1>
          </div>

          <form onSubmit={savePost}>
            <div className="form-grid">

              {/* ── LEFT: Editor ── */}
              <div>
                <Card icon="✍️" title="Article">
                  <Field label="Title" required>
                    <input
                      className="input"
                      required
                      value={form.title}
                      onChange={e => updateField('title', e.target.value)}
                      placeholder="e.g. How to Nail a Perfect V60"
                      style={{ fontSize: '1rem', fontWeight: 600 }}
                    />
                  </Field>

                  <Field label="Content" hint="Write in Markdown. Switch to Preview to see how it looks.">
                    <MarkdownEditor value={form.content} onChange={v => updateField('content', v)} />
                  </Field>
                </Card>
              </div>

              {/* ── RIGHT: Settings ── */}
              <div style={{ minWidth: 0 }}>
                <Card icon="⚙️" title="Post Settings">
                  {/* Status */}
                  <div className="field" style={{ marginBottom: 20 }}>
                    <label>Status</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {['draft', 'published'].map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => updateField('status', s)}
                          style={{
                            flex: 1,
                            padding: '8px 0',
                            borderRadius: 'var(--r)',
                            border: `1px solid ${form.status === s ? (s === 'published' ? '#bbf7d0' : 'var(--yellow-bd)') : 'var(--border)'}`,
                            background: form.status === s ? (s === 'published' ? '#f0fdf4' : 'var(--yellow-bg)') : 'transparent',
                            color: form.status === s ? (s === 'published' ? 'var(--green)' : '#7a6400') : 'var(--muted)',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            textTransform: 'capitalize',
                          }}
                        >
                          {s === 'published' ? '✓ Published' : '○ Draft'}
                        </button>
                      ))}
                    </div>
                    <div className="field-hint">
                      Draft posts are visible in this admin but not on the public site.
                    </div>
                  </div>

                  {/* Slug */}
                  <Field label="URL Slug" hint="Auto-generated from the title. Edit manually if needed.">
                    <div className="slug-row">
                      <span className="slug-prefix">/blog/</span>
                      <input
                        className="input input--mono"
                        value={form.slug}
                        onChange={e => { setSlugManual(true); updateField('slug', e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')); }}
                        placeholder="post-slug"
                      />
                      <button
                        type="button"
                        className="slug-regen"
                        title="Regenerate from title"
                        onClick={() => { setSlugManual(false); updateField('slug', toSlug(form.title)); }}
                      >↺</button>
                    </div>
                  </Field>
                </Card>

                {/* Writing tips */}
                <div style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r)',
                  padding: '14px 16px',
                  fontSize: '0.78rem',
                  color: 'var(--muted)',
                  lineHeight: 1.7,
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>✏️ Markdown quick reference</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', fontFamily: 'monospace' }}>
                    <span># Heading 1</span><span style={{ fontFamily: 'var(--font-body)' }}>Big heading</span>
                    <span>## Heading 2</span><span style={{ fontFamily: 'var(--font-body)' }}>Section heading</span>
                    <span>**bold**</span><span style={{ fontFamily: 'var(--font-body)' }}><strong>bold</strong></span>
                    <span>*italic*</span><span style={{ fontFamily: 'var(--font-body)' }}><em>italic</em></span>
                    <span>- item</span><span style={{ fontFamily: 'var(--font-body)' }}>Bullet list</span>
                    <span>1. item</span><span style={{ fontFamily: 'var(--font-body)' }}>Numbered list</span>
                    <span>&gt; quote</span><span style={{ fontFamily: 'var(--font-body)' }}>Block quote</span>
                    <span>---</span><span style={{ fontFamily: 'var(--font-body)' }}>Divider</span>
                    <span>`code`</span><span style={{ fontFamily: 'var(--font-body)' }}>Inline code</span>
                  </div>
                  <div style={{ marginTop: 8, fontFamily: 'var(--font-body)' }}>Separate paragraphs with a blank line.</div>
                </div>
              </div>

            </div>

            {/* Form actions */}
            <div className="form-actions-row">
              {currentSlug
                ? <button type="button" className="btn btn--danger btn--sm" onClick={() => setPendingDeleteSlug(currentSlug)}>🗑️ Delete</button>
                : <div />
              }
              <div style={{ flex: 1 }} />
              <button type="button" className="btn btn--ghost btn--sm" onClick={backToList}>Cancel</button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => { updateField('status', 'draft'); setTimeout(() => document.querySelector('[data-save]')?.click(), 0); }}
              >
                Save Draft
              </button>
              <button
                type="submit"
                data-save
                className="btn btn--primary"
                onClick={() => form.status !== 'published' && updateField('status', 'draft')}
              >
                {form.status === 'published' ? '🌐 Save & Publish' : '💾 Save Draft'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Loading overlay ────────────────────────────────────────────────── */}
      {loading && (
        <div className="loading-overlay" style={{ display: 'flex' }}>
          <div className="loading-spinner" />
          <div className="loading-label">Syncing…</div>
        </div>
      )}

      {/* ── Toasts ─────────────────────────────────────────────────────────── */}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast--${t.type}`}>
            <span className="toast__icon">{t.type === 'success' ? '✓' : '✕'}</span>{t.msg}
          </div>
        ))}
      </div>

      {/* ── Delete dialog ───────────────────────────────────────────────────── */}
      {pendingDeleteSlug && (
        <div className="dialog-overlay open">
          <div className="dialog">
            <div className="dialog__title">Delete this post?</div>
            <div className="dialog__text">This permanently removes the post from the database. It cannot be undone.</div>
            <div className="dialog__confirm">
              <label className="dialog__confirm-label">Type DELETE to confirm</label>
              <input
                className="input" type="text"
                value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE" autoFocus
                onKeyDown={e => e.key === 'Enter' && deletePost()}
              />
            </div>
            <div className="dialog__actions">
              <button className="btn btn--ghost btn--sm" onClick={() => { setPendingDeleteSlug(null); setDeleteConfirmText(''); }}>Cancel</button>
              <button className="btn btn--danger btn--sm" onClick={deletePost} disabled={deleteConfirmText !== 'DELETE'}>Yes, delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
