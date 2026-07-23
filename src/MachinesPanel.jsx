/**
 * MachinesPanel — full CRUD for the Machines catalogue.
 * Mounted at route `butlercoffee/machines/*` (wildcard keeps the component
 * alive across list / view / form navigation — no remount, no data refetch).
 *
 * URL scheme:
 *   /butlercoffee/machines            → list
 *   /butlercoffee/machines/new        → new-machine form
 *   /butlercoffee/machines/:id        → view
 *   /butlercoffee/machines/:id/edit   → edit form
 *
 * Images: upload manually to Drive, paste URL here (same system as Sub Levels).
 * Up to 6 images per machine. Drive folder for images:
 *   https://drive.google.com/drive/folders/1Ek32YHfrAmUryNTp4oz7Sz02tE4Jerz5
 *
 * Columns 11 (Profit) and 12 (Margin) in the Machines sheet are formula cells —
 * the GAS backend never overwrites them; we just read them back for display.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiCall } from './lib/api.js';
import { getCached, setCached, clearCached } from './lib/cache.js';

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

// ── Detect content format ─────────────────────────────────────────────────────
function isHtml(s) { return /^\s*<[a-zA-Z]/.test(s || ''); }

// ── HTML → Markdown converter (used when toggling editor mode) ────────────────
function htmlToMd(html) {
  if (!html) return '';
  if (!isHtml(html)) return html; // already markdown/plain text — pass through
  let s = html;
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n');
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n');
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n');
  s = s.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n');
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');
  s = s.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n\n> $1\n\n');
  s = s.replace(/<hr[^>]*\/?>/gi, '\n\n---\n\n');
  s = s.replace(/<\/(?:p|div|section|article)>/gi, '\n\n');
  s = s.replace(/<(?:p|div|section|article)[^>]*>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  s = s.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  s = s.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  s = s.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  s = s.replace(/<s[^>]*>([\s\S]*?)<\/s>/gi, '~~$1~~');
  s = s.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, '$1');
  s = s.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  s = s.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  return s;
}

// ── Inject shared rich-text editor CSS (same block/id blog uses — deduped) ────
function useRteStyles() {
  useEffect(() => {
    if (document.getElementById('blog-panel-styles')) return;
    const el = document.createElement('style');
    el.id = 'blog-panel-styles';
    el.textContent = `
      .re { border:1px solid var(--border); border-radius:var(--r); background:var(--card); }
      .re__bar { display:flex; flex-wrap:wrap; align-items:center; gap:1px; padding:5px 8px; background:var(--bg); border-bottom:1px solid var(--border); min-height:38px; position:sticky; top:0; z-index:15; border-radius:var(--r) var(--r) 0 0; }
      .re__btn { display:inline-flex; align-items:center; justify-content:center; min-width:28px; height:26px; padding:0 6px; border:none; border-radius:4px; cursor:pointer; background:transparent; color:var(--text); font-size:0.76rem; font-weight:700; transition:background 0.1s; }
      .re__btn:hover { background:var(--border); }
      .re__sep { width:1px; height:18px; background:var(--border); margin:0 4px; flex-shrink:0; }
      .re__body { overflow-y:auto; padding:18px 20px; outline:none; font-size:0.93rem; line-height:1.82; color:var(--text); }
      .re__body:empty::before { content:attr(data-ph); color:var(--muted); font-style:italic; pointer-events:none; display:block; }
      .re__foot { padding:4px 12px; background:var(--bg); border-top:1px solid var(--border); font-size:0.72rem; color:var(--muted); border-radius:0 0 var(--r) var(--r); }
      .ed-toggle { display:inline-flex; gap:2px; background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:2px; margin-bottom:6px; }
      .ed-toggle__btn { padding:3px 10px; border:none; border-radius:4px; cursor:pointer; background:transparent; color:var(--muted); font-size:0.72rem; font-weight:600; }
      .ed-toggle__btn--active { background:var(--yellow); color:#7a6400; }
      .bhtml { line-height:1.82; }
      .bhtml p   { margin:0 0 1em; }
      .bhtml p:last-child { margin-bottom:0; }
      .bhtml h1  { font-family:var(--font-head); font-size:1.5rem;  font-weight:800; margin:1.6em 0 0.45em; line-height:1.2; }
      .bhtml h2  { font-family:var(--font-head); font-size:1.2rem;  font-weight:700; margin:1.4em 0 0.4em; }
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
      .bhtml blockquote { margin:1.2em 0; padding:14px 18px; border-left:3px solid var(--yellow); background:var(--bg); border-radius:0 var(--r) var(--r) 0; font-style:italic; color:var(--muted); }
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

// ── Rich Text Editor (Visual / WYSIWYG) ───────────────────────────────────────
function RichTextEditor({ value, onChange, resetKey, placeholder = 'Start writing…', minH = 300 }) {
  const ref     = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [wc, setWc] = useState('0 words');

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = valueRef.current || '';
    refreshWc();
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { document.execCommand('defaultParagraphSeparator', false, 'p'); }, []);

  function refreshWc() {
    const txt = ref.current?.innerText || '';
    setWc(`${txt.split(/\s+/).filter(Boolean).length} words · ${txt.length} chars`);
  }

  const nd   = fn => e => { e.preventDefault(); fn(); };
  const exec  = (cmd, val = null) => document.execCommand(cmd, false, val);
  const block = tag              => exec('formatBlock', `<${tag}>`);
  const link  = ()               => { const u = prompt('URL (https://…):'); if (u) exec('createLink', u); };

  const handleInput = () => { onChange(ref.current?.innerHTML || ''); refreshWc(); };

  return (
    <div className="re">
      <div className="re__bar">
        <button type="button" className="re__btn" title="Normal"     onMouseDown={nd(() => block('p'))}>P</button>
        <button type="button" className="re__btn" title="Heading 1"  onMouseDown={nd(() => block('h1'))}>H1</button>
        <button type="button" className="re__btn" title="Heading 2"  onMouseDown={nd(() => block('h2'))}>H2</button>
        <button type="button" className="re__btn" title="Heading 3"  onMouseDown={nd(() => block('h3'))}>H3</button>
        <div className="re__sep" />
        <button type="button" className="re__btn" title="Bold (⌘B)"       onMouseDown={nd(() => exec('bold'))}><i className="fa-solid fa-bold" /></button>
        <button type="button" className="re__btn" title="Italic (⌘I)"     onMouseDown={nd(() => exec('italic'))}><i className="fa-solid fa-italic" /></button>
        <button type="button" className="re__btn" title="Underline (⌘U)"  onMouseDown={nd(() => exec('underline'))}><i className="fa-solid fa-underline" /></button>
        <button type="button" className="re__btn" title="Strikethrough"   onMouseDown={nd(() => exec('strikeThrough'))}><i className="fa-solid fa-strikethrough" /></button>
        <div className="re__sep" />
        <button type="button" className="re__btn" title="Bullet list"     onMouseDown={nd(() => exec('insertUnorderedList'))}><i className="fa-solid fa-list-ul" /></button>
        <button type="button" className="re__btn" title="Numbered list"   onMouseDown={nd(() => exec('insertOrderedList'))}><i className="fa-solid fa-list-ol" /></button>
        <div className="re__sep" />
        <button type="button" className="re__btn" title="Block quote"     onMouseDown={nd(() => block('blockquote'))}><i className="fa-solid fa-quote-left" /></button>
        <button type="button" className="re__btn" title="Divider"         onMouseDown={nd(() => exec('insertHorizontalRule'))}><i className="fa-solid fa-minus" /></button>
        <button type="button" className="re__btn" title="Insert link"     onMouseDown={nd(link)}><i className="fa-solid fa-link" /></button>
        <div className="re__sep" />
        <button type="button" className="re__btn" title="Align left"      onMouseDown={nd(() => exec('justifyLeft'))}><i className="fa-solid fa-align-left" /></button>
        <button type="button" className="re__btn" title="Align center"    onMouseDown={nd(() => exec('justifyCenter'))}><i className="fa-solid fa-align-center" /></button>
        <button type="button" className="re__btn" title="Align right"     onMouseDown={nd(() => exec('justifyRight'))}><i className="fa-solid fa-align-right" /></button>
        <div style={{ flex:1 }} />
        <button type="button" className="re__btn" title="Undo (⌘Z)"       onMouseDown={nd(() => exec('undo'))}><i className="fa-solid fa-rotate-left" /></button>
        <button type="button" className="re__btn" title="Redo (⌘⇧Z)"      onMouseDown={nd(() => exec('redo'))}><i className="fa-solid fa-rotate-right" /></button>
        <div className="re__sep" />
        <button type="button" className="re__btn" title="Clear formatting" onMouseDown={nd(() => exec('removeFormat'))}><i className="fa-solid fa-eraser" /></button>
      </div>
      <div ref={ref} className="re__body bhtml" contentEditable suppressContentEditableWarning
        onInput={handleInput} data-ph={placeholder} style={{ minHeight: minH }} />
      <div className="re__foot">{wc}</div>
    </div>
  );
}

// ── Markdown editor — Write tab (raw) + Preview tab (rendered) ───────────────
function MarkdownEditor({ value, onChange, placeholder, minH = 300 }) {
  const [tab, setTab] = useState('write');
  const txt = value || '';
  const wc  = txt.split(/\s+/).filter(Boolean).length;
  return (
    <div style={{ border:'1px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:2, padding:'4px 8px', background:'var(--bg)', borderBottom:'1px solid var(--border)' }}>
        {[['write','fa-pen','Write'],['preview','fa-eye','Preview']].map(([t, icon, label]) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{
            padding:'2px 10px', borderRadius:4, border:'none', cursor:'pointer',
            background: tab === t ? 'var(--card)' : 'transparent',
            color:      tab === t ? 'var(--text)' : 'var(--muted)',
            fontWeight: tab === t ? 700 : 400,
            fontSize:'0.73rem',
            boxShadow:  tab === t ? '0 1px 3px rgba(0,0,0,0.07)' : 'none',
          }}>
            <i className={`fa-solid ${icon}`} style={{ marginRight:4, fontSize:'0.7rem' }} />{label}
          </button>
        ))}
        <span style={{ marginLeft:'auto', fontSize:'0.68rem', color:'var(--muted)', opacity:0.65, fontFamily:'monospace' }}>
          **bold** · *italic* · # H1 · ## H2 · - list · &gt; quote · ---
        </span>
      </div>
      {tab === 'write' && (
        <textarea
          className="textarea-input"
          value={txt}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ minHeight:minH, borderRadius:0, border:'none', resize:'vertical',
                   fontFamily:'monospace', fontSize:'0.87rem', lineHeight:1.7, padding:'16px',
                   display:'block', width:'100%', boxSizing:'border-box' }}
        />
      )}
      {tab === 'preview' && (
        <div className="bhtml"
          style={{ minHeight:minH, padding:'18px 20px', fontSize:'0.93rem', lineHeight:1.82, color:'var(--text)' }}
          dangerouslySetInnerHTML={{ __html:
            renderMarkdown(txt) ||
            `<p style="color:var(--muted);font-style:italic">${placeholder || 'Nothing to preview yet.'}</p>`
          }}
        />
      )}
      <div style={{ padding:'4px 12px', background:'var(--bg)', borderTop:'1px solid var(--border)', fontSize:'0.72rem', color:'var(--muted)', display:'flex', gap:16 }}>
        <span>{wc} words</span><span>{txt.length} chars</span>
      </div>
    </div>
  );
}

// ── Content editor with Visual / Markdown toggle ──────────────────────────────
function ContentEditor({ value, onChange, mode, onModeChange, resetKey, placeholder, minH = 300 }) {
  function handleModeChange(newMode) {
    if (newMode === 'markdown' && isHtml(value)) {
      onChange(htmlToMd(value));
    }
    onModeChange(newMode);
  }
  return (
    <div>
      <div className="ed-toggle">
        <button type="button" className={`ed-toggle__btn${mode === 'wysiwyg'   ? ' ed-toggle__btn--active' : ''}`} onClick={() => handleModeChange('wysiwyg')}>
          <i className="fa-solid fa-wand-magic-sparkles" style={{ marginRight:4 }} />Visual
        </button>
        <button type="button" className={`ed-toggle__btn${mode === 'markdown'  ? ' ed-toggle__btn--active' : ''}`} onClick={() => handleModeChange('markdown')}>
          <i className="fa-solid fa-hashtag" style={{ marginRight:4 }} />Markdown
        </button>
      </div>
      {mode === 'wysiwyg'
        ? <RichTextEditor value={value} onChange={onChange} resetKey={`${resetKey}-v`} placeholder={placeholder} minH={minH} />
        : <MarkdownEditor value={value} onChange={onChange} placeholder={placeholder} minH={minH} />
      }
    </div>
  );
}

// ── Translate button ──────────────────────────────────────────────────────────
function TranslateBtn({ label, onClick, loading }) {
  return (
    <button type="button" disabled={loading} onClick={onClick} style={{
      display:'inline-flex', alignItems:'center', gap:6, padding:'4px 12px',
      borderRadius:'var(--r)', border:'1px solid var(--border)',
      background: loading ? 'var(--bg)' : 'var(--card)',
      cursor: loading ? 'not-allowed' : 'pointer',
      fontSize:'0.78rem', fontWeight:600, color:'var(--text)', opacity: loading ? 0.6 : 1,
    }}>
      {loading
        ? <><i className="fa-solid fa-circle-notch fa-spin" /> Translating…</>
        : <><i className="fa-solid fa-language" /> {label}</>
      }
    </button>
  );
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
  // Website display fields
  slug: '', taglineEN: '', taglineES: '', tagEN: '', tagES: '',
  tagVariant: '', idealEN: '', idealES: '', specsEN: '[]', specsES: '[]',
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
function Card({ icon, title, children, right }) {
  return (
    <div className="card">
      <div className="card__header">
        <span className="card__icon">{icon}</span>
        <span className="card__title">{title}</span>
        {right && <span style={{ marginLeft:'auto' }}>{right}</span>}
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
  useRteStyles();

  // ── URL routing ────────────────────────────────────────────────────────────
  const { '*': splat = '' } = useParams();
  const navigate = useNavigate();

  // Derive mode from URL splat
  // splat examples: '' → list | 'new' → form(new) | 'abc123' → view | 'abc123/edit' → form(edit)
  const splatParts  = splat.split('/').filter(Boolean);
  const isNew       = splatParts[0] === 'new';
  const isEdit      = splatParts[1] === 'edit';
  const urlId       = (!isNew && splatParts[0]) ? splatParts[0] : null;
  const mode        = !splatParts[0] ? 'list' : isNew ? 'form' : isEdit ? 'form' : 'view';
  const currentId   = urlId;

  // Navigation helpers
  function openView(id)        { navigate(`/butlercoffee/machines/${id}`); }
  function openForm(id = null) { navigate(id ? `/butlercoffee/machines/${id}/edit` : '/butlercoffee/machines/new'); }
  function backToList()        { navigate('/butlercoffee/machines'); }

  // ── Data state ─────────────────────────────────────────────────────────────
  const [machines,  setMachines]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [translating, setTranslating] = useState(false); // 'en'|'es'|false
  const [toasts,    setToasts]    = useState([]);
  const [form,      setForm]      = useState(emptyMachine);
  const [search,      setSearch]      = useState('');
  const [catFilter,   setCatFilter]   = useState('');
  const [areaFilter,  setAreaFilter]  = useState('');
  const [pendingDeleteId,   setPendingDeleteId]   = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [modeEN,  setModeEN]  = useState('wysiwyg'); // longDescEN editor format
  const [modeES,  setModeES]  = useState('wysiwyg'); // longDescES editor format
  const [resetEN, setResetEN] = useState(0);
  const [resetES, setResetES] = useState(0);

  // ── Form initialization ────────────────────────────────────────────────────
  // Track which ID the form was last initialized for so we don't reset mid-edit.
  const formKeyRef = useRef('');

  useEffect(() => {
    if (mode !== 'form') { formKeyRef.current = ''; return; }
    const key = currentId || 'new';
    if (formKeyRef.current === key) return; // already initialized for this key

    // If editing and machines haven't loaded yet, wait (effect re-runs when machines changes)
    if (currentId && machines.length === 0) return;

    const machine = currentId ? machines.find(m => m.id === currentId) : null;
    if (currentId && !machine) return; // ID not found yet — still loading

    setForm(machine ? { ...emptyMachine, ...machine } : { ...emptyMachine });
    // Default to Markdown. Only switch to Visual if the saved content is HTML.
    setModeEN(isHtml(machine?.longDescEN) ? 'wysiwyg' : 'markdown');
    setModeES(isHtml(machine?.longDescES) ? 'wysiwyg' : 'markdown');
    setResetEN(c => c + 1);
    setResetES(c => c + 1);
    formKeyRef.current = key;
    window.scrollTo(0, 0);
  }, [mode, currentId, machines]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── API calls ──────────────────────────────────────────────────────────────
  function toast(msg, type = 'success') {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }

  async function pullFromSheet(force = false) {
    if (!force) {
      const cached = getCached('machines');
      if (cached) { setMachines(cached); return; }
    }
    setLoading(true);
    try {
      const data = await apiCall('GET', undefined, 'machines');
      const list = Array.isArray(data) ? data : [];
      setMachines(list);
      setCached('machines', list);
      if (force) toast('Synced from Google Sheet!', 'success');
    } catch (err) {
      toast('Could not sync — check API URL.', 'error');
      console.error(err);
    } finally { setLoading(false); }
  }

  function handleMachinesPull() { clearCached('machines'); pullFromSheet(true); }

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

  useEffect(() => { pullFromSheet(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived list ───────────────────────────────────────────────────────────
  const filtered = machines
    .filter(m => {
      const q = search.toLowerCase();
      const textMatch = !q || [m.brand, m.name, m.model, m.category].some(v => (v||'').toLowerCase().includes(q));
      const areaMatch = !areaFilter || (m.areas || '').split(',').map(a => a.trim()).includes(areaFilter);
      return textMatch && (!catFilter || m.category === catFilter) && areaMatch;
    })
    .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

  const categories = [...new Set(machines.map(m => m.category).filter(Boolean))].sort();

  const allAreas = [...new Set(
    machines.flatMap(m => (m.areas || '').split(',').map(a => a.trim()).filter(Boolean))
  )].sort();

  // ── Form helpers ───────────────────────────────────────────────────────────
  function updateField(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  // ── Translation (bidirectional, mirrors BlogPanel) ────────────────────────
  async function autoTranslate(from, to) {
    const isFromEN = from === 'en';
    const suffixFrom = isFromEN ? 'EN' : 'ES';
    const suffixTo   = isFromEN ? 'ES' : 'EN';
    const lang = isFromEN ? 'English' : 'Spanish';

    const src = {
      subtitle: form[`subtitle${suffixFrom}`],
      shortDesc: form[`shortDesc${suffixFrom}`],
      longDesc: form[`longDesc${suffixFrom}`],
      feat01: form[`feat01${suffixFrom}`],
      feat02: form[`feat02${suffixFrom}`],
      feat03: form[`feat03${suffixFrom}`],
      feat04: form[`feat04${suffixFrom}`],
      feat05: form[`feat05${suffixFrom}`],
      feat06: form[`feat06${suffixFrom}`],
    };

    if (!Object.values(src).some(Boolean)) {
      toast(`Write the ${lang} version first, then translate.`, 'error');
      return;
    }

    setTranslating(to);
    try {
      const result = await apiCall('POST', { action: 'translate', from, to, fields: src }, 'machines');
      setForm(f => ({
        ...f,
        [`subtitle${suffixTo}`]:  result.subtitle  || f[`subtitle${suffixTo}`],
        [`shortDesc${suffixTo}`]: result.shortDesc || f[`shortDesc${suffixTo}`],
        [`longDesc${suffixTo}`]:  result.longDesc  || f[`longDesc${suffixTo}`],
        [`feat01${suffixTo}`]:    result.feat01    || f[`feat01${suffixTo}`],
        [`feat02${suffixTo}`]:    result.feat02    || f[`feat02${suffixTo}`],
        [`feat03${suffixTo}`]:    result.feat03    || f[`feat03${suffixTo}`],
        [`feat04${suffixTo}`]:    result.feat04    || f[`feat04${suffixTo}`],
        [`feat05${suffixTo}`]:    result.feat05    || f[`feat05${suffixTo}`],
        [`feat06${suffixTo}`]:    result.feat06    || f[`feat06${suffixTo}`],
      }));
      // GAS always returns plain text → Markdown mode for the target editor
      if (to === 'es') { setModeES('markdown'); setResetES(c => c + 1); }
      else              { setModeEN('markdown'); setResetEN(c => c + 1); }
      toast(`Translated to ${to === 'es' ? 'Spanish 🇪🇸' : 'English 🇨🇦'}! Review and edit as needed.`);
    } catch (err) {
      toast(`Translation failed — ${err.message}`, 'error');
    } finally { setTranslating(false); }
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
      navigate(`/butlercoffee/machines/${saved.id}`); // go to view after save
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
      navigate('/butlercoffee/machines'); // go to list after delete
      toast('Machine deleted.', 'error');
    } catch (err) { toast(`Delete failed — ${err.message}`, 'error'); }
    finally { setLoading(false); }
  }

  const currentMachine = currentId ? machines.find(m => m.id === currentId) : null;

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
            <select className="filter-select" value={areaFilter} onChange={e => setAreaFilter(e.target.value)}>
              <option value="">All areas</option>
              {allAreas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button className="btn btn--ghost btn--sm" onClick={handleMachinesPull} title="Pull from Sheet">
              <i className="fa-solid fa-cloud-arrow-down" style={{ marginRight:5 }} />Pull
            </button>
            <button className="btn btn--ghost btn--sm" onClick={pushToSheet} title="Push to Sheet">
              <i className="fa-solid fa-cloud-arrow-up" style={{ marginRight:5 }} />Push
            </button>
            <a
              href="https://drive.google.com/drive/folders/1Ek32YHfrAmUryNTp4oz7Sz02tE4Jerz5"
              target="_blank" rel="noreferrer"
              className="btn btn--ghost btn--sm"
              title="Open image folder in Drive"
            >📂 Images</a>
          </div>

          {/* Table */}
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th style={{ width:'35%' }}>Machine</th>
                <th>Areas of Use</th>
                <th style={{ textAlign:'right' }}>Sale Price</th>
                <th style={{ width:32, textAlign:'center' }}>★</th>
                <th style={{ width:80, textAlign:'center' }}>Payment Link</th>
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
                            {!m.visible && <span className="hidden-badge">HIDDEN</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="size-chips">
                          {(m.areas || '').split(',').map(a => a.trim()).filter(Boolean).map(a => (
                            <span className="size-chip" key={a}
                              style={{ cursor:'pointer' }}
                              onClick={e => { e.stopPropagation(); setAreaFilter(prev => prev === a ? '' : a); }}
                              title={areaFilter === a ? 'Clear filter' : `Filter by ${a}`}
                            >{a}</span>
                          ))}
                          {!m.areas && <span style={{ color:'var(--muted)', fontSize:'0.75rem' }}>—</span>}
                        </div>
                      </td>
                      <td style={{ textAlign:'right' }}>
                        {m.salePrice
                          ? <span className="size-chip" style={{ fontFamily:'monospace', fontWeight:700, fontSize:'0.85rem' }}>
                              €{parseFloat(m.salePrice).toFixed(2)}
                            </span>
                          : <span style={{ color:'var(--muted)', fontSize:'0.75rem' }}>—</span>
                        }
                      </td>
                      <td style={{ textAlign:'center', fontSize:'0.9rem', color:'var(--accent)' }}>
                        {m.featured ? '★' : ''}
                      </td>
                      <td style={{ textAlign:'center' }} onClick={e => e.stopPropagation()}>
                        {m.stripeLink
                          ? <a href={m.stripeLink} target="_blank" rel="noreferrer"
                              className="btn btn--ghost btn--sm btn--icon" title="Open payment link">🛒</a>
                          : <span style={{ color:'var(--muted)', fontSize:'0.75rem' }}>—</span>
                        }
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
            <button className="form-header__back" onClick={backToList}>← Back</button>
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
                  <div className="pricing-table-header" style={{ gridTemplateColumns:'1fr 1fr 1fr 1fr' }}>
                    <span>Cost €</span><span>Sale €</span><span>Profit</span><span>Margin</span>
                  </div>
                  {(() => {
                    const cost = parseFloat(currentMachine.cost);
                    const sale = parseFloat(currentMachine.salePrice);
                    const m    = calcMargin(cost, sale);
                    const cls  = m ? marginClass(m.marginPct) : 'margin--none';
                    return (
                      <div className="pricing-row" style={{ gridTemplateColumns:'1fr 1fr 1fr 1fr' }}>
                        <span className="pricing-ro">{!isNaN(cost) ? `€${cost.toFixed(2)}` : '—'}</span>
                        <span className="pricing-ro">{!isNaN(sale) ? `€${sale.toFixed(2)}` : '—'}</span>
                        <span className={`pricing-profit ${cls}`}>{m ? `€${m.marginAmt.toFixed(2)}` : '—'}</span>
                        <span className={`pricing-margin ${cls}`}>{m ? `${m.marginPct.toFixed(2)}%` : '—'}</span>
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
                      <span className="view-field-value">{parseFloat(currentMachine.vat).toFixed(2)}%</span>
                    </div>
                  )}
                  {currentMachine.profit && (
                    <div className="view-field">
                      <span className="view-field-label">Profit (sheet)</span>
                      <span className="view-field-value">€{parseFloat(currentMachine.profit).toFixed(2)}</span>
                    </div>
                  )}
                  {currentMachine.margin && (
                    <div className="view-field">
                      <span className="view-field-label">Margin (sheet)</span>
                      <span className="view-field-value">{parseFloat(currentMachine.margin).toFixed(2)}%</span>
                    </div>
                  )}
                </div>
              </Card>

              {/* Specs */}
              {(currentMachine.juraCoffees || currentMachine.areas || currentMachine.dailyOutput) && (
                <Card icon="📐" title="Specs">
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom: currentMachine.areas ? 12 : 0 }}>
                    {currentMachine.juraCoffees && (
                      <div className="view-field">
                        <span className="view-field-label">Jura Coffees</span>
                        <span className="view-field-value">{currentMachine.juraCoffees}</span>
                      </div>
                    )}
                    {currentMachine.dailyOutput && (
                      <div className="view-field">
                        <span className="view-field-label">Daily Output</span>
                        <span className="view-field-value">{currentMachine.dailyOutput}</span>
                      </div>
                    )}
                  </div>
                  {currentMachine.areas && (
                    <div>
                      <div style={{ fontSize:'0.75rem', color:'var(--muted)', fontWeight:600, marginBottom:6 }}>Areas of Use</div>
                      <div className="size-chips">
                        {currentMachine.areas.split(',').map(a => a.trim()).filter(Boolean).map(a => (
                          <span className="size-chip" key={a}>{a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {/* Payment Link */}
              {currentMachine.stripeLink && (
                <Card icon="💳" title="Stripe Payment Link">
                  <LinkBar link={currentMachine.stripeLink} />
                </Card>
              )}
            </div>

          </div>
        </div>
      )}

      {/* View: loading state (navigated directly to a URL before data loaded) */}
      {mode === 'view' && !currentMachine && !loading && (
        <div className="empty-state" style={{ padding:'60px 24px' }}>
          <div className="empty-state__icon">⚙️</div>
          <div className="empty-state__title">Machine not found</div>
          <div className="empty-state__text">
            <button className="btn btn--ghost btn--sm" onClick={backToList}>← Back to list</button>
          </div>
        </div>
      )}

      {/* ── Form ──────────────────────────────────────────────────────────────── */}
      {mode === 'form' && (
        <div id="form-panel" className="form-panel active">
          <div className="form-header">
            <button className="form-header__back" onClick={backToList}>← Back</button>
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

                <Card
                  icon="📖"
                  title="Content (EN) 🇨🇦"
                  right={
                    <TranslateBtn
                      label="Translate from ES 🇪🇸"
                      loading={translating === 'en'}
                      onClick={() => autoTranslate('es', 'en')}
                    />
                  }
                >
                  <Field label="Subtitle (EN)">
                    <input className="input" value={form.subtitleEN} onChange={e => updateField('subtitleEN', e.target.value)} placeholder="Short tagline…" />
                  </Field>
                  <Field label="Short Description (EN)">
                    <input className="input" value={form.shortDescEN} onChange={e => updateField('shortDescEN', e.target.value)} placeholder="One-liner for cards…" />
                  </Field>
                  <Field label="Long Description (EN)">
                    <ContentEditor
                      value={form.longDescEN}
                      onChange={v => updateField('longDescEN', v)}
                      mode={modeEN}
                      onModeChange={setModeEN}
                      resetKey={resetEN}
                      placeholder="Full product description…"
                      minH={220}
                    />
                  </Field>
                  <div className="field-row" style={{ gap:8 }}>
                    {['feat01EN','feat02EN','feat03EN','feat04EN','feat05EN','feat06EN'].map((k, i) => (
                      <Field key={k} label={`Feature ${i+1} (EN)`}>
                        <input className="input" value={form[k]} onChange={e => updateField(k, e.target.value)} placeholder={`Feature ${i+1}…`} style={{ fontSize:'0.82rem' }} />
                      </Field>
                    ))}
                  </div>
                </Card>

                <Card
                  icon="📖"
                  title="Content (ES) 🇪🇸"
                  right={
                    <TranslateBtn
                      label="Translate from EN 🇨🇦"
                      loading={translating === 'es'}
                      onClick={() => autoTranslate('en', 'es')}
                    />
                  }
                >
                  <Field label="Subtítulo (ES)">
                    <input className="input" value={form.subtitleES} onChange={e => updateField('subtitleES', e.target.value)} placeholder="Subtítulo corto…" />
                  </Field>
                  <Field label="Descripción corta (ES)">
                    <input className="input" value={form.shortDescES} onChange={e => updateField('shortDescES', e.target.value)} placeholder="Una línea para tarjetas…" />
                  </Field>
                  <Field label="Descripción larga (ES)">
                    <ContentEditor
                      value={form.longDescES}
                      onChange={v => updateField('longDescES', v)}
                      mode={modeES}
                      onModeChange={setModeES}
                      resetKey={resetES}
                      placeholder="Descripción completa del producto…"
                      minH={220}
                    />
                  </Field>
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
                    <Field label="Daily Output">
                      <input className="input" value={form.dailyOutput} onChange={e => updateField('dailyOutput', e.target.value)} placeholder="e.g. Up to 20 cups" />
                    </Field>
                  </div>
                  <Field label="Areas of Use" hint="Comma-separated — each value becomes a filterable pill. e.g. Home, Office, Small business">
                    <input className="input" value={form.areas} onChange={e => updateField('areas', e.target.value)} placeholder="e.g. Home, Office, Hotel…" />
                  </Field>
                  {form.areas && (
                    <div className="size-chips" style={{ marginTop:6 }}>
                      {form.areas.split(',').map(a => a.trim()).filter(Boolean).map(a => (
                        <span className="size-chip" key={a}>{a}</span>
                      ))}
                    </div>
                  )}
                </Card>

                <Card icon="💳" title="Stripe Payment Link">
                  <Field label="Payment URL" hint="Paste your Stripe payment or product link.">
                    <input className="input input--mono" value={form.stripeLink} onChange={e => updateField('stripeLink', e.target.value)} placeholder="https://buy.stripe.com/…" />
                  </Field>
                  {form.stripeLink && <LinkBar link={form.stripeLink} />}
                </Card>

                <Card icon="🌐" title="Website Display">
                  <Field label="Slug" hint="URL slug for this machine, e.g. jura-we8">
                    <input className="input input--mono" value={form.slug} onChange={e => updateField('slug', e.target.value)} placeholder="jura-we8" />
                  </Field>
                  <div className="field-row">
                    <Field label="Tag Label (EN)" hint="Card badge, e.g. Most Popular">
                      <input className="input" value={form.tagEN} onChange={e => updateField('tagEN', e.target.value)} placeholder="Entry Office" />
                    </Field>
                    <Field label="Tag Label (ES)">
                      <input className="input" value={form.tagES} onChange={e => updateField('tagES', e.target.value)} placeholder="Oficina Básica" />
                    </Field>
                  </div>
                  <Field label="Tag Style" hint="Controls badge colour on card">
                    <select className="input" value={form.tagVariant} onChange={e => updateField('tagVariant', e.target.value)}>
                      <option value="">Default (grey)</option>
                      <option value="yellow">Yellow (Most Popular)</option>
                      <option value="outline">Outline (High Volume)</option>
                    </select>
                  </Field>
                  <Field label="Tagline (EN)" hint="One-liner shown on the detail page">
                    <input className="input" value={form.taglineEN} onChange={e => updateField('taglineEN', e.target.value)} placeholder="The perfect first office machine." />
                  </Field>
                  <Field label="Tagline (ES)">
                    <input className="input" value={form.taglineES} onChange={e => updateField('taglineES', e.target.value)} placeholder="La máquina ideal para empezar…" />
                  </Field>
                  <Field label="Ideal For (EN)" hint="Shown on detail page, e.g. Teams of 5–20 people">
                    <input className="input" value={form.idealEN} onChange={e => updateField('idealEN', e.target.value)} placeholder="Teams of 5–20 people" />
                  </Field>
                  <Field label="Ideal For (ES)">
                    <input className="input" value={form.idealES} onChange={e => updateField('idealES', e.target.value)} placeholder="Equipos de 5–20 personas" />
                  </Field>
                  <Field label="Specs (EN)" hint='JSON array: [{"label":"Grinder","value":"Aroma G2"},…]'>
                    <textarea className="textarea-input" style={{ minHeight:80, fontFamily:'monospace', fontSize:'0.75rem' }}
                      value={form.specsEN} onChange={e => updateField('specsEN', e.target.value)} placeholder='[{"label":"Daily capacity","value":"30+ cups"}]' />
                  </Field>
                  <Field label="Specs (ES)">
                    <textarea className="textarea-input" style={{ minHeight:80, fontFamily:'monospace', fontSize:'0.75rem' }}
                      value={form.specsES} onChange={e => updateField('specsES', e.target.value)} placeholder='[{"label":"Capacidad diaria","value":"30+ tazas"}]' />
                  </Field>
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
              <button type="button" className="btn btn--ghost btn--sm" onClick={backToList}>Cancel</button>
              <button type="submit" className="btn btn--primary">Save Machine</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Loading overlay ───────────────────────────────────────────────────── */}
      {(loading || translating) && (
        <div className="loading-overlay" style={{ display:'flex' }}>
          <div className="loading-spinner" />
          <div className="loading-label">{translating ? 'Translating…' : 'Syncing with Google Sheet…'}</div>
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
