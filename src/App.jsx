import { useMemo, useState } from 'react';
import {
  NavLink, Outlet, useNavigate, useParams, useLocation,
} from 'react-router-dom';
import LabelsPanel from './LabelsPanel.jsx';
import { useCoffee, newId, toSlug } from './CoffeeContext.jsx';
import { useAuth } from './AuthContext.jsx';

// ── Image helpers ─────────────────────────────────────────────────────────────
const DRIVE_IMG_ID = '1LYVoFp3Y1jv2i1ow7G7nPxCCQQzLSVZp';
const DEFAULT_IMAGE = `https://drive.google.com/thumbnail?id=${DRIVE_IMG_ID}&sz=w400`;

function toImageUrl(url) {
  if (!url) return DEFAULT_IMAGE;
  const m = url.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim()))
    return `https://drive.google.com/thumbnail?id=${url.trim()}&sz=w400`;
  return url;
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

// ── App layout (sidebar + content) ───────────────────────────────────────────
export default function App() {
  const { coffees, loadFromSheet, importCoffees } = useCoffee();
  const { logout } = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sc = sidebarCollapsed;

  // Helper to decide if /coffee/* is "active" for the nav link badge
  const inCoffeeSection = location.pathname.startsWith('/butlercoffee/coffee');

  function exportCSV() {
    const csv = [CSV_COLS.join(','), ...coffees.map(c => CSV_COLS.map(k => csvCell(c[k])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url;
    a.download = `butler-coffee-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function triggerImport() {
    document.getElementById('import-file-app').click();
  }

  function handleImportCSV(e) {
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
        await importCoffees(imported);
      } catch (err) {
        console.error('Import failed', err);
      }
    };
    reader.readAsText(file); e.target.value = '';
  }

  function navClass({ isActive }) {
    return `nav-link${isActive ? ' active' : ''}`;
  }

  return (
    <>
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
            <NavLink to="/butlercoffee/coffee" className={navClass} title="Coffee">
              <span className="nav-link__icon"><i className="fa-solid fa-mug-hot" /></span>
              {!sc && <><span>Coffee</span><span className="nav-link__badge">{coffees.length}</span></>}
            </NavLink>
            <NavLink to="/butlercoffee/subscription" className={navClass} title="Subscription Levels">
              <span className="nav-link__icon"><i className="fa-solid fa-layer-group" /></span>
              {!sc && <span>Sub Levels</span>}
            </NavLink>
            <NavLink to="/butlercoffee/machines" className={navClass} title="Machines">
              <span className="nav-link__icon"><i className="fa-solid fa-gears" /></span>
              {!sc && <span>Machines</span>}
            </NavLink>
            <span className="nav-link nav-link--soon" title="Coming soon">
              <span className="nav-link__icon"><i className="fa-solid fa-pen-nib" /></span>
              {!sc && <><span>Blog</span><span className="nav-link__badge">soon</span></>}
            </span>
          </div>

          <div className="nav-section">
            {!sc && <div className="nav-section__label">Tools</div>}
            <NavLink to="/butlercoffee/labels" className={navClass} title="Label Generator">
              <span className="nav-link__icon"><i className="fa-solid fa-tag" /></span>
              {!sc && <span>Label Generator</span>}
            </NavLink>
            <button className="nav-link" onClick={() => loadFromSheet(true)} title="Sync">
              <span className="nav-link__icon"><i className="fa-solid fa-rotate" /></span>
              {!sc && <span>Sync</span>}
            </button>
            <button className="nav-link" onClick={exportCSV} title="Export CSV">
              <span className="nav-link__icon"><i className="fa-solid fa-download" /></span>
              {!sc && <span>Export CSV</span>}
            </button>
            <button className="nav-link" onClick={triggerImport} title="Import CSV">
              <span className="nav-link__icon"><i className="fa-solid fa-upload" /></span>
              {!sc && <span>Import CSV</span>}
            </button>
            <input type="file" id="import-file-app" accept=".csv" style={{ display:'none' }} onChange={handleImportCSV} />
          </div>
        </nav>

        <div className="sidebar__footer">
          <button className="nav-link" onClick={() => navigate('/')} title="Butler Society Hub">
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
            <TopbarTitle />
          </div>
          <div className="topbar__right">
            <TopbarActions />
          </div>
        </div>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </>
  );
}

// ── Dynamic topbar based on current route ────────────────────────────────────
function TopbarTitle() {
  const location = useLocation();
  const p = location.pathname;
  const { coffees } = useCoffee();

  if (p === '/butlercoffee' || p === '/butlercoffee/')
    return <span className="topbar__title">Butler Coffee</span>;
  if (p.startsWith('/butlercoffee/coffee'))
    return <>
      <span className="topbar__title">Coffee</span>
      <span className="topbar__count">{coffees.length} entr{coffees.length === 1 ? 'y' : 'ies'}</span>
    </>;
  if (p.startsWith('/butlercoffee/machines'))
    return <span className="topbar__title">Machines</span>;
  if (p.startsWith('/butlercoffee/subscription'))
    return <span className="topbar__title">Subscription Levels</span>;
  if (p.startsWith('/butlercoffee/labels'))
    return <span className="topbar__title">Label Generator</span>;
  return <span className="topbar__title">Butler Coffee</span>;
}

function TopbarActions() {
  const location = useLocation();
  const navigate  = useNavigate();
  const p = location.pathname;
  if (p === '/butlercoffee/coffee')
    return <button className="btn btn--primary" onClick={() => navigate('/butlercoffee/coffee/new')}>+ Add Coffee</button>;
  if (p === '/butlercoffee/machines')
    return <button className="btn btn--primary" onClick={() => navigate('/butlercoffee/machines/new')}>+ Add Machine</button>;
  return null;
}

// ── Home panel ────────────────────────────────────────────────────────────────
export function HomePanel() {
  const navigate = useNavigate();
  const SECTIONS = [
    { id: 'coffee',       icon: 'fa-mug-hot',     title: 'Coffee',             description: 'Browse and manage the coffee catalog',        soon: false },
    { id: 'labels',       icon: 'fa-tag',          title: 'Labels',             description: 'Generate bag labels for any roast',           soon: false },
    { id: 'subscription', icon: 'fa-layer-group',  title: 'Subscription Levels',description: 'Tier content, pricing & buy links',           soon: false },
    { id: 'machines',     icon: 'fa-gears',        title: 'Machines',           description: 'Equipment catalogue & pricing',               soon: false },
    { id: 'blog',         icon: 'fa-pen-nib',      title: 'Blog',               description: 'Articles and content',                        soon: true  },
  ];
  return (
    <div className="home-panel">
      <div className="home-panel__header">
        <h1 className="home-panel__title">Butler Coffee</h1>
        <p className="home-panel__sub">Admin Dashboard</p>
      </div>
      <div className="app-grid">
        {SECTIONS.map(s => (
          <div key={s.title}
            className={`app-card${s.soon ? ' app-card--soon' : ''}`}
            onClick={() => !s.soon && navigate(`/butlercoffee/${s.id}`)}
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

// ── Coffee list ───────────────────────────────────────────────────────────────
export function CoffeeList() {
  const { coffees, deleteCoffee } = useCoffee();
  const navigate = useNavigate();
  const [search,           setSearch]           = useState('');
  const [levelFilter,      setLevelFilter]      = useState('');
  const [roasterFilter,    setRoasterFilter]    = useState('');
  const [originFilter,     setOriginFilter]     = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('');
  const [pendingDeleteId,  setPendingDeleteId]  = useState(null);
  const [deleteConfirmText,setDeleteConfirmText]= useState('');

  const stats = useMemo(() => coffees.reduce((acc, c) => {
    const key = c.level || 'Unlabeled'; acc[key] = (acc[key] || 0) + 1; return acc;
  }, {}), [coffees]);

  const filtered = useMemo(() => coffees.filter(c => {
    const q = search.toLowerCase();
    const textMatch = !q || [c.name, c.subtitle, c.origin].some(v => (v||'').toLowerCase().includes(q));
    const isBlend = (c.origin || '').toLowerCase() === 'blend';
    const originMatch = !originFilter
      || (originFilter === 'blend' && isBlend)
      || (originFilter === 'single' && !isBlend);
    const visMatch = !visibilityFilter
      || (visibilityFilter === 'visible' && c.visible)
      || (visibilityFilter === 'hidden'  && !c.visible);
    return textMatch && (!levelFilter || c.level === levelFilter)
      && (!roasterFilter || c.roaster === roasterFilter) && originMatch && visMatch;
  }), [coffees, search, levelFilter, roasterFilter, originFilter, visibilityFilter]);

  async function confirmDelete() {
    if (deleteConfirmText !== 'DELETE') return;
    const id = pendingDeleteId;
    setPendingDeleteId(null); setDeleteConfirmText('');
    await deleteCoffee(id);
  }

  return (
    <div id="list-panel">
      {/* Level pills */}
      <div className="stats-row">
        {Object.entries(stats).map(([k, v]) => (
          <div key={k} className={`stat-pill${levelFilter === k ? ' stat-pill--active' : ''}`}
            onClick={() => setLevelFilter(p => p === k ? '' : k)}
            title={levelFilter === k ? 'Clear filter' : `Filter by ${k}`}>
            <strong>{v}</strong> {k.replace(' Coffee', '')}
          </div>
        ))}
        {levelFilter && <div className="stat-pill stat-pill--clear" onClick={() => setLevelFilter('')}>✕ Clear</div>}
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
            <th style={{width:'30%'}}>Coffee</th><th>Level</th><th>Process</th>
            <th>Origin</th><th>Sizes</th><th style={{width:116}}>Actions</th>
          </tr></thead>
          <tbody>{filtered.map(c => (
            <tr key={c.id} className="tr--clickable" onClick={() => navigate(`/butlercoffee/coffee/${c.id}`)}>
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
                <button className="btn btn--ghost btn--sm btn--icon" onClick={() => navigate(`/butlercoffee/coffee/${c.id}`)} title="View">👁️</button>
                <button className="btn btn--ghost btn--sm btn--icon" onClick={() => navigate(`/butlercoffee/coffee/${c.id}/edit`)} title="Edit">✏️</button>
                <button className="btn btn--ghost btn--sm btn--icon" style={{color:'var(--red)'}} onClick={() => setPendingDeleteId(c.id)} title="Delete">🗑️</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table>
        {filtered.length === 0 && <div className="empty-state">
          <div className="empty-state__icon">☕</div>
          <div className="empty-state__title">No coffees found</div>
          <div className="empty-state__text">Try adjusting your filters or search.</div>
        </div>}
      </div>

      {pendingDeleteId && <div className="dialog-overlay open"><div className="dialog">
        <div className="dialog__title">Delete this coffee?</div>
        <div className="dialog__text">This will permanently remove the entry. This action cannot be undone.</div>
        <div className="dialog__confirm">
          <label className="dialog__confirm-label">Type DELETE to confirm</label>
          <input className="input" type="text" value={deleteConfirmText}
            onChange={e => setDeleteConfirmText(e.target.value)} placeholder="DELETE" autoFocus
            onKeyDown={e => e.key === 'Enter' && confirmDelete()} />
        </div>
        <div className="dialog__actions">
          <button className="btn btn--ghost btn--sm" onClick={() => { setPendingDeleteId(null); setDeleteConfirmText(''); }}>Cancel</button>
          <button className="btn btn--danger btn--sm" onClick={confirmDelete} disabled={deleteConfirmText !== 'DELETE'}>Yes, delete</button>
        </div>
      </div></div>}
    </div>
  );
}

// ── Coffee view ───────────────────────────────────────────────────────────────
export function CoffeeView() {
  const { coffees } = useCoffee();
  const { id }      = useParams();
  const navigate    = useNavigate();
  const coffee      = coffees.find(c => c.id === id);

  if (!coffee) return (
    <div className="view-panel">
      <div className="form-header">
        <button className="form-header__back" onClick={() => navigate('/butlercoffee/coffee')}>← Back</button>
        <h1 className="form-header__title">Coffee not found</h1>
      </div>
    </div>
  );

  const SIZES = [
    { key: '1kg', label: '1 kg' }, { key: '500g', label: '500 g' }, { key: '250g', label: '250 g' },
  ];
  function ViewField({ label, value }) {
    if (!value) return null;
    return <div className="view-field">
      <span className="view-field-label">{label}</span>
      <span className="view-field-value">{value}</span>
    </div>;
  }

  return (
    <div className="view-panel">
      <div className="form-header">
        <button className="form-header__back" onClick={() => navigate('/butlercoffee/coffee')}>← Back</button>
        <h1 className="form-header__title">{coffee.name || 'Untitled'}</h1>
        <button className="btn btn--ghost btn--sm" style={{marginLeft:'auto'}} onClick={() => navigate(`/butlercoffee/coffee/${id}/edit`)}>✏️ Edit</button>
      </div>
      {!coffee.visible && <div className="visibility-warning"><span>⚠️</span><span>This coffee is <strong>not visible</strong> on the public website.</span></div>}

      <div className="form-grid">
        <div>
          <div className="card">
            <div className="card__header"><span className="card__icon">✏️</span><span className="card__title">Identity</span></div>
            <div className="card__body">
              <div className="view-name">{coffee.name}</div>
              {coffee.subtitle && <div className="view-subtitle-es-wrap"><span className="view-lang-tag">🇨🇦</span><span className="view-subtitle">{coffee.subtitle}</span></div>}
              {coffee.subtitle_es && <div className="view-subtitle-es-wrap"><span className="view-lang-tag">🇪🇸</span><span className="view-subtitle view-subtitle--es">{coffee.subtitle_es}</span></div>}
              {coffee.slug && <div className="view-slug">/coffee/{coffee.slug}</div>}
            </div>
          </div>
          {(coffee.description || coffee.description_es) && <div className="card">
            <div className="card__header"><span className="card__icon">📖</span><span className="card__title">Description</span></div>
            <div className="card__body">
              {coffee.description && <div className="view-description-es-block" style={{paddingTop:0,borderTop:'none',marginTop:0}}>
                <div className="view-lang-divider"><span className="view-lang-tag">🇨🇦 English</span></div>
                <div className="view-description md-rendered" dangerouslySetInnerHTML={{__html: renderMarkdown(coffee.description)}} />
              </div>}
              {coffee.description_es && <div className="view-description-es-block">
                <div className="view-lang-divider"><span className="view-lang-tag">🇪🇸 Español</span></div>
                <div className="view-description view-description--es md-rendered" dangerouslySetInnerHTML={{__html: renderMarkdown(coffee.description_es)}} />
              </div>}
            </div>
          </div>}
          <div className="card">
            <div className="card__header"><span className="card__icon">☕</span><span className="card__title">Coffee Details</span></div>
            <div className="card__body">
              {coffee.notes && <div className="view-field" style={{marginBottom:12}}><span className="view-field-label">Tasting Notes</span><span className="view-field-value">{coffee.notes}</span></div>}
              {coffee.recommended && <div className="view-field" style={{marginBottom:14}}><span className="view-field-label">Recommended For</span><span className="view-field-value">{coffee.recommended}</span></div>}
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
        <div>
          <div className="card">
            <div className="card__header"><span className="card__icon">🖼️</span><span className="card__title">Image</span></div>
            <div className="card__body" style={{padding:0}}>
              <div className="view-img-wrap">
                <img src={toImageUrl(coffee.image)} alt={coffee.name} onError={e => { e.currentTarget.style.display='none'; }} />
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card__header"><span className="card__icon">📦</span><span className="card__title">Subscription</span></div>
            <div className="card__body">
              {coffee.level && <div className="view-field" style={{marginBottom:12}}>
                <span className="view-field-label">Level</span>
                <span className={`level-badge ${LEVEL_CLASSES[coffee.level]||''}`} style={{marginTop:4,display:'inline-block'}}>{coffee.level.replace(' Coffee','')}</span>
              </div>}
              {coffee.bagSizes?.length > 0 && <div className="view-field">
                <span className="view-field-label">Bag Sizes</span>
                <div className="size-chips" style={{marginTop:4}}>{coffee.bagSizes.map(s => <span className="size-chip" key={s}>{s}</span>)}</div>
              </div>}
            </div>
          </div>
          <div className="card">
            <div className="card__header"><span className="card__icon">💶</span><span className="card__title">Pricing</span></div>
            <div className="card__body">
              <div className="pricing-table">
                <div className="pricing-table-header"><span>Size</span><span>Cost €</span><span>Sale €</span><span>Profit</span><span>Margin</span></div>
                {SIZES.map(({ key, label }) => {
                  const cost   = parseFloat(coffee[`cost${key}`]);
                  const sale   = parseFloat(coffee[`sale${key}`]);
                  const profit = !isNaN(cost) && !isNaN(sale) ? sale - cost : null;
                  const margin = profit !== null && sale > 0 ? (profit / sale * 100) : null;
                  const cls    = margin === null ? 'margin--none' : margin >= 50 ? 'margin--good' : margin >= 40 ? 'margin--ok' : 'margin--low';
                  if (!(!isNaN(cost) || !isNaN(sale))) return null;
                  return <div className="pricing-row" key={key}>
                    <span className="pricing-size">{label}</span>
                    <span className="pricing-ro">{!isNaN(cost) ? `€${cost.toFixed(2)}` : '—'}</span>
                    <span className="pricing-ro">{!isNaN(sale) ? `€${sale.toFixed(2)}` : '—'}</span>
                    <span className={`pricing-profit ${cls}`}>{profit !== null ? `€${profit.toFixed(2)}` : '—'}</span>
                    <span className={`pricing-margin ${cls}`}>{margin !== null ? `${margin.toFixed(1)}%` : '—'}</span>
                  </div>;
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Coffee form (new + edit) ──────────────────────────────────────────────────
export function CoffeeForm() {
  const { coffees, saveCoffee, deleteCoffee, uploadImage } = useCoffee();
  const { id }     = useParams();
  const navigate   = useNavigate();
  const isNew      = !id;
  const existing   = id ? coffees.find(c => c.id === id) : null;

  const [form,         setForm]         = useState(() => existing ? { ...emptyCoffee, ...existing, bagSizes: existing.bagSizes || [] } : { ...emptyCoffee });
  const [slugManual,   setSlugManual]   = useState(Boolean(existing?.slug));
  const [pendingDelete,setPendingDelete]= useState(false);
  const [deleteText,   setDeleteText]  = useState('');

  function updateField(key, value) {
    setForm(f => ({ ...f, [key]: value, ...(key === 'name' && !slugManual ? { slug: toSlug(value) } : {}) }));
  }
  const toggleSize = size => updateField('bagSizes',
    form.bagSizes.includes(size) ? form.bagSizes.filter(s => s !== size) : [...form.bagSizes, size]);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const saved = await saveCoffee(form);
      navigate(`/butlercoffee/coffee/${saved.id}`);
    } catch {}
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = async ev => {
      setForm(f => ({ ...f, image: ev.target.result }));
      try {
        const url = await uploadImage(file);
        setForm(f => ({ ...f, image: url }));
      } catch {}
    };
    reader.readAsDataURL(file);
  }

  async function confirmDelete() {
    if (deleteText !== 'DELETE') return;
    await deleteCoffee(id);
    navigate('/butlercoffee/coffee');
  }

  return (
    <div id="form-panel" className="form-panel active">
      <div className="form-header">
        <button className="form-header__back" onClick={() => navigate(isNew ? '/butlercoffee/coffee' : `/butlercoffee/coffee/${id}`)}>← Back</button>
        <h1 className="form-header__title">{isNew ? 'New Coffee' : 'Edit Coffee'}</h1>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
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
                <div className="field-hint">Auto-generated from Coffee Name.</div>
              </Field>
            </Card>
            <Card icon="📖" title="Description">
              <MarkdownField label="Description (EN) 🇨🇦" value={form.description} onChange={v => updateField('description', v)} />
              <MarkdownField label="Description (ES) 🇪🇸" value={form.description_es || ''} onChange={v => updateField('description_es', v)} placeholder="Descripción en español…" />
            </Card>
            <Card icon="☕" title="Coffee Details">
              <div className="field-row">
                <Field label="Tasting Notes"><input className="input" value={form.notes} onChange={e => updateField('notes', e.target.value)} /><div className="field-hint">Comma-separated.</div></Field>
                <Field label="Recommended For"><input className="input" value={form.recommended} onChange={e => updateField('recommended', e.target.value)} /><div className="field-hint">Brew methods.</div></Field>
              </div>
              <div className="field-row">
                <Field label="Country / Origin"><input className="input" value={form.origin} onChange={e => updateField('origin', e.target.value)} /></Field>
                <Field label="Region"><input className="input" value={form.region} onChange={e => updateField('region', e.target.value)} /></Field>
              </div>
              <div className="field-row">
                <Field label="Farm"><input className="input" value={form.farm} onChange={e => updateField('farm', e.target.value)} /></Field>
                <Field label="Farmer"><input className="input" value={form.farmer} onChange={e => updateField('farmer', e.target.value)} /></Field>
              </div>
              <div className="field-row">
                <Field label="Altitude (m)"><input className="input" value={form.altitude} onChange={e => updateField('altitude', e.target.value)} /></Field>
                <Field label="Variety"><input className="input" value={form.variety} onChange={e => updateField('variety', e.target.value)} /></Field>
              </div>
              <div className="field-row">
                <Field label="Process"><input className="input" value={form.process} onChange={e => updateField('process', e.target.value)} /></Field>
                <Field label="Roast"><input className="input" value={form.roast} onChange={e => updateField('roast', e.target.value)} /></Field>
              </div>
              <Field label="Roasted By">
                <select className="select-input" value={form.roaster} onChange={e => updateField('roaster', e.target.value)}>
                  <option value="">— Select roaster —</option>
                  <option value="DABOV Specialty Coffee">DABOV Specialty Coffee</option>
                </select>
              </Field>
            </Card>
          </div>
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
                  <span className="visible-toggle__label">{form.visible ? '✓ Visible on website' : '⚠ Hidden from website'}</span>
                </label>
              </div>
            </Card>
            <PricingCard form={form} updateField={updateField} />
            <Card icon="🖼️" title="Image">
              <div className="img-preview">
                {form.image
                  ? <img src={toImageUrl(form.image)} alt="Preview" onError={e => { e.currentTarget.style.display='none'; }} />
                  : <div className="img-preview__empty"><div className="img-preview__empty-icon">🖼️</div><span>No image</span></div>
                }
              </div>
              <div className="img-upload-row">
                <label className="btn btn--ghost btn--sm" style={{cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6}}>
                  📁 Upload image
                  <input type="file" accept="image/*" style={{display:'none'}} onChange={handleImageUpload} />
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
        <div className="form-actions-row">
          {!isNew
            ? <button type="button" className="btn btn--danger btn--sm" onClick={() => setPendingDelete(true)}>🗑️ Delete</button>
            : <div />
          }
          <div style={{flex:1}} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate(isNew ? '/butlercoffee/coffee' : `/butlercoffee/coffee/${id}`)}>Cancel</button>
          <button type="submit" className="btn btn--primary">Save Coffee</button>
        </div>
      </form>

      {pendingDelete && <div className="dialog-overlay open"><div className="dialog">
        <div className="dialog__title">Delete this coffee?</div>
        <div className="dialog__text">This will permanently remove the entry. This action cannot be undone.</div>
        <div className="dialog__confirm">
          <label className="dialog__confirm-label">Type DELETE to confirm</label>
          <input className="input" type="text" value={deleteText} onChange={e => setDeleteText(e.target.value)} placeholder="DELETE" autoFocus onKeyDown={e => e.key === 'Enter' && confirmDelete()} />
        </div>
        <div className="dialog__actions">
          <button className="btn btn--ghost btn--sm" onClick={() => { setPendingDelete(false); setDeleteText(''); }}>Cancel</button>
          <button className="btn btn--danger btn--sm" onClick={confirmDelete} disabled={deleteText !== 'DELETE'}>Yes, delete</button>
        </div>
      </div></div>}
    </div>
  );
}

// ── Pricing Card ──────────────────────────────────────────────────────────────
function PricingCard({ form, updateField }) {
  const SIZES = [{ key:'1kg',label:'1 kg' },{ key:'500g',label:'500 g' },{ key:'250g',label:'250 g' }];
  return (
    <div className="card">
      <div className="card__header"><span className="card__icon">💶</span><span className="card__title">Pricing</span></div>
      <div className="card__body">
        <div className="pricing-table">
          <div className="pricing-table-header"><span>Size</span><span>Cost €</span><span>Sale €</span><span>Profit</span><span>Margin</span></div>
          {SIZES.map(({ key, label }) => {
            const cost   = parseFloat(form[`cost${key}`]);
            const sale   = parseFloat(form[`sale${key}`]);
            const profit = !isNaN(cost) && !isNaN(sale) ? sale - cost : null;
            const margin = profit !== null && sale > 0 ? (profit / sale * 100) : null;
            const cls    = margin === null ? 'margin--none' : margin >= 50 ? 'margin--good' : margin >= 40 ? 'margin--ok' : 'margin--low';
            return (
              <div className="pricing-row" key={key}>
                <span className="pricing-size">{label}</span>
                <input className="input" type="number" step="0.01" min="0" placeholder="0.00" value={form[`cost${key}`]} onChange={e => updateField(`cost${key}`, e.target.value)} />
                <input className="input" type="number" step="0.01" min="0" placeholder="0.00" value={form[`sale${key}`]} onChange={e => updateField(`sale${key}`, e.target.value)} />
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

// ── Markdown field ────────────────────────────────────────────────────────────
function MarkdownField({ label, value, onChange, placeholder, minHeight = 130 }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="field">
      <div className="md-header">
        <label style={{margin:0}}>{label}</label>
        <div className="md-tabs">
          <button type="button" className={`md-tab${!preview ? ' md-tab--active' : ''}`} onClick={() => setPreview(false)}>Edit</button>
          <button type="button" className={`md-tab${ preview ? ' md-tab--active' : ''}`} onClick={() => setPreview(true)}>Preview</button>
        </div>
      </div>
      {preview
        ? <div className="md-preview" style={{minHeight}} dangerouslySetInnerHTML={{__html: renderMarkdown(value) || '<p class="md-empty">Nothing to preview</p>'}} />
        : <textarea className="textarea-input" style={{minHeight}} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
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
