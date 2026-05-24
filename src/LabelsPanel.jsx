import { useState, useRef, useCallback } from 'react';

// ── Tier colours (HTML preview only — PDF is black/white) ─────────────────────
const TIER_COLORS = {
  'Base Coffee':    '#5C3A1E',
  'Explorer Coffee':'#1e40af',
  'Alpine Coffee':  '#166534',
  'Summit Coffee':  '#C8A96E',
  'Decaf Coffee':   '#475569',
};

function tierColor(level) { return TIER_COLORS[level] || '#5C3A1E'; }
function tierLabel(level) { return level ? level.replace(' Coffee', '') : 'Butler'; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function blankDetails(coffee) {
  return {
    process:  coffee?.process  || '',
    variety:  coffee?.variety  || '',
    region:   coffee?.region   || '',
    alt:      coffee?.altitude || '',
    farm:     coffee?.farm     || '',
    farmer:   coffee?.farmer   || '',
    roast:    coffee?.roast    || '',
    roasters: coffee?.roaster  || '',
    sub:      coffee?.subtitle || '',
    notes:    coffee?.notes    || '',
  };
}

// ── jsPDF loader ─────────────────────────────────────────────────────────────
let jsPDFLoaded = false;
async function loadJsPDF() {
  if (jsPDFLoaded || window.jspdf) { jsPDFLoaded = true; return; }
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  jsPDFLoaded = true;
}

// ── PDF builder ───────────────────────────────────────────────────────────────
async function buildPDF(queue) {
  await loadJsPDF();
  const { jsPDF } = window.jspdf;

  // Page & margin constants (mm)
  const PW = 101.6, PH = 152.4;
  const mL = 3, mR = 3, mT = 3, mB = 3, gapY = 1.5;
  const LW = PW - mL - mR;                          // 95.6
  const LH = (PH - mT - mB - gapY * 2) / 3;        // ≈ 47.8

  // Row height constants
  const row1H = 8.5;   // header block
  const row2H = 7;     // each detail grid row
  const row3H = 5;     // date / lot row
  const footH = 5.5;   // footer

  // Font sizes
  const FS_H = 13, FS_S = 8, FS_B = 7, FS_V = 8;

  const colW   = LW / 4;
  const halfW  = LW / 2;

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: [PW, PH] });
  doc.setFont('helvetica');

  const sep = (x1, y1, x2, y2) => {
    doc.setDrawColor(160);
    doc.setLineWidth(0.1);
    doc.line(x1, y1, x2, y2);
  };

  const drawGrid = (cells, gx, gy, gh) => {
    cells.forEach((cell, ci) => {
      const cx = gx + ci * colW;
      if (ci > 0) sep(cx, gy, cx, gy + gh);

      doc.setFontSize(FS_B);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(120);
      doc.text(cell.h, cx + 1.5, gy + 2.5);

      doc.setFontSize(FS_V);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0);
      const val = (cell.v || '—').slice(0, 22);
      doc.text(val, cx + 1.5, gy + gh - 1.5);
    });
  };

  for (let qi = 0; qi < queue.length; qi++) {
    if (qi > 0 && qi % 3 === 0) doc.addPage([PW, PH]);
    const item = queue[qi];
    const slot = qi % 3;

    const x  = mL;
    const y0 = mT + slot * (LH + gapY);
    const xR = x + LW;
    const tx = x + 2;
    const bx = xR - 2;

    // ── Outer border ──────────────────────────────────────────────────────────
    doc.setDrawColor(0);
    doc.setLineWidth(0.4);
    doc.rect(x, y0, LW, LH);

    // ── Header block (tier label + bag size at top; name + sub below) ─────────
    // Tier label (small caps)
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100);
    doc.text(tierLabel(item.coffee.level).toUpperCase(), tx, y0 + 2.5);

    // Bag size right-aligned
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(item.bagSize || '', bx, y0 + 2.5, { align: 'right' });

    const hasSub = Boolean(item.sub);
    if (hasSub) {
      doc.setFontSize(FS_S);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(80);
      doc.text(item.sub, tx, y0 + 2 + 3);
    }

    const nameY = y0 + 2 + (hasSub ? 8 : 5);
    doc.setFontSize(FS_H);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    // Truncate name to avoid overflow
    const nameStr = (item.coffee.name || '').slice(0, 30);
    doc.text(nameStr, tx, nameY);

    // Notes line
    if (item.notes) {
      doc.setFontSize(6);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(90);
      doc.text(item.notes, tx, nameY + 4, { maxWidth: LW - 4 });
    }

    // ── Separator after header ─────────────────────────────────────────────────
    sep(x, y0 + row1H, xR, y0 + row1H);

    // ── Grid 1: process / variety / region / altitude ─────────────────────────
    const grid1Top = y0 + row1H;
    drawGrid([
      { h: 'Process',  v: item.process },
      { h: 'Variety',  v: item.variety },
      { h: 'Region',   v: item.region  },
      { h: 'Altitude', v: item.alt     },
    ], x, grid1Top, row2H);
    sep(x, grid1Top + row2H, xR, grid1Top + row2H);

    // ── Grid 2: farm / farmer / roast / roaster ───────────────────────────────
    const grid2Top = y0 + row1H + row2H;
    drawGrid([
      { h: 'Farm',    v: item.farm     },
      { h: 'Farmer',  v: item.farmer   },
      { h: 'Roast',   v: item.roast    },
      { h: 'Roaster', v: item.roasters },
    ], x, grid2Top, row2H);

    // ── Row 3: date / lot ─────────────────────────────────────────────────────
    const r3top  = y0 + row1H + 2 * row2H;
    const dlMid  = r3top + row3H / 2 + 1;
    sep(x, r3top, xR, r3top);

    doc.setFontSize(FS_B);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(120);
    doc.text('Roast Date', tx, r3top + 2.2);
    doc.setFontSize(FS_V);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.text(item.date || '—', tx, dlMid);

    sep(x + halfW, r3top, x + halfW, r3top + row3H);

    doc.setFontSize(FS_B);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(120);
    doc.text('Lot', x + halfW + 2, r3top + 2.2);
    doc.setFontSize(FS_V);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.text(item.lot || '—', x + halfW + 2, dlMid);

    // ── Footer ────────────────────────────────────────────────────────────────
    const footTop = r3top + row3H;
    sep(x, footTop, xR, footTop);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50);
    doc.text('BUTLER COFFEE', PW / 2, footTop + footH / 2 + 1, { align: 'center' });
  }

  return doc;
}

