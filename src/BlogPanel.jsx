/**
 * BlogPanel — full CRUD for blog posts.
 * Route: /butlercoffee/blog/* (wildcard — single component instance, no remount)
 *
 * Sheet "Blog" columns (16):
 *   id | title | slug | status | content | updatedAt |
 *   category | tags | author | excerpt | imageUrl | imageAlt | featured |
 *   title_es | excerpt_es | content_es
 *
 * Content stored as HTML (WYSIWYG). Primary language: English; translation: Spanish.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiCall } from './lib/api.js';
import { toSlug } from './CoffeeContext.jsx';

// ── Inject rich-editor + blog-HTML CSS ────────────────────────────────────────
function useBlogStyles() {
  useEffect(() => {
    if (document.getElementById('blog-panel-styles')) return;
    const el = document.createElement('style');
    el.id = 'blog-panel-styles';
    el.textContent = `
      /* ── Rich-text editor chrome ── */
      .re { border:1px solid var(--border); border-radius:var(--r); overflow:hidden; background:var(--card); }
      .re__bar {
        display:flex; flex-wrap:wrap; align-items:center; gap:1px;
        padding:5px 8px; background:var(--bg); border-bottom:1px solid var(--border); min-height:38px;
      }
      .re__btn {
        display:inline-flex; align-items:center; justify-content:center;
        min-width:28px; height:26px; padding:0 6px;
        border:none; border-radius:4px; cursor:pointer;
        background:transparent; color:var(--text); font-size:0.76rem; font-weight:700;
        transition:background 0.1s; white-space:nowrap;
      }
      .re__btn:hover { background:var(--border); }
      .re__sep { width:1px; height:18px; background:var(--border); margin:0 4px; flex-shrink:0; }
      .re__body {
        overflow-y:auto;
        padding:18px 20px; outline:none;
        font-size:0.93rem; line-height:1.82; color:var(--text);
      }
      .re__body:empty::before {
        content:attr(data-ph); color:var(--muted); font-style:italic; pointer-events:none; display:block;
      }
      .re__foot {
        padding:4px 12px; background:var(--bg); border-top:1px solid var(--border);
        font-size:0.72rem; color:var(--muted);
      }

      /* ── Blog HTML content (editor body + view) ── */
      .bhtml { line-height:1.82; }
      .bhtml p   { margin:0 0 1em; }
      .bhtml p:last-child { margin-bottom:0; }
      .bhtml h1  { font-family:var(--font-head); font-size:1.5rem;  font-weight:800; margin:1.6em 0 0.45em; line-height:1.2; }
      .bhtml h2  { font-family:var(--font-head); font-size:1.2rem;  font-weight:700; margin:1.4em 0 0.4em;  line-height:1.25; }
      .bhtml h3  { font-family:var(--font-head); font-size:1rem;    font-weight:700; margin:1.2em 0 0.4em; }
      .bhtml h4  { font-family:var(--font-head); font-weight:700; margin:1em 0 0.35em; }
      .bhtml h1:first-child, .bhtml h2:first-child { margin-top:0; }
      .bhtml ul, .bhtml ol { margin:0 0 1em 1.4em; }
      .bhtml li  { margin-bottom:0.3em; }
      .bhtml strong, .bhtml b { font-weight:700; }
      .bhtml em,  .bhtml i { font-style:italic; }
      .bhtml u  { text-decoration:underline; }
      .bhtml s  { text-decoration:line-through; }
      .bhtml a  { color:var(--text); text-decoration:underline; text-underline-offset:2px; }
      .bhtml a:hover { opacity:0.7; }
      .bhtml hr { border:none; border-top:1px solid var(--border); margin:2em 0; }
      .bhtml blockquote {
        margin:1.2em 0; padding:14px 18px;
        border-left:3px solid var(--yellow); background:var(--bg);
        border-radius:0 var(--r) var(--r) 0; font-style:italic; color:var(--muted);
      }
      .bhtml blockquote p { margin:0; }
      .bhtml img  { max-width:100%; border-radius:var(--r); margin:0.5em 0; display:block; }
      .bhtml table { width:100%; border-collapse:collapse; margin:1em 0; font-size:0.88rem; }
      .bhtml th, .bhtml td { text-align:left; padding:8px 12px; border:1px solid var(--border); }
      .bhtml th { background:var(--bg); font-weight:700; }
      .bhtml code { font-family:monospace; font-size:0.88em; background:var(--bg); padding:1px 5px; border-radius:3px; border:1px solid var(--border); }
      .bhtml pre  { background:#1e1e1e; color:#d4d4d4; padding:14px 18px; border-radius:var(--r); overflow-x:auto; margin:1em 0; font-size:0.83em; }
      .bhtml pre code { background:none; border:none; padding:0; color:inherit; }
    `;
    document.head.appendChild(el);
  }, []);
}

// ── Data model ────────────────────────────────────────────────────────────────
const emptyPost = {
  id: '', title: '', slug: '', status: 'draft', content: '', updatedAt: '',
  category: '', tags: '', author: '',
  title_en: '', excerpt_en: '', content_en: '',
  imageUrl: '', imageAlt: '', featured: false,
  title_es: '', excerpt_es: '', content_es: '',
};

function newPostId() {
  return `blog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

// ── Small shared components ───────────────────────────────────────────────────
function StatusBadge({ status }) {
  const pub = status === 'published';
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px',
      borderRadius:4, fontSize:'0.72rem', fontWeight:700,
      background: pub ? '#f0fdf4' : 'var(--yellow-bg)',
      color:      pub ? 'var(--green)' : '#7a6400',
      border:     `1px solid ${pub ? '#bbf7d0' : 'var(--yellow-bd)'}`,
    }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background: pub ? 'var(--green)' : 'var(--yellow)', display:'inline-block' }} />
      {pub ? 'Published' : 'Draft'}
    </span>
  );
}

