import { useEffect, useMemo, useState } from 'react';
import { apiCall } from './lib/api.js';
import LabelsPanel from './LabelsPanel.jsx';
import SubscriptionPanel from './SubscriptionPanel.jsx';
import { useAuth } from './AuthContext.jsx';

// ── Image helpers ─────────────────────────────────────────────────────────────
// Google's uc?export=view URL does NOT work reliably as a direct <img> src.
// The thumbnail endpoint does. toImageUrl() converts any Drive URL/ID to it.
const DRIVE_IMG_ID = '1LYVoFp3Y1jv2i1ow7G7nPxCCQQzLSVZp';
const DEFAULT_IMAGE = `https://drive.google.com/thumbnail?id=${DRIVE_IMG_ID}&sz=w400`;

function toImageUrl(url) {
  if (!url) return DEFAULT_IMAGE;
  // Match file ID in: /d/ID/view  |  ?id=ID  |  &id=ID
  const m = url.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
  // Bare file ID (no slashes or query chars)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim()))
    return `https://drive.google.com/thumbnail?id=${url.trim()}&sz=w400`;
  return url; // not a Drive URL — use as-is (e.g. https://... direct image)
}

// ── Data model ────────────────────────────────────────────────────────────────
const emptyCoffee = {
  id: '', name: '', subtitle: '', subtitle_es: '', slug: '',
  description: '', description_es: '',
  notes: '', recommended: '',
  origin: '', region: '', farm: '', farmer: '', altitude: '',
  variety: '', process: '', roast: '', roaster: '', level: '', bagSizes: [],
  image: '',
  cost1kg: '', cost500g: '', cost250g: '',
  sale1kg: '', sale500g: '', sale250g: '',
  visible: true,
  updatedAt: ''
};

const LEVEL_CLASSES = {
  'Base Coffee': 'level--base', 'Explorer Coffee': 'level--explorer',
  'Alpine Coffee': 'level--alpine', 'Summit Coffee': 'level--summit',
  'Decaf Coffee': 'level--decaf', 'SINGLE ORDER ONLY': 'level--single'
};

const CSV_COLS = [
  'id','name','subtitle','subtitle_es','slug',
  'description','description_es',
  'notes','recommended',
  'origin','region','farm','farmer','altitude',
  'variety','process','roast','roaster','level','bagSizes',
  'image',
  'cost1kg','cost500g','cost250g','sale1kg','sale500g','sale250g',
  'visible','updatedAt'
];

