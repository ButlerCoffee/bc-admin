import { useEffect, useMemo, useState } from 'react';
import { apiCall } from './lib/api.js';

const DEFAULT_IMAGE = 'https://drive.google.com/uc?export=view&id=1BrvJTmLjnaUQ6feC6NkSvET6SouIkCQK';
const emptyCoffee = {
  id: '', name: '', subtitle: '', slug: '', description: '', notes: '', recommended: '',
  origin: '', region: '', farm: '', farmer: '', altitude: '', variety: '', process: '',
  roast: '', roaster: '', level: '', bagSizes: [], image: '', updatedAt: ''
};
const LEVEL_CLASSES = {
  'Base Coffee': 'level--base', 'Explorer Coffee': 'level--explorer', 'Alpine Coffee': 'level--alpine',
  'Summit Coffee': 'level--summit', 'Decaf Coffee': 'level--decaf', 'SINGLE ORDER ONLY': 'level--single'
};
const CSV_COLS = ['id','name','subtitle','slug','description','notes','recommended','origin','region','farm','farmer','altitude','variety','process','roast','roaster','level','bagSizes','image','updatedAt'];

function newId() { return `bc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function toSlug(str = '') {
  return str.toLowerCase().replace(/[àáâãäå]/g,'a').replace(/[èéêë]/g,'e').replace(/[ìíîï]/g,'i')
    .replace(/[òóôõö]/g,'o').replace(/[ùúûü]/g,'u').replace(/ñ/g,'n').replace(/ç/g,'c')
    .replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-');
}
function csvCell(val) {
  if (val == null) return '';
  const s = Array.isArray(val) ? val.join(';') : String(val);
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function parseCSVLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

export default function App() {
  const [coffees, setCoffees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [panel, setPanel] = useState('list');
  const [currentId, setCurrentId] = useState(null);
  const [form, setForm] = useState(emptyCoffee);
  const [slugManual, setSlugManual] = useState(false);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [roasterFilter, setRoasterFilter] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

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
    const textMatch = !q || [c.name, c.subtitle, c.origin].some(v => (v || '').toLowerCase().includes(q));
    return textMatch && (!levelFilter || c.level === levelFilter) && (!roasterFilter || c.roaster === roasterFilter);
  }), [coffees, search, levelFilter, roasterFilter]);

  const stats = useMemo(() => coffees.reduce((acc, c) => {
    const key = c.level || 'Unlabeled'; acc[key] = (acc[key] || 0) + 1; return acc;
  }, {}), [coffees]);

  function updateField(key, value) {
    setForm(f => ({ ...f, [key]: value, ...(key === 'name' && !slugManual ? { slug: toSlug(value) } : {}) }));
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
      setCoffees(prev => prev.some(c => c.id === saved.id) ? prev.map(c => c.id === saved.id ? saved : c) : [saved, ...prev]);
      toast('Coffee saved!', 'success');
      closeForm();
    } catch (err) { toast(`Save failed — ${err.message}`, 'error'); }
    finally { setLoading(false); }
  }

  async function deleteCurrent() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
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
          obj.bagSizes = typeof obj.bagSizes === 'string' && obj.bagSizes ? obj.bagSizes.split(';').map(s => s.trim()).filter(Boolean) : [];
          obj.id ||= newId(); obj.updatedAt ||= new Date().toISOString(); return obj;
        });
        setLoading(true); await apiCall('POST', { action: 'import', coffees: imported }); setCoffees(imported); toast(`Imported ${imported.length} coffees to Sheet!`, 'success');
      } catch (err) { toast(`Import failed — ${err.message}`, 'error'); }
      finally { setLoading(false); }
    };
    reader.readAsText(file); e.target.value = '';
  }

  return <>
    <aside className="sidebar">
      <div className="sidebar__brand"><img src={DEFAULT_IMAGE} alt="Butler Coffee" onError={e => e.currentTarget.style.display = 'none'} /><div className="sidebar__brand-text"><div className="sidebar__brand-name">Butler Coffee</div><div className="sidebar__brand-sub">Admin DB</div></div></div>
      <nav className="sidebar__nav">
        <div className="nav-section"><div className="nav-section__label">Catalog</div>
          <button className="nav-link active"><span className="nav-link__icon">☕</span> Coffee <span className="nav-link__badge">{coffees.length}</span></button>
          <button className="nav-link nav-link--soon" title="Coming soon"><span className="nav-link__icon">⚙️</span> Machines <span className="nav-link__badge">soon</span></button>
          <button className="nav-link nav-link--soon" title="Coming soon"><span className="nav-link__icon">✍️</span> Blog <span className="nav-link__badge">soon</span></button>
        </div>
        <div className="nav-section"><div className="nav-section__label">Tools</div>
          <button className="nav-link" onClick={() => loadFromSheet(true)}><span className="nav-link__icon">🔄</span> Sync from Sheet</button>
          <button className="nav-link" onClick={exportCSV}><span className="nav-link__icon">⬇️</span> Export CSV</button>
          <button className="nav-link" onClick={() => document.getElementById('import-file').click()}><span className="nav-link__icon">⬆️</span> Import CSV</button>
          <input type="file" id="import-file" accept=".csv" style={{ display: 'none' }} onChange={importCSV} />
        </div>
      </nav>
      <div className="sidebar__footer"><a href="/" target="_blank">← View public site</a></div>
    </aside>

    <div className="main">
      <div className="topbar"><div className="topbar__left"><span className="topbar__title">Coffee</span><span className="topbar__count">{coffees.length} entr{coffees.length === 1 ? 'y' : 'ies'}</span></div><div className="topbar__right">{panel === 'list' && <button className="btn btn--primary" onClick={() => openForm(null)}>+ Add Coffee</button>}</div></div>
      <div className="content">{panel === 'list' ? <ListPanel {...{ stats, search, setSearch, levelFilter, setLevelFilter, roasterFilter, setRoasterFilter, filtered, openForm, setPendingDeleteId }} /> : <FormPanel {...{ form, updateField, slugManual, setSlugManual, saveCoffee, closeForm, currentId, setPendingDeleteId }} />}</div>
    </div>

    {loading && <div className="loading-overlay" style={{ display: 'flex' }}><div className="loading-spinner" /><div className="loading-label">Syncing with Google Sheet…</div></div>}
    <div className="toast-wrap">{toasts.map(t => <div key={t.id} className={`toast toast--${t.type}`}><span className="toast__icon">{t.type === 'success' ? '✓' : '✕'}</span>{t.msg}</div>)}</div>
    {pendingDeleteId && <div className="dialog-overlay open"><div className="dialog"><div className="dialog__title">Delete this coffee?</div><div className="dialog__text">This will permanently remove the entry from the database. This action cannot be undone.</div><div className="dialog__actions"><button className="btn btn--ghost btn--sm" onClick={() => setPendingDeleteId(null)}>Cancel</button><button className="btn btn--danger btn--sm" onClick={deleteCurrent}>Yes, delete</button></div></div></div>}
  </>;
}

function ListPanel({ stats, search, setSearch, levelFilter, setLevelFilter, roasterFilter, setRoasterFilter, filtered, openForm, setPendingDeleteId }) {
  return <div id="list-panel">
    <div className="stats-row">{Object.entries(stats).map(([k,v]) => <div className="stat-pill" key={k}><strong>{v}</strong> {k}</div>)}</div>
    <div className="toolbar"><div className="search-wrap"><span className="search-wrap__icon">🔍</span><input className="search-input" type="search" placeholder="Search coffees…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <select className="filter-select" value={levelFilter} onChange={e => setLevelFilter(e.target.value)}><option value="">All levels</option><option value="Base Coffee">Base</option><option value="Explorer Coffee">Explorer</option><option value="Alpine Coffee">Alpine</option><option value="Summit Coffee">Summit</option><option value="Decaf Coffee">Decaf</option><option value="SINGLE ORDER ONLY">Single Order</option></select>
      <select className="filter-select" value={roasterFilter} onChange={e => setRoasterFilter(e.target.value)}><option value="">All roasters</option><option value="DABOV Specialty Coffee">DABOV Specialty Coffee</option></select></div>
    <div className="table-wrap"><table><thead><tr><th style={{width:'30%'}}>Coffee</th><th>Level</th><th>Process</th><th>Origin</th><th>Sizes</th><th style={{width:100}}>Actions</th></tr></thead><tbody>{filtered.map(c => <tr key={c.id}><td><div className="td-name">{c.name || '—'}</div>{c.subtitle && <div className="td-sub">{c.subtitle}</div>}</td><td>{c.level ? <span className={`level-badge ${LEVEL_CLASSES[c.level] || ''}`}>{c.level.replace(' Coffee','')}</span> : '—'}</td><td style={{color:'var(--muted)',fontSize:'0.8rem'}}>{c.process || '—'}</td><td style={{color:'var(--muted)',fontSize:'0.8rem'}}>{c.origin || '—'}</td><td><div className="size-chips">{c.bagSizes?.length ? c.bagSizes.map(s => <span className="size-chip" key={s}>{s}</span>) : '—'}</div></td><td><div className="td-actions"><button className="btn btn--ghost btn--sm btn--icon" onClick={() => openForm(c.id)} title="Edit">✏️</button><button className="btn btn--ghost btn--sm btn--icon" onClick={() => setPendingDeleteId(c.id)} title="Delete" style={{color:'var(--red)'}}>🗑️</button></div></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-state"><div className="empty-state__icon">☕</div><div className="empty-state__title">No coffees yet</div><div className="empty-state__text">Click "Add Coffee" to add your first entry.</div></div>}</div>
  </div>;
}

function FormPanel({ form, updateField, setSlugManual, saveCoffee, closeForm, currentId, setPendingDeleteId }) {
  const toggleSize = size => updateField('bagSizes', form.bagSizes.includes(size) ? form.bagSizes.filter(s => s !== size) : [...form.bagSizes, size]);
  return <div id="form-panel" className="form-panel active"><div className="form-header"><button className="form-header__back" onClick={closeForm}>← Back</button><h1 className="form-header__title">{currentId ? 'Edit Coffee' : 'New Coffee'}</h1></div>
    <form onSubmit={saveCoffee}><div className="form-grid"><div><Card icon="✏️" title="Identity"><Field label="Coffee Name" required><input className="input" required value={form.name} onChange={e => updateField('name', e.target.value)} /></Field><Field label="Subtitle"><input className="input" value={form.subtitle} onChange={e => updateField('subtitle', e.target.value)} /></Field><Field label="Slug"><div className="slug-row"><span className="slug-prefix">/coffee/</span><input className="input input--mono" value={form.slug} onChange={e => { setSlugManual(true); updateField('slug', e.target.value); }} /><button type="button" className="slug-regen" onClick={() => { setSlugManual(false); updateField('slug', toSlug(form.name)); }}>↺</button></div><div className="field-hint">Auto-generated from Coffee Name. Edit manually if needed.</div></Field></Card>
      <Card icon="📖" title="Story"><Field label="Description"><textarea className="textarea-input" style={{minHeight:110}} value={form.description} onChange={e => updateField('description', e.target.value)} /></Field><Field label="Notes (Tasting)"><input className="input" value={form.notes} onChange={e => updateField('notes', e.target.value)} /><div className="field-hint">Comma-separated tasting notes.</div></Field><Field label="Recommended For"><input className="input" value={form.recommended} onChange={e => updateField('recommended', e.target.value)} /><div className="field-hint">Comma-separated brew methods.</div></Field></Card>
      <Card icon="🌍" title="Origin"><div className="field-row"><Field label="Country / Origin"><input className="input" value={form.origin} onChange={e => updateField('origin', e.target.value)} /></Field><Field label="Region"><input className="input" value={form.region} onChange={e => updateField('region', e.target.value)} /></Field></div><div className="field-row"><Field label="Farm"><input className="input" value={form.farm} onChange={e => updateField('farm', e.target.value)} /></Field><Field label="Farmer"><input className="input" value={form.farmer} onChange={e => updateField('farmer', e.target.value)} /></Field></div><Field label="Altitude (m)"><input className="input" value={form.altitude} onChange={e => updateField('altitude', e.target.value)} /></Field></Card>
      <Card icon="🔬" title="Coffee Details"><div className="field-row"><Field label="Variety"><input className="input" value={form.variety} onChange={e => updateField('variety', e.target.value)} /></Field><Field label="Process"><input className="input" value={form.process} onChange={e => updateField('process', e.target.value)} /></Field></div><div className="field-row"><Field label="Roast"><input className="input" value={form.roast} onChange={e => updateField('roast', e.target.value)} /></Field><Field label="Roasted By"><select className="select-input" value={form.roaster} onChange={e => updateField('roaster', e.target.value)}><option value="">— Select roaster —</option><option value="DABOV Specialty Coffee">DABOV Specialty Coffee</option></select></Field></div></Card></div>
      <div><Card icon="📦" title="Subscription"><Field label="Subscription Level" required><select className="select-input" required value={form.level} onChange={e => updateField('level', e.target.value)}><option value="">— Select level —</option><option value="Base Coffee">Base Coffee</option><option value="Explorer Coffee">Explorer Coffee</option><option value="Alpine Coffee">Alpine Coffee</option><option value="Summit Coffee">Summit Coffee</option><option value="Decaf Coffee">Decaf Coffee</option><option value="SINGLE ORDER ONLY">Single Order Only</option></select></Field><Field label="Bag Sizes"><div className="check-group">{['250g','500g','1kg'].map(s => <label className="check-item" key={s}><input type="checkbox" checked={form.bagSizes.includes(s)} onChange={() => toggleSize(s)} /> {s}</label>)}</div></Field></Card>
      <Card icon="🖼️" title="Image"><div className="img-preview">{form.image ? <img src={form.image} alt="Preview" onError={e => e.currentTarget.style.display = 'none'} /> : <div className="img-preview__empty"><div className="img-preview__empty-icon">🖼️</div><span>No image</span></div>}</div><Field label="Image URL"><input className="input input--mono" type="url" value={form.image} onChange={e => updateField('image', e.target.value)} /><div className="field-hint">Google Drive export URL or direct image URL.</div></Field><div className="form-actions" style={{background:'none',borderTop:'1px solid var(--border)'}}><button type="button" className="btn btn--ghost btn--sm" onClick={() => updateField('image', DEFAULT_IMAGE)}>Use default image</button></div></Card>
      <div className="card"><div className="form-actions"><button type="button" className="btn btn--ghost btn--sm" onClick={() => setPendingDeleteId(currentId)} style={{display:currentId?'block':'none',color:'var(--red)'}}>Delete</button><div className="form-actions__spacer" /><button type="button" className="btn btn--ghost btn--sm" onClick={closeForm}>Cancel</button><button type="submit" className="btn btn--primary">Save Coffee</button></div></div></div></div></form></div>;
}
function Card({ icon, title, children }) { return <div className="card"><div className="card__header"><span className="card__icon">{icon}</span><span className="card__title">{title}</span></div><div className="card__body">{children}</div></div>; }
function Field({ label, required, children }) { return <div className="field"><label>{label} {required && <span className="req">*</span>}</label>{children}</div>; }