// ── HTML label preview ────────────────────────────────────────────────────────
function LabelPreview({ items }) {
  if (!items.length) return null;

  // Group into pages of 3
  const pages = [];
  for (let i = 0; i < items.length; i += 3) pages.push(items.slice(i, i + 3));

  return (
    <div className="lbl-pages">
      {pages.map((page, pi) => (
        <div key={pi} className="lbl-page">
          <div className="lbl-page__label">Page {pi + 1}</div>
          <div className="lbl-sheet">
            {page.map((item, idx) => {
              const color = tierColor(item.coffee.level);
              return (
                <div key={idx} className="lbl">
                  <div className="lbl-stripe" style={{ background: color }} />
                  <div className="lbl-body">
                    <div className="lbl-top">
                      <div className="lbl-top__meta">
                        <span className="lbl-tier" style={{ color }}>{tierLabel(item.coffee.level).toUpperCase()}</span>
                        <span className="lbl-bagsize">{item.bagSize}</span>
                      </div>
                      {item.sub && <div className="lbl-sub">{item.sub}</div>}
                      <div className="lbl-name">{item.coffee.name}</div>
                      {item.notes && <div className="lbl-notes">{item.notes}</div>}
                    </div>
                    <div className="lbl-divider" />
                    <div className="lbl-grid">
                      {[
                        { h: 'Process',  v: item.process },
                        { h: 'Variety',  v: item.variety },
                        { h: 'Region',   v: item.region  },
                        { h: 'Altitude', v: item.alt     },
                      ].map(c => (
                        <div key={c.h} className="lbl-cell">
                          <span className="lbl-ch">{c.h}</span>
                          <span className="lbl-cv">{c.v || '—'}</span>
                        </div>
                      ))}
                    </div>
                    <div className="lbl-divider" />
                    <div className="lbl-grid">
                      {[
                        { h: 'Farm',    v: item.farm     },
                        { h: 'Farmer',  v: item.farmer   },
                        { h: 'Roast',   v: item.roast    },
                        { h: 'Roaster', v: item.roasters },
                      ].map(c => (
                        <div key={c.h} className="lbl-cell">
                          <span className="lbl-ch">{c.h}</span>
                          <span className="lbl-cv">{c.v || '—'}</span>
                        </div>
                      ))}
                    </div>
                    <div className="lbl-divider" />
                    <div className="lbl-datelot">
                      <div className="lbl-datelot__half">
                        <span className="lbl-ch">Roast Date</span>
                        <span className="lbl-cv">{item.date || '—'}</span>
                      </div>
                      <div className="lbl-datelot__sep" />
                      <div className="lbl-datelot__half">
                        <span className="lbl-ch">Lot</span>
                        <span className="lbl-cv">{item.lot || '—'}</span>
                      </div>
                    </div>
                    <div className="lbl-divider" />
                    <div className="lbl-footer">BUTLER COFFEE</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LabelsPanel({ coffees, onBack }) {
  // — Selected coffee + form fields —
  const [selectedId, setSelectedId] = useState('');
  const [bagSize, setBagSize]       = useState('');
  const [qty,     setQty]           = useState(1);
  const [lot,     setLot]           = useState('');
  const [date,    setDate]          = useState(todayStr());
  const [details, setDetails]       = useState(blankDetails(null));

  // — Queue & UI state —
  const [queue,      setQueue]      = useState([]);
  const [pdfStatus,  setPdfStatus]  = useState('idle'); // 'idle'|'loading'|'done'|'error'
  const [pdfUrl,     setPdfUrl]     = useState(null);
  const [showPreview, setShowPreview] = useState(true);

  const selectedCoffee = coffees.find(c => c.id === selectedId) || null;

  // Auto-fill details when coffee changes
  function selectCoffee(id) {
    setSelectedId(id);
    const c = coffees.find(x => x.id === id) || null;
    setDetails(blankDetails(c));
    // Pre-select first bag size if available
    if (c?.bagSizes?.length) setBagSize(c.bagSizes[0]);
    else setBagSize('');
  }

  function det(key, val) {
    setDetails(prev => ({ ...prev, [key]: val }));
  }

  function addToQueue() {
    if (!selectedCoffee) return;
    const count = Math.max(1, Number(qty) || 1);
    const item = {
      coffee: selectedCoffee,
      bagSize, qty: count, lot, date,
      ...details,
    };
    const newItems = Array.from({ length: count }, () => ({ ...item }));
    setQueue(prev => [...prev, ...newItems]);
    setPdfUrl(null);
  }

  function removeFromQueue(idx) {
    setQueue(prev => prev.filter((_, i) => i !== idx));
    setPdfUrl(null);
  }

  function clearQueue() {
    setQueue([]);
    setPdfUrl(null);
  }

  async function generate() {
    if (!queue.length) return;
    setPdfStatus('loading');
    setPdfUrl(null);
    try {
      const doc = await buildPDF(queue);
      const blob = doc.output('blob');
      const url  = URL.createObjectURL(blob);
      setPdfUrl(url);
      setPdfStatus('done');
    } catch (err) {
      console.error(err);
      setPdfStatus('error');
    }
  }

  // Sorted coffees list for selector
  const sortedCoffees = [...coffees].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <div className="labels-panel">
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="form-header">
        <button className="form-header__back" onClick={onBack}>← Back</button>
        <h1 className="form-header__title">Label Generator</h1>
      </div>

      <div className="labels-layout">
        {/* ── LEFT COLUMN: coffee selector + detail fields ─────────────────── */}
        <div className="labels-left">
          <div className="card">
            <div className="card__header">Coffee</div>

            <div className="field">
              <label>Select coffee</label>
              <select
                className="input"
                value={selectedId}
                onChange={e => selectCoffee(e.target.value)}
              >
                <option value="">— choose a coffee —</option>
                {sortedCoffees.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-grid form-grid--2">
              <div className="field">
                <label>Bag size</label>
                {selectedCoffee?.bagSizes?.length ? (
                  <select className="input" value={bagSize} onChange={e => setBagSize(e.target.value)}>
                    <option value="">— size —</option>
                    {selectedCoffee.bagSizes.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ) : (
                  <input className="input" type="text" value={bagSize} onChange={e => setBagSize(e.target.value)} placeholder="e.g. 250g" />
                )}
              </div>
              <div className="field">
                <label>Qty to add</label>
                <input className="input" type="number" min="1" max="99" value={qty} onChange={e => setQty(e.target.value)} />
              </div>
            </div>

            <div className="form-grid form-grid--2">
              <div className="field">
                <label>Roast date</label>
                <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Lot #</label>
                <input className="input" type="text" value={lot} onChange={e => setLot(e.target.value)} placeholder="e.g. 24-07" />
              </div>
            </div>
          </div>

          {/* ── Detail overrides ─────────────────────────────────────────── */}
          <div className="card">
            <div className="card__header">Details <span style={{fontWeight:400,fontSize:'0.78rem',color:'var(--muted)'}}>— auto-filled, editable</span></div>

            <div className="field">
              <label>Subtitle</label>
              <input className="input" type="text" value={details.sub} onChange={e => det('sub', e.target.value)} placeholder="e.g. Washed Ethiopian" />
            </div>

            <div className="form-grid form-grid--2">
              <div className="field">
                <label>Process</label>
                <input className="input" type="text" value={details.process} onChange={e => det('process', e.target.value)} />
              </div>
              <div className="field">
                <label>Variety</label>
                <input className="input" type="text" value={details.variety} onChange={e => det('variety', e.target.value)} />
              </div>
              <div className="field">
                <label>Region</label>
                <input className="input" type="text" value={details.region} onChange={e => det('region', e.target.value)} />
              </div>
              <div className="field">
                <label>Altitude</label>
                <input className="input" type="text" value={details.alt} onChange={e => det('alt', e.target.value)} />
              </div>
              <div className="field">
                <label>Farm</label>
                <input className="input" type="text" value={details.farm} onChange={e => det('farm', e.target.value)} />
              </div>
              <div className="field">
                <label>Farmer</label>
                <input className="input" type="text" value={details.farmer} onChange={e => det('farmer', e.target.value)} />
              </div>
              <div className="field">
                <label>Roast</label>
                <input className="input" type="text" value={details.roast} onChange={e => det('roast', e.target.value)} />
              </div>
              <div className="field">
                <label>Roaster</label>
                <input className="input" type="text" value={details.roasters} onChange={e => det('roasters', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Notes</label>
              <input className="input" type="text" value={details.notes} onChange={e => det('notes', e.target.value)} placeholder="Short tasting note or info" />
            </div>

            <div style={{ marginTop: 12 }}>
              <button
                className="btn btn--primary"
                onClick={addToQueue}
                disabled={!selectedCoffee || !bagSize}
                style={{ width: '100%' }}
              >
                + Add to Queue {qty > 1 ? `(×${qty})` : ''}
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN: queue + generate + preview ──────────────────────── */}
        <div className="labels-right">
          {/* Queue */}
          <div className="card">
            <div className="card__header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span>Queue <span className="nav-link__badge" style={{marginLeft:6}}>{queue.length}</span></span>
              {queue.length > 0 && (
                <button className="btn btn--ghost btn--sm" onClick={clearQueue}>Clear all</button>
              )}
            </div>

            {queue.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div className="empty-state__icon">🏷️</div>
                <div className="empty-state__title">Queue is empty</div>
                <div className="empty-state__text">Select a coffee and add it to the queue.</div>
              </div>
            ) : (
              <div className="queue-list">
                {queue.map((item, idx) => (
                  <div key={idx} className="queue-item">
                    <div className="queue-item__stripe" style={{ background: tierColor(item.coffee.level) }} />
                    <div className="queue-item__body">
                      <div className="queue-item__name">{item.coffee.name}</div>
                      <div className="queue-item__meta">
                        {item.bagSize && <span>{item.bagSize}</span>}
                        {item.date && <span>{item.date}</span>}
                        {item.lot && <span>Lot {item.lot}</span>}
                      </div>
                    </div>
                    <button
                      className="btn btn--ghost btn--sm btn--icon"
                      style={{ color: 'var(--red)', flexShrink: 0 }}
                      onClick={() => removeFromQueue(idx)}
                      title="Remove"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            {queue.length > 0 && (
              <div style={{ marginTop: 16, display: 'flex', gap: 10, flexDirection: 'column' }}>
                <button
                  className="btn btn--primary"
                  onClick={generate}
                  disabled={pdfStatus === 'loading'}
                  style={{ width: '100%' }}
                >
                  {pdfStatus === 'loading' ? '⏳ Generating PDF…' : `📄 Generate PDF (${queue.length} label${queue.length !== 1 ? 's' : ''})`}
                </button>
                {pdfStatus === 'done' && pdfUrl && (
                  <a
                    href={pdfUrl}
                    download={`butler-labels-${new Date().toISOString().slice(0,10)}.pdf`}
                    className="btn btn--ghost"
                    style={{ width: '100%', textAlign: 'center', textDecoration: 'none' }}
                  >
                    ⬇️ Download PDF
                  </a>
                )}
                {pdfStatus === 'error' && (
                  <div style={{ color: 'var(--red)', fontSize: '0.85rem' }}>
                    PDF generation failed. Check browser console for details.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Preview */}
          {queue.length > 0 && (
            <div className="card">
              <div className="card__header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span>Preview</span>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => setShowPreview(p => !p)}
                >
                  {showPreview ? 'Hide' : 'Show'}
                </button>
              </div>
              {showPreview && <LabelPreview items={queue} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