// ── Utilities ─────────────────────────────────────────────────────────────────
function newId() { return `bc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function toSlug(str = '') {
  return str.toLowerCase()
    .replace(/[àáâãäå]/g,'a').replace(/[èéêë]/g,'e').replace(/[ìíîï]/g,'i')
    .replace(/[òóôõö]/g,'o').replace(/[ùúûü]/g,'u').replace(/ñ/g,'n').replace(/ç/g,'c')
    .replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-');
}
function csvCell(val) {
  if (val == null) return '';
  const s = Array.isArray(val) ? val.join(';') : String(val);
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
function parseCSVLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

// ── Markdown renderer (lightweight — bold, italic, headings, bullet lists) ────
function renderMarkdown(md) {
  if (!md) return '';
  const esc    = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const inline = s => s
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,         '<em>$1</em>');
  return esc(md).split(/\n\n+/).map(block => {
    const lines = block.split('\n');
    // Heading
    if (lines.length === 1 && /^#{1,3} /.test(lines[0])) {
      const lvl = lines[0].match(/^(#+)/)[1].length;
      return `<h${lvl} class="md-h">${inline(lines[0].replace(/^#+\s+/, ''))}</h${lvl}>`;
    }
    // Bullet list
    if (lines.some(l => /^[\-\*] /.test(l.trim()))) {
      const items = lines.filter(l => l.trim())
        .map(l => `<li>${inline(l.replace(/^[\-\*] /, ''))}</li>`).join('');
      return `<ul class="md-ul">${items}</ul>`;
    }
    // Paragraph
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App({ onBackToHub }) {
  const [coffees, setCoffees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [panel, setPanel] = useState('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [form, setForm] = useState(emptyCoffee);
  const [slugManual, setSlugManual] = useState(false);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [roasterFilter, setRoasterFilter] = useState('');
  const [originFilter, setOriginFilter] = useState('');     // 'blend' | 'single' | ''
  const [visibilityFilter, setVisibilityFilter] = useState(''); // '' | 'visible' | 'hidden'
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  function toast(msg, type = 'success') {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }

  async function loadFromSheet(showToast = false) {
    setLoading(true);
    try {
      const data = await apiCall('GET');
      setCoffees(Array.isArray(data) ? data : []);
      if (showToast) toast('Synced from Google Sheet!', 'success');
    } catch (err) {
      toast('Could not connect to Sheet — check API URL.', 'error');
      console.error(err);
    } finally { setLoading(false); }
  }
  useEffect(() => { loadFromSheet(); }, []);

  const filtered = useMemo(() => coffees.filter(c => {
    const q = search.toLowerCase();
    const textMatch = !q || [c.name, c.subtitle, c.origin].some(v => (v||'').toLowerCase().includes(q));
    const isBlend = (c.origin || '').toLowerCase() === 'blend';
    const originMatch = !originFilter
      || (originFilter === 'blend'  && isBlend)
      || (originFilter === 'single' && !isBlend);
    const visMatch = !visibilityFilter
      || (visibilityFilter === 'visible' &&  c.visible)
      || (visibilityFilter === 'hidden'  && !c.visible);
    return textMatch
      && (!levelFilter  || c.level   === levelFilter)
      && (!roasterFilter || c.roaster === roasterFilter)
      && originMatch
      && visMatch;
  }), [coffees, search, levelFilter, roasterFilter, originFilter, visibilityFilter]);

  const stats = useMemo(() => coffees.reduce((acc, c) => {
    const key = c.level || 'Unlabeled'; acc[key] = (acc[key] || 0) + 1; return acc;
  }, {}), [coffees]);

  function updateField(key, value) {
    setForm(f => ({ ...f, [key]: value, ...(key === 'name' && !slugManual ? { slug: toSlug(value) } : {}) }));
  }
  function openView(id) {
    setCurrentId(id);
    setPanel('view');
    window.scrollTo(0, 0);
  }
  function openForm(id = null) {
    const coffee = id ? coffees.find(c => c.id === id) : null;
    setCurrentId(id);
    setForm(coffee ? { ...emptyCoffee, ...coffee, bagSizes: coffee.bagSizes || [] } : emptyCoffee);
    setSlugManual(Boolean(coffee?.slug));
    setPanel('form');
    window.scrollTo(0, 0);
  }
  function closeForm() { setPanel('list'); setCurrentId(null); setForm(emptyCoffee); }

  async function saveCoffee(e) {
    e.preventDefault();
    const coffee = { ...form, id: form.id || newId(), slug: form.slug || toSlug(form.name), updatedAt: new Date().toISOString() };
    setLoading(true);
    try {
      const saved = await apiCall('POST', { action: 'save', coffee });
      setCoffees(prev => prev.some(c => c.id === saved.id)
        ? prev.map(c => c.id === saved.id ? saved : c)
        : [saved, ...prev]);
      toast('Coffee saved!', 'success');
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
      await apiCall('POST', { action: 'delete', id });
      setCoffees(prev => prev.filter(c => c.id !== id));
      if (currentId) closeForm();
      toast('Coffee deleted.', 'error');
    } catch (err) { toast(`Delete failed — ${err.message}`, 'error'); }
    finally { setLoading(false); }
  }

  function exportCSV() {
    const csv = [CSV_COLS.join(','), ...coffees.map(c => CSV_COLS.map(k => csvCell(c[k])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `butler-coffee-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url); toast('Exported as CSV!', 'success');
  }

  function importCSV(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const lines = ev.target.result.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l => l.trim());
        if (lines.length < 2) throw new Error('Empty file');
        const headers = parseCSVLine(lines[0]);
        const imported = lines.slice(1).map(line => {
          const vals = parseCSVLine(line); const obj = {};
          headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
          obj.bagSizes = typeof obj.bagSizes === 'string' && obj.bagSizes
            ? obj.bagSizes.split(';').map(s => s.trim()).filter(Boolean) : [];
          obj.id ||= newId(); obj.updatedAt ||= new Date().toISOString(); return obj;
        });
        setLoading(true);
        await apiCall('POST', { action: 'import', coffees: imported });
        setCoffees(imported);
        toast(`Imported ${imported.length} coffees to Sheet!`, 'success');
      } catch (err) { toast(`Import failed — ${err.message}`, 'error'); }
      finally { setLoading(false); }
    };
    reader.readAsText(file); e.target.value = '';
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = async ev => {
      // Show local preview immediately while uploading
      const dataUrl = ev.target.result;
      setForm(f => ({ ...f, image: dataUrl }));
      setLoading(true);
      try {
        const base64 = dataUrl.split(',')[1];
        const result = await apiCall('POST', { action: 'uploadImage', filename: file.name, mimeType: file.type, data: base64 });
        setForm(f => ({ ...f, image: result.url }));
        toast('Image uploaded to Drive!', 'success');
      } catch (err) {
        toast(`Upload failed — ${err.message}`, 'error');
        // Keep local preview so work isn't lost
      } finally { setLoading(false); }
    };
    reader.readAsDataURL(file);
  }

  const { logout } = useAuth();
  const isCoffeePanel = ['list','view','form'].includes(panel);
  const isSubsPanel   = panel === 'subs';
  const sc = sidebarCollapsed;

  return <>
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
          {!sc && <div className="nav-section__label">Catalog</div>}
          <button
            className={`nav-link${isCoffeePanel ? ' active' : ''}`}
            onClick={() => setPanel('list')}
            title="Coffee"
          >
            <span className="nav-link__icon"><i className="fa-solid fa-mug-hot" /></span>
            {!sc && <><span>Coffee</span><span className="nav-link__badge">{coffees.length}</span></>}
          </button>
          <button
            className={`nav-link${panel === 'subs' ? ' active' : ''}`}
            onClick={() => setPanel('subs')}
            title="Subscriptions"
          >
            <span className="nav-link__icon"><i className="fa-solid fa-layer-group" /></span>
            {!sc && <span>Subscriptions</span>}
          </button>
          <button className="nav-link nav-link--soon" title="Coming soon">
            <span className="nav-link__icon"><i className="fa-solid fa-gears" /></span>
            {!sc && <><span>Machines</span><span className="nav-link__badge">soon</span></>}
          </button>
          <button className="nav-link nav-link--soon" title="Coming soon">
            <span className="nav-link__icon"><i className="fa-solid fa-pen-nib" /></span>
            {!sc && <><span>Blog</span><span className="nav-link__badge">soon</span></>}
          </button>
        </div>

        <div className="nav-section">
          {!sc && <div className="nav-section__label">Tools</div>}
          <button
            className={`nav-link${panel === 'labels' ? ' active' : ''}`}
            onClick={() => setPanel('labels')}
            title="Label Generator"
          >
            <span className="nav-link__icon"><i className="fa-solid fa-tag" /></span>
            {!sc && <span>Label Generator</span>}
          </button>
          <button className="nav-link" onClick={() => loadFromSheet(true)} title="Sync">
            <span className="nav-link__icon"><i className="fa-solid fa-rotate" /></span>
            {!sc && <span>Sync</span>}
          </button>
          <button className="nav-link" onClick={exportCSV} title="Export CSV">
            <span className="nav-link__icon"><i className="fa-solid fa-download" /></span>
            {!sc && <span>Export CSV</span>}
          </button>
          <button className="nav-link" onClick={() => document.getElementById('import-file').click()} title="Import CSV">
            <span className="nav-link__icon"><i className="fa-solid fa-upload" /></span>
            {!sc && <span>Import CSV</span>}
          </button>
          <input type="file" id="import-file" accept=".csv" style={{ display:'none' }} onChange={importCSV} />
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

    <div className={`main${sc ? ' main--collapsed' : ''}`}>
      <div className="topbar">
        <div className="topbar__left">
          <span className="topbar__title">
            {panel === 'home'   ? 'Butler Coffee'
              : panel === 'labels' ? 'Label Generator'
              : panel === 'subs'   ? 'Subscriptions'
              : 'Coffee'}
          </span>
          {isCoffeePanel && <span className="topbar__count">{coffees.length} entr{coffees.length === 1 ? 'y' : 'ies'}</span>}
        </div>
        <div className="topbar__right">
          {panel === 'list' && <button className="btn btn--primary" onClick={() => openForm(null)}>+ Add Coffee</button>}
        </div>
      </div>
      <div className="content">
        {panel === 'home'
          ? <HomePanel setPanel={setPanel} />
          : panel === 'labels'
          ? <LabelsPanel coffees={coffees} />
          : panel === 'subs'
          ? <SubscriptionPanel />
          : panel === 'list'
          ? <ListPanel {...{ stats, search, setSearch, levelFilter, setLevelFilter, roasterFilter, setRoasterFilter, originFilter, setOriginFilter, visibilityFilter, setVisibilityFilter, filtered, openForm, openView, setPendingDeleteId }} />
          : panel === 'view'
          ? <ViewPanel coffee={coffees.find(c => c.id === currentId)} onBack={closeForm} onEdit={openForm} />
          : <FormPanel {...{ form, updateField, slugManual, setSlugManual, saveCoffee, closeForm, currentId, setPendingDeleteId, onImageUpload: handleImageUpload }} />
        }
      </div>
    </div>

    {loading && <div className="loading-overlay" style={{ display:'flex' }}><div className="loading-spinner" /><div className="loading-label">Syncing with Google Sheet…</div></div>}
    <div className="toast-wrap">{toasts.map(t => <div key={t.id} className={`toast toast--${t.type}`}><span className="toast__icon">{t.type==='success'?'✓':'✕'}</span>{t.msg}</div>)}</div>
    {pendingDeleteId && <div className="dialog-overlay open"><div className="dialog">
      <div className="dialog__title">Delete this coffee?</div>
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
    </div></div>}
  </>;
}

// ── Home Panel (Butler Coffee sub-landing) ────────────────────────────────────
function HomePanel({ setPanel }) {
  const SECTIONS = [
    {
      id: 'list',
      icon: 'fa-mug-hot',
      title: 'Coffee',
      description: 'Browse and manage the coffee catalog',
      soon: false,
    },
    {
      id: 'labels',
      icon: 'fa-tag',
      title: 'Labels',
      description: 'Generate bag labels for any roast',
      soon: false,
    },
    {
      id: 'subs',
      icon: 'fa-layer-group',
      title: 'Subscriptions',
      description: 'Subscription tiers, pricing & buy links',
      soon: false,
    },
    {
      id: null,
      icon: 'fa-gears',
      title: 'Machines',
      description: 'Equipment catalogue',
      soon: true,
    },
    {
      id: null,
      icon: 'fa-pen-nib',
      title: 'Blog',
      description: 'Articles and content',
      soon: true,
    },
  ];

  return (
    <div className="home-panel">
      <div className="home-panel__header">
        <h1 className="home-panel__title">Butler Coffee</h1>
        <p className="home-panel__sub">Admin Dashboard</p>
      </div>
      <div className="app-grid">
        {SECTIONS.map(s => (
          <div
            key={s.title}
            className={`app-card${s.soon ? ' app-card--soon' : ''}`}
            onClick={() => !s.soon && s.id && setPanel(s.id)}
            title={s.soon ? 'Coming soon' : undefined}
          >
            <div className="app-card__icon"><i className={`fa-solid ${s.icon}`} /></div>
            <div className="app-card__body">
              <div className="app-card__name">{s.title}</div>
              <div className="app-card__desc">{s.description}</div>
            </div>
            {s.soon
              ? <div className="app-card__badge">Soon</div>
              : <div className="app-card__arrow"><i className="fa-solid fa-arrow-right" /></div>
            }
          </div>
        ))}
      </div>
    </div>
  );
}

// ── List Panel ────────────────────────────────────────────────────────────────
function ListPanel({ stats, search, setSearch, levelFilter, setLevelFilter, roasterFilter, setRoasterFilter, originFilter, setOriginFilter, visibilityFilter, setVisibilityFilter, filtered, openForm, openView, setPendingDeleteId }) {
  function toggleLevel(level) {
    setLevelFilter(prev => prev === level ? '' : level);
  }
  return (
    <div id="list-panel">
      {/* Clickable level pills */}
      <div className="stats-row">
        {Object.entries(stats).map(([k, v]) => (
          <div
            key={k}
            className={`stat-pill${levelFilter === k ? ' stat-pill--active' : ''}`}
            onClick={() => toggleLevel(k)}
            title={levelFilter === k ? 'Clear filter' : `Filter by ${k}`}
          >
            <strong>{v}</strong> {k.replace(' Coffee', '')}
          </div>
        ))}
        {levelFilter && (
          <div className="stat-pill stat-pill--clear" onClick={() => setLevelFilter('')} title="Clear filter">
            ✕ Clear
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-wrap">
          <span className="search-wrap__icon">🔍</span>
          <input className="search-input" type="search" placeholder="Search coffees…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={originFilter} onChange={e => setOriginFilter(e.target.value)}>
          <option value="">All Origins</option>
          <option value="single">Single Origin only</option>
          <option value="blend">Blends only</option>
        </select>
        <select className="filter-select" value={visibilityFilter} onChange={e => setVisibilityFilter(e.target.value)}>
          <option value="">All visibility</option>
          <option value="visible">Visible only</option>
          <option value="hidden">Hidden only</option>
        </select>
        <select className="filter-select" value={roasterFilter} onChange={e => setRoasterFilter(e.target.value)}>
          <option value="">All roasters</option>
          <option value="DABOV Specialty Coffee">DABOV Specialty Coffee</option>
        </select>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th style={{width:'30%'}}>Coffee</th>
            <th>Level</th>
            <th>Process</th>
            <th>Origin</th>
            <th>Sizes</th>
            <th style={{width:116}}>Actions</th>
          </tr></thead>
          <tbody>{filtered.map(c => (
            <tr key={c.id} className="tr--clickable" onClick={() => openView(c.id)}>
              <td>
                <div className="td-name-row">
                  <span className="td-name">{c.name || '—'}</span>
                  {!c.visible && <span className="hidden-badge">HIDDEN</span>}
                </div>
                {c.subtitle && <div className="td-sub">{c.subtitle}</div>}
              </td>
              <td>{c.level ? <span className={`level-badge ${LEVEL_CLASSES[c.level]||''}`}>{c.level.replace(' Coffee','')}</span> : '—'}</td>
              <td style={{color:'var(--muted)',fontSize:'0.8rem'}}>{c.process||'—'}</td>
              <td style={{color:'var(--muted)',fontSize:'0.8rem'}}>{c.origin||'—'}</td>
              <td><div className="size-chips">{c.bagSizes?.length ? c.bagSizes.map(s => <span className="size-chip" key={s}>{s}</span>) : '—'}</div></td>
              <td><div className="td-actions" onClick={e => e.stopPropagation()}>
                <button className="btn btn--ghost btn--sm btn--icon" onClick={() => openView(c.id)} title="View details">👁️</button>
                <button className="btn btn--ghost btn--sm btn--icon" onClick={() => openForm(c.id)} title="Edit">✏️</button>
                <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setPendingDeleteId(c.id)} title="Delete" style={{color:'var(--red)'}}>🗑️</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table>
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">☕</div>
            <div className="empty-state__title">No coffees found</div>
            <div className="empty-state__text">Try adjusting your filters or search.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── View Panel ────────────────────────────────────────────────────────────────
function ViewPanel({ coffee, onBack, onEdit }) {
  if (!coffee) return (
    <div className="view-panel">
      <div className="form-header">
        <button className="form-header__back" onClick={onBack}>← Back</button>
        <h1 className="form-header__title">Coffee not found</h1>
      </div>
    </div>
  );

  const SIZES = [
    { key: '1kg',  label: '1 kg'  },
    { key: '500g', label: '500 g' },
    { key: '250g', label: '250 g' },
  ];

  function ViewField({ label, value }) {
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
        <h1 className="form-header__title">{coffee.name || 'Untitled'}</h1>
        <button className="btn btn--ghost btn--sm" style={{marginLeft:'auto'}} onClick={() => onEdit(coffee.id)}>✏️ Edit</button>
      </div>

      {!coffee.visible && (
        <div className="visibility-warning">
          <span>⚠️</span>
          <span>This coffee is <strong>not visible</strong> on the public website.</span>
        </div>
      )}

      <div className="form-grid">

        {/* ── LEFT COLUMN ── */}
        <div>
          <div className="card">
            <div className="card__header"><span className="card__icon">✏️</span><span className="card__title">Identity</span></div>
            <div className="card__body">
              <div className="view-name">{coffee.name}</div>
              {coffee.subtitle && (
                <div className="view-subtitle-es-wrap">
                  <span className="view-lang-tag">🇨🇦</span>
                  <span className="view-subtitle">{coffee.subtitle}</span>
                </div>
              )}
              {coffee.subtitle_es && (
                <div className="view-subtitle-es-wrap">
                  <span className="view-lang-tag">🇪🇸</span>
                  <span className="view-subtitle view-subtitle--es">{coffee.subtitle_es}</span>
                </div>
              )}
              {coffee.slug && <div className="view-slug">/coffee/{coffee.slug}</div>}
            </div>
          </div>

          {(coffee.description || coffee.description_es) && (
            <div className="card">
              <div className="card__header"><span className="card__icon">📖</span><span className="card__title">Description</span></div>
              <div className="card__body">
                {coffee.description && (
                  <div className="view-description-es-block" style={{paddingTop:0,borderTop:'none',marginTop:0}}>
                    <div className="view-lang-divider"><span className="view-lang-tag">🇨🇦 English</span></div>
                    <div className="view-description md-rendered"
                      dangerouslySetInnerHTML={{__html: renderMarkdown(coffee.description)}} />
                  </div>
                )}
                {coffee.description_es && (
                  <div className="view-description-es-block">
                    <div className="view-lang-divider"><span className="view-lang-tag">🇪🇸 Español</span></div>
                    <div className="view-description view-description--es md-rendered"
                      dangerouslySetInnerHTML={{__html: renderMarkdown(coffee.description_es)}} />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card__header"><span className="card__icon">☕</span><span className="card__title">Coffee Details</span></div>
            <div className="card__body">
              {coffee.notes && (
                <div className="view-field" style={{marginBottom:12}}>
                  <span className="view-field-label">Tasting Notes</span>
                  <span className="view-field-value">{coffee.notes}</span>
                </div>
              )}
              {coffee.recommended && (
                <div className="view-field" style={{marginBottom:14}}>
                  <span className="view-field-label">Recommended For</span>
                  <span className="view-field-value">{coffee.recommended}</span>
                </div>
              )}
              <div className="view-detail-grid">
                <ViewField label="Origin" value={coffee.origin} />
                <ViewField label="Region" value={coffee.region} />
                <ViewField label="Farm" value={coffee.farm} />
                <ViewField label="Farmer" value={coffee.farmer} />
                <ViewField label="Altitude" value={coffee.altitude ? `${coffee.altitude} m` : ''} />
                <ViewField label="Variety" value={coffee.variety} />
                <ViewField label="Process" value={coffee.process} />
                <ViewField label="Roast" value={coffee.roast} />
                <ViewField label="Roasted By" value={coffee.roaster} />
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div>
          {/* Image */}
          <div className="card">
            <div className="card__header"><span className="card__icon">🖼️</span><span className="card__title">Image</span></div>
            <div className="card__body" style={{padding:0}}>
              <div className="view-img-wrap">
                <img
                  src={toImageUrl(coffee.image)}
                  alt={coffee.name}
                  onError={e => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            </div>
          </div>

          {/* Subscription */}
          <div className="card">
            <div className="card__header"><span className="card__icon">📦</span><span className="card__title">Subscription</span></div>
            <div className="card__body">
              {coffee.level && (
                <div className="view-field" style={{marginBottom:12}}>
                  <span className="view-field-label">Level</span>
                  <span className={`level-badge ${LEVEL_CLASSES[coffee.level] || ''}`} style={{marginTop:4,display:'inline-block'}}>{coffee.level.replace(' Coffee','')}</span>
                </div>
              )}
              {coffee.bagSizes?.length > 0 && (
                <div className="view-field">
                  <span className="view-field-label">Bag Sizes</span>
                  <div className="size-chips" style={{marginTop:4}}>
                    {coffee.bagSizes.map(s => <span className="size-chip" key={s}>{s}</span>)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pricing — read-only */}
          <div className="card">
            <div className="card__header"><span className="card__icon">💶</span><span className="card__title">Pricing</span></div>
            <div className="card__body">
              <div className="pricing-table">
                <div className="pricing-table-header">
                  <span>Size</span><span>Cost €</span><span>Sale €</span><span>Profit</span><span>Margin</span>
                </div>
                {SIZES.map(({ key, label }) => {
                  const cost   = parseFloat(coffee[`cost${key}`]);
                  const sale   = parseFloat(coffee[`sale${key}`]);
                  const profit = !isNaN(cost) && !isNaN(sale) ? sale - cost : null;
                  const margin = profit !== null && sale > 0 ? (profit / sale * 100) : null;
                  const cls    = margin === null ? 'margin--none'
                               : margin >= 50   ? 'margin--good'
                               : margin >= 40   ? 'margin--ok'
                               :                  'margin--low';
                  const hasCost = !isNaN(cost);
                  const hasSale = !isNaN(sale);
                  if (!hasCost && !hasSale) return null;
                  return (
                    <div className="pricing-row" key={key}>
                      <span className="pricing-size">{label}</span>
                      <span className="pricing-ro">{hasCost ? `€${cost.toFixed(2)}` : '—'}</span>
                      <span className="pricing-ro">{hasSale ? `€${sale.toFixed(2)}` : '—'}</span>
                      <span className={`pricing-profit ${cls}`}>{profit !== null ? `€${profit.toFixed(2)}` : '—'}</span>
                      <span className={`pricing-margin ${cls}`}>{margin !== null ? `${margin.toFixed(1)}%` : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Form Panel ────────────────────────────────────────────────────────────────
function FormPanel({ form, updateField, setSlugManual, saveCoffee, closeForm, currentId, setPendingDeleteId, onImageUpload }) {
  const toggleSize = size => updateField('bagSizes',
    form.bagSizes.includes(size) ? form.bagSizes.filter(s => s !== size) : [...form.bagSizes, size]);

  return (
    <div id="form-panel" className="form-panel active">
      <div className="form-header">
        <button className="form-header__back" onClick={closeForm}>← Back</button>
        <h1 className="form-header__title">{currentId ? 'Edit Coffee' : 'New Coffee'}</h1>
      </div>
      <form onSubmit={saveCoffee}>
        <div className="form-grid">

          {/* ── LEFT COLUMN ── */}
          <div>
            <Card icon="✏️" title="Identity">
              <Field label="Coffee Name" required>
                <input className="input" required value={form.name} onChange={e => updateField('name', e.target.value)} />
              </Field>
              <div className="field-row">
                <Field label="Subtitle (EN) 🇨🇦">
                  <input className="input" value={form.subtitle} onChange={e => updateField('subtitle', e.target.value)} />
                </Field>
                <Field label="Subtitle (ES) 🇪🇸">
                  <input className="input" value={form.subtitle_es || ''} onChange={e => updateField('subtitle_es', e.target.value)} placeholder="Subtítulo en español…" />
                </Field>
              </div>
              <Field label="Slug">
                <div className="slug-row">
                  <span className="slug-prefix">/coffee/</span>
                  <input className="input input--mono" value={form.slug} onChange={e => { setSlugManual(true); updateField('slug', e.target.value); }} />
                  <button type="button" className="slug-regen" onClick={() => { setSlugManual(false); updateField('slug', toSlug(form.name)); }}>↺</button>
                </div>
                <div className="field-hint">Auto-generated from Coffee Name. Edit manually if needed.</div>
              </Field>
            </Card>

            <Card icon="📖" title="Description">
              <MarkdownField
                label="Description (EN) 🇨🇦"
                value={form.description}
                onChange={v => updateField('description', v)}
              />
              <MarkdownField
                label="Description (ES) 🇪🇸"
                value={form.description_es || ''}
                onChange={v => updateField('description_es', v)}
                placeholder="Descripción en español…"
              />
            </Card>

            <Card icon="☕" title="Coffee Details">
              <div className="field-row">
                <Field label="Tasting Notes">
                  <input className="input" value={form.notes} onChange={e => updateField('notes', e.target.value)} />
                  <div className="field-hint">Comma-separated.</div>
                </Field>
                <Field label="Recommended For">
                  <input className="input" value={form.recommended} onChange={e => updateField('recommended', e.target.value)} />
                  <div className="field-hint">Brew methods.</div>
                </Field>
              </div>
              <div className="field-row">
                <Field label="Country / Origin">
                  <input className="input" value={form.origin} onChange={e => updateField('origin', e.target.value)} />
                </Field>
                <Field label="Region">
                  <input className="input" value={form.region} onChange={e => updateField('region', e.target.value)} />
                </Field>
              </div>
              <div className="field-row">
                <Field label="Farm">
                  <input className="input" value={form.farm} onChange={e => updateField('farm', e.target.value)} />
                </Field>
                <Field label="Farmer">
                  <input className="input" value={form.farmer} onChange={e => updateField('farmer', e.target.value)} />
                </Field>
              </div>
              <div className="field-row">
                <Field label="Altitude (m)">
                  <input className="input" value={form.altitude} onChange={e => updateField('altitude', e.target.value)} />
                </Field>
                <Field label="Variety">
                  <input className="input" value={form.variety} onChange={e => updateField('variety', e.target.value)} />
                </Field>
              </div>
              <div className="field-row">
                <Field label="Process">
                  <input className="input" value={form.process} onChange={e => updateField('process', e.target.value)} />
                </Field>
                <Field label="Roast">
                  <input className="input" value={form.roast} onChange={e => updateField('roast', e.target.value)} />
                </Field>
              </div>
              <Field label="Roasted By">
                <select className="select-input" value={form.roaster} onChange={e => updateField('roaster', e.target.value)}>
                  <option value="">— Select roaster —</option>
                  <option value="DABOV Specialty Coffee">DABOV Specialty Coffee</option>
                </select>
              </Field>
            </Card>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div>
            <Card icon="📦" title="Subscription">
              <Field label="Subscription Level" required>
                <select className="select-input" required value={form.level} onChange={e => updateField('level', e.target.value)}>
                  <option value="">— Select level —</option>
                  <option value="Base Coffee">Base Coffee</option>
                  <option value="Explorer Coffee">Explorer Coffee</option>
                  <option value="Alpine Coffee">Alpine Coffee</option>
                  <option value="Summit Coffee">Summit Coffee</option>
                  <option value="Decaf Coffee">Decaf Coffee</option>
                  <option value="SINGLE ORDER ONLY">Single Order Only</option>
                </select>
              </Field>
              <Field label="Bag Sizes">
                <div className="check-group">
                  {['250g','500g','1kg'].map(s => (
                    <label className="check-item" key={s}>
                      <input type="checkbox" checked={form.bagSizes.includes(s)} onChange={() => toggleSize(s)} /> {s}
                    </label>
                  ))}
                </div>
              </Field>
              <div className="visible-toggle-row">
                <label className={`visible-toggle${form.visible ? ' visible-toggle--on' : ' visible-toggle--off'}`}>
                  <input type="checkbox" checked={!!form.visible} onChange={e => updateField('visible', e.target.checked)} />
                  <span className="visible-toggle__track" />
                  <span className="visible-toggle__label">
                    {form.visible ? '✓ Visible on website' : '⚠ Hidden from website'}
                  </span>
                </label>
              </div>
            </Card>

            <PricingCard form={form} updateField={updateField} />

            <Card icon="🖼️" title="Image">
              <div className="img-preview">
                {form.image
                  ? <img src={toImageUrl(form.image)} alt="Preview" onError={e => { e.currentTarget.style.display='none'; }} />
                  : <div className="img-preview__empty">
                      <div className="img-preview__empty-icon">🖼️</div>
                      <span>No image</span>
                    </div>
                }
              </div>
              <div className="img-upload-row">
                <label className="btn btn--ghost btn--sm" style={{cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6}}>
                  📁 Upload image
                  <input type="file" accept="image/*" style={{display:'none'}} onChange={onImageUpload} />
                </label>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => updateField('image', DEFAULT_IMAGE)}>Use default</button>
              </div>
              <Field label="Google Drive URL or File ID">
                <input className="input input--mono" type="text" value={form.image}
                  onChange={e => updateField('image', e.target.value)}
                  placeholder="Paste any Drive share link or bare file ID…" />
                <div className="field-hint">Any Drive URL is auto-converted to the correct embed format on preview.</div>
              </Field>
            </Card>

          </div>

        </div>

        {/* ── Full-width actions row ── */}
        <div className="form-actions-row">
          {currentId
            ? <button type="button" className="btn btn--danger btn--sm" onClick={() => setPendingDeleteId(currentId)}>🗑️ Delete</button>
            : <div />
          }
          <div style={{flex:1}} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={closeForm}>Cancel</button>
          <button type="submit" className="btn btn--primary">Save Coffee</button>
        </div>
      </form>
    </div>
  );
}

// ── Pricing Card ──────────────────────────────────────────────────────────────
function PricingCard({ form, updateField }) {
  const SIZES = [
    { key: '1kg',  label: '1 kg'  },
    { key: '500g', label: '500 g' },
    { key: '250g', label: '250 g' },
  ];
  return (
    <div className="card">
      <div className="card__header"><span className="card__icon">💶</span><span className="card__title">Pricing</span></div>
      <div className="card__body">
        <div className="pricing-table">
          <div className="pricing-table-header">
            <span>Size</span><span>Cost €</span><span>Sale €</span><span>Profit</span><span>Margin</span>
          </div>
          {SIZES.map(({ key, label }) => {
            const cost   = parseFloat(form[`cost${key}`]);
            const sale   = parseFloat(form[`sale${key}`]);
            const profit = !isNaN(cost) && !isNaN(sale) ? sale - cost : null;
            const margin = profit !== null && sale > 0 ? (profit / sale * 100) : null;
            const cls    = margin === null ? 'margin--none'
                         : margin >= 50   ? 'margin--good'
                         : margin >= 40   ? 'margin--ok'
                         :                  'margin--low';
            return (
              <div className="pricing-row" key={key}>
                <span className="pricing-size">{label}</span>
                <input className="input" type="number" step="0.01" min="0" placeholder="0.00"
                  value={form[`cost${key}`]} onChange={e => updateField(`cost${key}`, e.target.value)} />
                <input className="input" type="number" step="0.01" min="0" placeholder="0.00"
                  value={form[`sale${key}`]} onChange={e => updateField(`sale${key}`, e.target.value)} />
                <span className={`pricing-profit ${cls}`}>{profit !== null ? `€${profit.toFixed(2)}` : '—'}</span>
                <span className={`pricing-margin ${cls}`}>{margin !== null ? `${margin.toFixed(1)}%` : '—'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Markdown field (edit / preview tabs) ─────────────────────────────────────
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

// ── Shared components ─────────────────────────────────────────────────────────
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
      <label>{label} {required && <span className="req">*</span>}</label>
      {children}
    </div>
  );
}