function TagChips({ tags, style }) {
  const list = String(tags || '').split(',').map(t => t.trim()).filter(Boolean);
  if (!list.length) return null;
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:4, ...style }}>
      {list.map(t => (
        <span key={t} style={{ padding:'2px 10px', borderRadius:20, background:'var(--bg)', border:'1px solid var(--border)', fontSize:'0.72rem', color:'var(--muted)' }}>
          {t}
        </span>
      ))}
    </div>
  );
}

function Card({ icon, title, children, right, collapsible, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div
        className="card__header"
        style={{ cursor: collapsible ? 'pointer' : 'default' }}
        onClick={() => collapsible && setOpen(o => !o)}
      >
        <span className="card__icon">{icon}</span>
        <span className="card__title">{title}</span>
        {right && <span style={{ marginLeft:'auto' }}>{right}</span>}
        {collapsible && (
          <span style={{ marginLeft: right ? 8 : 'auto', color:'var(--muted)', fontSize:'0.72rem' }}>
            <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} />
          </span>
        )}
      </div>
      {(!collapsible || open) && <div className="card__body">{children}</div>}
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

// ── Rich Text Editor ──────────────────────────────────────────────────────────
function RichTextEditor({ value, onChange, resetKey, placeholder = 'Start writing…', minH = 300 }) {
  const ref  = useRef(null);
  const [wc, setWc] = useState('0 words');

  // Initialize / reset when resetKey changes
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = value || '';
    refreshWc();
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default paragraph separator
  useEffect(() => { document.execCommand('defaultParagraphSeparator', false, 'p'); }, []);

  function refreshWc() {
    const txt = ref.current?.innerText || '';
    setWc(`${txt.split(/\s+/).filter(Boolean).length} words · ${txt.length} chars`);
  }

  // Prevent blur when clicking toolbar (mousedown fires before blur)
  const nd = fn => e => { e.preventDefault(); fn(); };

  const exec  = (cmd, val = null) => document.execCommand(cmd, false, val);
  const block = tag              => exec('formatBlock', `<${tag}>`);
  const link  = ()               => { const u = prompt('URL (https://…):'); if (u) exec('createLink', u); };

  const handleInput = () => { onChange(ref.current?.innerHTML || ''); refreshWc(); };

  return (
    <div className="re">
      {/* ── Toolbar ── */}
      <div className="re__bar">
        {/* Block format */}
        <button type="button" className="re__btn" title="Normal paragraph" onMouseDown={nd(() => block('p'))}>P</button>
        <button type="button" className="re__btn" title="Heading 1" onMouseDown={nd(() => block('h1'))}>H1</button>
        <button type="button" className="re__btn" title="Heading 2" onMouseDown={nd(() => block('h2'))}>H2</button>
        <button type="button" className="re__btn" title="Heading 3" onMouseDown={nd(() => block('h3'))}>H3</button>
        <div className="re__sep" />
        {/* Inline styles */}
        <button type="button" className="re__btn" title="Bold (⌘B)"        onMouseDown={nd(() => exec('bold'))}><i className="fa-solid fa-bold" /></button>
        <button type="button" className="re__btn" title="Italic (⌘I)"      onMouseDown={nd(() => exec('italic'))}><i className="fa-solid fa-italic" /></button>
        <button type="button" className="re__btn" title="Underline (⌘U)"   onMouseDown={nd(() => exec('underline'))}><i className="fa-solid fa-underline" /></button>
        <button type="button" className="re__btn" title="Strikethrough"    onMouseDown={nd(() => exec('strikeThrough'))}><i className="fa-solid fa-strikethrough" /></button>
        <div className="re__sep" />
        {/* Lists */}
        <button type="button" className="re__btn" title="Bullet list"      onMouseDown={nd(() => exec('insertUnorderedList'))}><i className="fa-solid fa-list-ul" /></button>
        <button type="button" className="re__btn" title="Numbered list"    onMouseDown={nd(() => exec('insertOrderedList'))}><i className="fa-solid fa-list-ol" /></button>
        <div className="re__sep" />
        {/* Block elements */}
        <button type="button" className="re__btn" title="Block quote"      onMouseDown={nd(() => block('blockquote'))}><i className="fa-solid fa-quote-left" /></button>
        <button type="button" className="re__btn" title="Horizontal rule"  onMouseDown={nd(() => exec('insertHorizontalRule'))}><i className="fa-solid fa-minus" /></button>
        <button type="button" className="re__btn" title="Insert link"      onMouseDown={nd(link)}><i className="fa-solid fa-link" /></button>
        <div className="re__sep" />
        {/* Text align */}
        <button type="button" className="re__btn" title="Align left"       onMouseDown={nd(() => exec('justifyLeft'))}><i className="fa-solid fa-align-left" /></button>
        <button type="button" className="re__btn" title="Align center"     onMouseDown={nd(() => exec('justifyCenter'))}><i className="fa-solid fa-align-center" /></button>
        <button type="button" className="re__btn" title="Align right"      onMouseDown={nd(() => exec('justifyRight'))}><i className="fa-solid fa-align-right" /></button>
        <div style={{ flex:1 }} />
        {/* Undo/redo + clear */}
        <button type="button" className="re__btn" title="Undo (⌘Z)"        onMouseDown={nd(() => exec('undo'))}><i className="fa-solid fa-rotate-left" /></button>
        <button type="button" className="re__btn" title="Redo (⌘⇧Z)"       onMouseDown={nd(() => exec('redo'))}><i className="fa-solid fa-rotate-right" /></button>
        <div className="re__sep" />
        <button type="button" className="re__btn" title="Clear formatting"  onMouseDown={nd(() => exec('removeFormat'))}><i className="fa-solid fa-eraser" /></button>
      </div>

      {/* ── Editable area ── */}
      <div
        ref={ref}
        className="re__body bhtml"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-ph={placeholder}
        style={{ minHeight: minH }}
      />

      {/* ── Footer / word count ── */}
      <div className="re__foot">{wc}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BlogPanel() {
  useBlogStyles();

  // ── URL routing ─────────────────────────────────────────────────────────────
  const { '*': splat = '' } = useParams();
  const navigate = useNavigate();

  const parts    = splat.split('/').filter(Boolean);
  const isNew    = parts[0] === 'new';
  const isEdit   = parts[1] === 'edit';
  const urlSlug  = (!isNew && parts[0]) ? parts[0] : null;
  const mode     = !parts[0] ? 'list' : isNew ? 'form' : isEdit ? 'form' : 'view';
  const currentSlug = urlSlug;

  function openView(slug)       { navigate(`/butlercoffee/blog/${slug}`); }
  function openForm(slug = null){ navigate(slug ? `/butlercoffee/blog/${slug}/edit` : '/butlercoffee/blog/new'); }
  function backToList()         { navigate('/butlercoffee/blog'); }

  // ── State ────────────────────────────────────────────────────────────────────
  const [posts,     setPosts]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [toasts,    setToasts]    = useState([]);
  const [form,      setForm]      = useState(emptyPost);
  const [search,    setSearch]    = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [resetCount, setResetCount] = useState(0);       // bumped on form init → triggers RichTextEditor reset
  const [pendingDeleteSlug,  setPendingDeleteSlug]  = useState(null);
  const [deleteConfirmText,  setDeleteConfirmText]  = useState('');
  const [viewLang,  setViewLang]  = useState('en');      // 'en' | 'es' — view language toggle
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'published' | 'draft'

  // ── Form initialization (same guard pattern as MachinesPanel) ───────────────
  const formKeyRef = useRef('');

  useEffect(() => {
    if (mode !== 'form') { formKeyRef.current = ''; return; }
    const key = currentSlug || 'new';
    if (formKeyRef.current === key) return;
    if (currentSlug && posts.length === 0) return;       // wait for data
    const post = currentSlug ? posts.find(p => p.slug === currentSlug) : null;
    if (currentSlug && !post) return;                    // not found yet
    setForm(post ? { ...emptyPost, ...post } : { ...emptyPost });
    setSlugManual(Boolean(post?.slug));
    setResetCount(c => c + 1);                           // signal editors to reset
    formKeyRef.current = key;
    window.scrollTo(0, 0);
  }, [mode, currentSlug, posts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── API ─────────────────────────────────────────────────────────────────────
  function toast(msg, type = 'success') {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }

  async function pullFromSheet(showToast = false) {
    setLoading(true);
    try {
      const data = await apiCall('GET', undefined, 'blog');
      setPosts(Array.isArray(data) ? data : []);
      if (showToast) toast('Synced from Google Sheet!');
    } catch (err) { toast(`Could not load posts — ${err.message}`, 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { pullFromSheet(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updateField(key, value) {
    setForm(f => {
      const next = { ...f, [key]: value };
      if (key === 'title' && !slugManual) next.slug = toSlug(value);
      return next;
    });
  }

  async function savePost(e, overrideStatus) {
    e?.preventDefault();
    const post = {
      ...form,
      id:        form.id || newPostId(),
      slug:      form.slug || toSlug(form.title),
      status:    overrideStatus || form.status,
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

  async function quickToggleFeatured(post) {
    const updated = { ...post, featured: !post.featured, updatedAt: new Date().toISOString() };
    setPosts(prev => prev.map(p => p.id === post.id ? updated : p)); // optimistic
    try { await apiCall('POST', { action: 'save', post: updated }, 'blog'); }
    catch (err) {
      setPosts(prev => prev.map(p => p.id === post.id ? post : p)); // rollback
      toast(`Update failed — ${err.message}`, 'error');
    }
  }

  async function deletePost() {
    if (!pendingDeleteSlug || deleteConfirmText !== 'DELETE') return;
    const post = posts.find(p => p.slug === pendingDeleteSlug);
    if (!post) return;
    setPendingDeleteSlug(null); setDeleteConfirmText('');
    setLoading(true);
    try {
      await apiCall('POST', { action: 'delete', id: post.id }, 'blog');
      setPosts(prev => prev.filter(p => p.id !== post.id));
      navigate('/butlercoffee/blog');
      toast('Post deleted.', 'error');
    } catch (err) { toast(`Delete failed — ${err.message}`, 'error'); }
    finally { setLoading(false); }
  }

  // ── Derived state ────────────────────────────────────────────────────────────
  const filtered = posts.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || [p.title, p.title_en, p.excerpt_en, p.category, p.tags, p.author].some(v => (v || '').toLowerCase().includes(q));
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const currentPost = currentSlug ? posts.find(p => p.slug === currentSlug) : null;
  const hasEnglish  = currentPost && (currentPost.title_en || currentPost.content_en);
  const hasSpanish  = currentPost && (currentPost.title_es || currentPost.content_es);

  // ──────────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════ LIST ══ */}
      {mode === 'list' && (
        <div>
          {/* Toolbar */}
          <div className="toolbar" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div className="search-wrap">
              <span className="search-wrap__icon"><i className="fa-solid fa-magnifying-glass" /></span>
              <input className="search-input" type="search" placeholder="Search posts…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {/* Status filter chips */}
            <div style={{ display:'flex', gap:4 }}>
              {[['all','All'],['published','Published'],['draft','Drafts']].map(([val, lbl]) => (
                <button
                  key={val} type="button"
                  onClick={() => setStatusFilter(val)}
                  style={{
                    padding:'3px 10px', borderRadius:20, border:'1px solid var(--border)',
                    background: statusFilter === val ? 'var(--yellow)' : 'transparent',
                    color: statusFilter === val ? '#7a6400' : 'var(--muted)',
                    fontWeight: 600, fontSize:'0.72rem', cursor:'pointer',
                  }}
                >{lbl}</button>
              ))}
            </div>
            <div style={{ flex:1 }} />
            <button className="btn btn--ghost btn--sm" onClick={() => pullFromSheet(true)} title="Pull from Sheet">
              <i className="fa-solid fa-cloud-arrow-down" style={{ marginRight:5 }} />Sync
            </button>
            <button className="btn btn--primary btn--sm" onClick={() => openForm(null)}>
              <i className="fa-solid fa-plus" style={{ marginRight:5 }} />New Post
            </button>
          </div>

          {/* Table */}
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th style={{ width:32 }} title="Featured"></th>
                <th>Title</th>
                <th style={{ width:120 }}>Category</th>
                <th style={{ width:110 }}>Status</th>
                <th style={{ width:120 }}>Updated</th>
                <th style={{ width:116 }}>Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="tr--clickable" onClick={() => openView(p.slug)}>
                    {/* Featured star */}
                    <td onClick={e => { e.stopPropagation(); quickToggleFeatured(p); }} style={{ textAlign:'center' }} title={p.featured ? 'Featured — click to unfeature' : 'Click to feature'}>
                      <i className={`fa-${p.featured ? 'solid' : 'regular'} fa-star`}
                        style={{ fontSize:'0.88rem', color: p.featured ? '#f59e0b' : 'var(--border)', cursor:'pointer' }} />
                    </td>
                    <td>
                      <div style={{ fontWeight:600, fontSize:'0.9rem' }}>
                        {p.title || '(Untitled)'}
                        {p.title_es && <span style={{ marginLeft:6, fontSize:'0.68rem', color:'var(--muted)', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:3, padding:'1px 5px' }}>ES</span>}
                      </div>
                      {(p.excerpt_en || p.excerpt_es) && <div className="td-sub" style={{ color:'var(--muted)', fontSize:'0.78rem', maxWidth:420, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.excerpt_en || p.excerpt_es}</div>}
                      {p.slug && <div className="td-sub" style={{ fontFamily:'monospace', fontSize:'0.72rem' }}>/blog/{p.slug}</div>}
                    </td>
                    <td>
                      {p.category
                        ? <span style={{ padding:'2px 8px', borderRadius:4, background:'var(--bg)', border:'1px solid var(--border)', fontSize:'0.72rem', color:'var(--muted)' }}>{p.category}</span>
                        : <span style={{ color:'var(--border)', fontSize:'0.72rem' }}>—</span>
                      }
                    </td>
                    <td><StatusBadge status={p.status} /></td>
                    <td style={{ color:'var(--muted)', fontSize:'0.78rem' }}>{formatDate(p.updatedAt)}</td>
                    <td>
                      <div className="td-actions" onClick={e => e.stopPropagation()}>
                        <button className="btn btn--ghost btn--sm btn--icon" onClick={() => openView(p.slug)} title="View"><i className="fa-regular fa-eye" /></button>
                        <button className="btn btn--ghost btn--sm btn--icon" onClick={() => openForm(p.slug)} title="Edit"><i className="fa-regular fa-pen-to-square" /></button>
                        <button className="btn btn--ghost btn--sm btn--icon" style={{ color:'var(--red)' }} onClick={() => setPendingDeleteSlug(p.slug)} title="Delete"><i className="fa-regular fa-trash-can" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="empty-state">
                <div className="empty-state__icon">✍️</div>
                <div className="empty-state__title">{search ? 'No posts match your search' : 'No posts yet'}</div>
                <div className="empty-state__text">{search ? 'Try a different keyword.' : 'Click "+ New Post" to write your first article.'}</div>
              </div>
            )}
          </div>

          {/* Stats bar */}
          {posts.length > 0 && (
            <div style={{ display:'flex', gap:16, marginTop:12, fontSize:'0.78rem', color:'var(--muted)' }}>
              <span>{posts.filter(p => p.status === 'published').length} published</span>
              <span>{posts.filter(p => p.status === 'draft').length} drafts</span>
              <span>{posts.filter(p => p.featured).length} featured</span>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ VIEW ══ */}
      {mode === 'view' && currentPost && (
        <div className="view-panel">
          {/* Header bar */}
          <div className="form-header" style={{ flexWrap:'wrap', gap:8 }}>
            <button className="form-header__back" onClick={backToList}>← Blog</button>
            <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, flexWrap:'wrap' }}>
              <StatusBadge status={currentPost.status} />
              {currentPost.featured && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:4, fontSize:'0.72rem', fontWeight:700, background:'#fff8e1', color:'#b45309', border:'1px solid #fde68a' }}>
                  <i className="fa-solid fa-star" style={{ color:'#f59e0b' }} /> Featured
                </span>
              )}
            </div>
            {/* Language toggle — show only available languages */}
            {(hasEnglish || hasSpanish) && (
              <div style={{ display:'flex', gap:4 }}>
                {[
                  ['base', '—'],
                  ...(hasEnglish ? [['en','EN']] : []),
                  ...(hasSpanish ? [['es','ES']] : []),
                ].map(([l,lbl]) => (
                  <button key={l} type="button" onClick={() => setViewLang(l)} style={{
                    padding:'3px 10px', borderRadius:4, border:'1px solid var(--border)', cursor:'pointer',
                    background: viewLang === l ? 'var(--yellow)' : 'transparent',
                    fontWeight:700, fontSize:'0.72rem', letterSpacing:'0.06em',
                  }}>{lbl}</button>
                ))}
              </div>
            )}
            <button className="btn btn--ghost btn--sm" onClick={() => openForm(currentPost.slug)}>
              <i className="fa-regular fa-pen-to-square" style={{ marginRight:5 }} />Edit
            </button>
          </div>

          {/* Meta row */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:12, padding:'10px 0 20px', borderBottom:'1px solid var(--border)', marginBottom:28, fontSize:'0.78rem', color:'var(--muted)' }}>
            <span><i className="fa-regular fa-clock" style={{ marginRight:4 }} />{formatDate(currentPost.updatedAt)}</span>
            {currentPost.author && <span><i className="fa-regular fa-user" style={{ marginRight:4 }} />{currentPost.author}</span>}
            {currentPost.category && <span><i className="fa-solid fa-folder" style={{ marginRight:4 }} />{currentPost.category}</span>}
            <span style={{ fontFamily:'monospace', fontSize:'0.72rem' }}>/blog/{currentPost.slug}</span>
          </div>

          {/* Article */}
          <div style={{ maxWidth:720 }}>
            {/* Hero image */}
            {currentPost.imageUrl && (
              <div style={{ marginBottom:28, borderRadius:'var(--r)', overflow:'hidden', maxHeight:360 }}>
                <img
                  src={currentPost.imageUrl}
                  alt={currentPost.imageAlt || currentPost.title}
                  style={{ width:'100%', height:360, objectFit:'cover', display:'block' }}
                />
              </div>
            )}

            {/* Yellow rule + title */}
            <div style={{ width:32, height:3, background:'var(--yellow)', borderRadius:2, marginBottom:18 }} />
            {(() => {
              const vt = viewLang === 'en' ? (currentPost.title_en   || currentPost.title)
                       : viewLang === 'es' ? (currentPost.title_es   || currentPost.title)
                       : currentPost.title;
              const ve = viewLang === 'en' ? currentPost.excerpt_en
                       : viewLang === 'es' ? currentPost.excerpt_es
                       : null;
              const vc = viewLang === 'en' ? (currentPost.content_en || currentPost.content)
                       : viewLang === 'es' ? (currentPost.content_es || currentPost.content)
                       : currentPost.content;
              return (
                <>
                  <h2 style={{
                    fontFamily:'var(--font-head)',
                    fontSize:'clamp(1.5rem,3vw,2.1rem)',
                    fontWeight:800, lineHeight:1.2,
                    margin:'0 0 20px', letterSpacing:'-0.02em',
                  }}>{vt}</h2>

                  {ve && (
                    <p style={{
                      fontSize:'1.02rem', lineHeight:1.65, color:'var(--muted)',
                      fontStyle:'italic', margin:'0 0 28px',
                      paddingBottom:20, borderBottom:'1px solid var(--border)',
                    }}>{ve}</p>
                  )}

                  <div
                    className="bhtml"
                    style={{ fontSize:'0.93rem', color:'var(--text)' }}
                    dangerouslySetInnerHTML={{
                      __html: vc || '<p style="color:var(--muted);font-style:italic">No content yet.</p>',
                    }}
                  />
                </>
              );
            })()}

            {/* Tags */}
            <TagChips tags={currentPost.tags} style={{ marginTop:32 }} />

            {/* Footer */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:40, paddingTop:20, borderTop:'1px solid var(--border)' }}>
              <button className="btn btn--ghost btn--sm" onClick={backToList}>← All articles</button>
              <span style={{ color:'var(--muted)', fontSize:'0.72rem' }}>Butler Coffee</span>
            </div>
          </div>
        </div>
      )}

      {/* View: not found */}
      {mode === 'view' && !currentPost && !loading && (
        <div className="empty-state" style={{ padding:'60px 24px' }}>
          <div className="empty-state__icon">🔍</div>
          <div className="empty-state__title">Post not found</div>
          <button className="btn btn--ghost btn--sm" style={{ marginTop:16 }} onClick={backToList}>← Back to Blog</button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ FORM ══ */}
      {mode === 'form' && (
        <div className="form-panel active">
          <div className="form-header">
            <button className="form-header__back" onClick={backToList}>← Back</button>
            <h1 className="form-header__title">{currentSlug ? 'Edit Post' : 'New Post'}</h1>
          </div>

          <form onSubmit={savePost}>
            <div className="form-grid">

              {/* ── LEFT column: article + translations ── */}
              <div style={{ minWidth: 0 }}>

                {/* ── Canonical / working draft ── */}
                <Card icon={<i className="fa-solid fa-pen-nib" />} title="Article">
                  <Field label="Title" required hint="Working title — used as fallback if language-specific titles are blank.">
                    <input
                      className="input"
                      required
                      value={form.title}
                      onChange={e => updateField('title', e.target.value)}
                      placeholder="e.g. How to Nail a Perfect V60"
                      style={{ fontSize:'1rem', fontWeight:600 }}
                    />
                  </Field>
                  <Field label="Body (canonical)" hint="Base content — used if the language version below is blank.">
                    <RichTextEditor
                      value={form.content}
                      onChange={v => updateField('content', v)}
                      resetKey={resetCount}
                      placeholder="Write a canonical draft here, or leave blank and fill the English version below…"
                      minH={280}
                    />
                  </Field>
                </Card>

                {/* ── English version ── */}
                <Card
                  icon="🇬🇧"
                  title="English Version"
                  collapsible
                  defaultOpen={Boolean(form.title_en || form.content_en)}
                >
                  <Field label="Title (EN)">
                    <input
                      className="input"
                      value={form.title_en || ''}
                      onChange={e => updateField('title_en', e.target.value)}
                      placeholder="English title…"
                    />
                  </Field>
                  <Field label="Excerpt (EN)" hint="Short summary for listings and SEO. Plain text.">
                    <textarea
                      className="textarea-input"
                      value={form.excerpt_en || ''}
                      onChange={e => updateField('excerpt_en', e.target.value)}
                      placeholder="One or two sentences that hook the reader…"
                      style={{ minHeight:72, resize:'vertical' }}
                    />
                  </Field>
                  <Field label="Content (EN)" hint="English version of the article body.">
                    <RichTextEditor
                      value={form.content_en}
                      onChange={v => updateField('content_en', v)}
                      resetKey={resetCount}
                      placeholder="Write the English version here…"
                      minH={300}
                    />
                  </Field>
                </Card>

                {/* ── Spanish version ── */}
                <Card
                  icon="🇪🇸"
                  title="Spanish Version"
                  collapsible
                  defaultOpen={Boolean(form.title_es || form.content_es)}
                >
                  <Field label="Título (ES)">
                    <input
                      className="input"
                      value={form.title_es || ''}
                      onChange={e => updateField('title_es', e.target.value)}
                      placeholder="Título en español…"
                    />
                  </Field>
                  <Field label="Resumen (ES)" hint="Breve descripción en español.">
                    <textarea
                      className="textarea-input"
                      value={form.excerpt_es || ''}
                      onChange={e => updateField('excerpt_es', e.target.value)}
                      placeholder="Resumen breve en español…"
                      style={{ minHeight:72, resize:'vertical' }}
                    />
                  </Field>
                  <Field label="Contenido (ES)" hint="Versión completa en español.">
                    <RichTextEditor
                      value={form.content_es}
                      onChange={v => updateField('content_es', v)}
                      resetKey={resetCount}
                      placeholder="Escribe aquí la versión en español…"
                      minH={300}
                    />
                  </Field>
                </Card>

              </div>

              {/* ── RIGHT column: settings ── */}
              <div style={{ minWidth: 0 }}>

                <Card icon={<i className="fa-solid fa-sliders" />} title="Settings">

                  {/* Status */}
                  <Field label="Status">
                    <div style={{ display:'flex', gap:8 }}>
                      {['draft','published'].map(s => (
                        <button
                          key={s} type="button"
                          onClick={() => updateField('status', s)}
                          style={{
                            flex:1, padding:'8px 0', borderRadius:'var(--r)', cursor:'pointer',
                            border: `1px solid ${form.status === s ? (s === 'published' ? '#bbf7d0' : 'var(--yellow-bd)') : 'var(--border)'}`,
                            background: form.status === s ? (s === 'published' ? '#f0fdf4' : 'var(--yellow-bg)') : 'transparent',
                            color: form.status === s ? (s === 'published' ? 'var(--green)' : '#7a6400') : 'var(--muted)',
                            fontWeight:700, fontSize:'0.82rem',
                          }}
                        >
                          {s === 'published' ? '✓ Published' : '○ Draft'}
                        </button>
                      ))}
                    </div>
                    <div className="field-hint">Draft posts are only visible in this admin.</div>
                  </Field>

                  {/* Featured */}
                  <Field label="Featured">
                    <button
                      type="button"
                      onClick={() => updateField('featured', !form.featured)}
                      style={{
                        display:'inline-flex', alignItems:'center', gap:8, padding:'7px 14px',
                        borderRadius:'var(--r)', cursor:'pointer',
                        border: `1px solid ${form.featured ? '#fde68a' : 'var(--border)'}`,
                        background: form.featured ? '#fff8e1' : 'transparent',
                      }}
                    >
                      <i className={`fa-${form.featured ? 'solid' : 'regular'} fa-star`}
                        style={{ color: form.featured ? '#f59e0b' : 'var(--muted)', fontSize:'1rem' }} />
                      <span style={{ fontSize:'0.82rem', fontWeight:700, color: form.featured ? '#b45309' : 'var(--muted)' }}>
                        {form.featured ? 'Featured post' : 'Not featured'}
                      </span>
                    </button>
                  </Field>

                  {/* Category */}
                  <Field label="Category">
                    <input
                      className="input"
                      value={form.category || ''}
                      onChange={e => updateField('category', e.target.value)}
                      placeholder="e.g. Brew Guides, Gear, Sourcing…"
                    />
                  </Field>

                  {/* Author */}
                  <Field label="Author">
                    <input
                      className="input"
                      value={form.author || ''}
                      onChange={e => updateField('author', e.target.value)}
                      placeholder="e.g. The Butler Team"
                    />
                  </Field>

                  {/* Tags */}
                  <Field label="Tags" hint="Comma-separated. e.g. espresso, technique, gear">
                    <input
                      className="input"
                      value={form.tags || ''}
                      onChange={e => updateField('tags', e.target.value)}
                      placeholder="tag1, tag2, tag3"
                    />
                    <TagChips tags={form.tags} style={{ marginTop:6 }} />
                  </Field>

                </Card>

                {/* ── Image ── */}
                <Card icon={<i className="fa-regular fa-image" />} title="Featured Image">
                  <Field label="Image URL" hint="Paste a direct image URL or a Google Drive thumbnail link.">
                    <input
                      className="input"
                      type="url"
                      value={form.imageUrl || ''}
                      onChange={e => updateField('imageUrl', e.target.value)}
                      placeholder="https://…"
                    />
                  </Field>
                  {form.imageUrl && (
                    <div style={{ marginBottom:12, borderRadius:'var(--r)', overflow:'hidden', border:'1px solid var(--border)' }}>
                      <img src={form.imageUrl} alt={form.imageAlt || 'Preview'} style={{ width:'100%', maxHeight:180, objectFit:'cover', display:'block' }} />
                    </div>
                  )}
                  <Field label="Image ALT text" hint="Describe the image for accessibility and SEO.">
                    <input
                      className="input"
                      value={form.imageAlt || ''}
                      onChange={e => updateField('imageAlt', e.target.value)}
                      placeholder="e.g. A barista pouring latte art"
                    />
                  </Field>
                </Card>

                {/* ── URL Slug ── */}
                <Card icon={<i className="fa-solid fa-link" />} title="URL">
                  <Field label="Slug" hint="Auto-generated from the title.">
                    <div className="slug-row">
                      <span className="slug-prefix">/blog/</span>
                      <input
                        className="input input--mono"
                        value={form.slug || ''}
                        onChange={e => {
                          setSlugManual(true);
                          updateField('slug', e.target.value.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,''));
                        }}
                        placeholder="post-slug"
                      />
                      <button
                        type="button" className="slug-regen" title="Regenerate from title"
                        onClick={() => { setSlugManual(false); updateField('slug', toSlug(form.title)); }}
                      >↺</button>
                    </div>
                  </Field>
                </Card>

              </div>
            </div>

            {/* ── Form actions ── */}
            <div className="form-actions-row">
              {currentSlug
                ? <button type="button" className="btn btn--danger btn--sm" onClick={() => setPendingDeleteSlug(currentSlug)}>
                    <i className="fa-regular fa-trash-can" style={{ marginRight:5 }} />Delete
                  </button>
                : <div />
              }
              <div style={{ flex:1 }} />
              <button type="button" className="btn btn--ghost btn--sm" onClick={backToList}>Cancel</button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => savePost(null, 'draft')}
              >
                <i className="fa-regular fa-floppy-disk" style={{ marginRight:5 }} />Save Draft
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => savePost(null, 'published')}
              >
                <i className="fa-solid fa-globe" style={{ marginRight:5 }} />
                {form.status === 'published' ? 'Update' : 'Publish'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Loading overlay ───────────────────────────────────────────────────── */}
      {loading && (
        <div className="loading-overlay" style={{ display:'flex' }}>
          <div className="loading-spinner" />
          <div className="loading-label">Syncing…</div>
        </div>
      )}

      {/* ── Toasts ───────────────────────────────────────────────────────────── */}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast--${t.type}`}>
            <span className="toast__icon">{t.type === 'success' ? '✓' : '✕'}</span>{t.msg}
          </div>
        ))}
      </div>

      {/* ── Delete dialog ─────────────────────────────────────────────────────── */}
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
