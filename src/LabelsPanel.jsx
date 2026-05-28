import { useState } from 'react';
import { useCoffee } from './CoffeeContext.jsx';

// ── Utilities ─────────────────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().slice(0, 10); }

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
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
    notes:    coffee?.notes    || '',
  };
}

// ── jsPDF loader ──────────────────────────────────────────────────────────────
let _jsPDFLoaded = false;
async function loadJsPDF() {
  if (_jsPDFLoaded || window.jspdf) { _jsPDFLoaded = true; return; }
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  _jsPDFLoaded = true;
}

// ── PDF generation ────────────────────────────────────────────────────────────
// Page: 101.6 × 152.4 mm (4"×6"), 3 labels per page, black/white only.
// Layout per label matches the sample: level+name+bagsize header, italic notes,
// 2×4-col detail grids, roast-date/lot-no inline row, footer.
async function buildPDF(queue) {
  await loadJsPDF();
  const { jsPDF } = window.jspdf;

  // ── Page / label geometry ─────────────────────────────────────────────────
  const PW = 101.6, PH = 152.4;
  const mL = 3, mT = 3;
  const gapY = 1.5;
  const LW = PW - mL * 2;                         // 95.6 mm
  const LH = (PH - mT * 2 - gapY * 2) / 3;       // ≈ 47.8 mm
  const pad = 2;                                   // inner text margin

  // ── Section heights (must sum to LH) ─────────────────────────────────────
  const headerH = 16;    // level + name/bagsize + notes
  const gridH   = 9;     // each 4-column grid row
  const dateH   = 6.4;   // roast date / lot no. inline
  const footH   = LH - headerH - gridH * 2 - dateH; // ≈ 7.4

  const colW  = LW / 4;
  const halfW = LW / 2;

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: [PW, PH] });
  doc.setFont('helvetica');

  // Helper: horizontal/vertical separator lines
  const hline = (y, x1 = mL, x2 = mL + LW, lw = 0.25) => {
    doc.setDrawColor(0); doc.setLineWidth(lw);
    doc.line(x1, y, x2, y);
  };
  const vline = (x, y1, y2, lw = 0.25) => {
    doc.setDrawColor(0); doc.setLineWidth(lw);
    doc.line(x, y1, x, y2);
  };

  // Draw one grid block (4 columns)
  const drawGrid = (cols, gx, gy, gh) => {
    cols.forEach(({ h, v }, ci) => {
      const cx = gx + ci * colW;
      if (ci > 0) vline(cx, gy, gy + gh);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(0);
      doc.text(h, cx + pad, gy + 3.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text((v || '—').slice(0, 13), cx + pad, gy + gh - 2);
    });
  };

  for (let qi = 0; qi < queue.length; qi++) {
    if (qi > 0 && qi % 3 === 0) doc.addPage([PW, PH]);
    const item = queue[qi];
    const slot = qi % 3;

    const lx = mL;
    const ly = mT + slot * (LH + gapY);
    const rx = lx + LW;
    const tx = lx + pad;
    const trx = rx - pad;

    // ── Outer border ──────────────────────────────────────────────────────
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(lx, ly, LW, LH);

    // ── HEADER ────────────────────────────────────────────────────────────
    // Subscription level — small bold, top left
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(0);
    const levelStr = (item.level || 'BUTLER COFFEE').toUpperCase();
    doc.text(levelStr, tx, ly + 4);

    // Coffee name — large bold, left; Bag size — right-aligned, same line
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(item.coffee.name || '', tx, ly + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(item.bagSize || '', trx, ly + 10, { align: 'right' });

    // Notes — italic, line below name
    if (item.notes) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(30);
      doc.text(item.notes, tx, ly + 14.5, { maxWidth: LW - pad * 2 });
      doc.setTextColor(0);
    }

    hline(ly + headerH);

    // ── GRID 1: PROCESS / VARIETY / REGION / ALT (M) ─────────────────────
    const g1y = ly + headerH;
    drawGrid([
      { h: 'PROCESS', v: item.process },
      { h: 'VARIETY', v: item.variety },
      { h: 'REGION',  v: item.region  },
      { h: 'ALT (M)', v: item.alt     },
    ], lx, g1y, gridH);
    hline(g1y + gridH);

    // ── GRID 2: FARM / FARMER / ROAST / ROASTERS ─────────────────────────
    const g2y = ly + headerH + gridH;
    drawGrid([
      { h: 'FARM',     v: item.farm     },
      { h: 'FARMER',   v: item.farmer   },
      { h: 'ROAST',    v: item.roast    },
      { h: 'ROASTERS', v: item.roasters },
    ], lx, g2y, gridH);
    hline(g2y + gridH);

    // ── ROAST DATE / LOT NO. (inline, single line) ────────────────────────
    const dry  = ly + headerH + gridH * 2;
    const dmy  = dry + dateH / 2 + 1.5; // vertical centre

    // Left half: ROAST DATE label then value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('ROAST DATE', tx, dmy);
    const rdW = doc.getTextWidth('ROAST DATE') + 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(formatDate(item.date), tx + rdW, dmy);

    vline(lx + halfW, dry, dry + dateH);

    // Right half: LOT NO. label then value
    const lotX = lx + halfW + pad;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('LOT NO.', lotX, dmy);
    const lnW = doc.getTextWidth('LOT NO.') + 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(String(item.lot || '—'), lotX + lnW, dmy);

    hline(dry + dateH);

    // ── FOOTER ────────────────────────────────────────────────────────────
    const fty = dry + dateH;
    const fmy = fty + footH / 2 + 1.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(0);
    doc.text('Best before one year after roast date.', tx, fmy);
    doc.text('www.butler.coffee', trx, fmy, { align: 'right' });
  }

  return doc;
}

// ── Single label HTML preview ─────────────────────────────────────────────────
function LabelPreview({ item }) {
  return (
    <div className="lbl">
      <div className="lbl-body">
        {/* Header */}
        <div className="lbl-header">
          <div className="lbl-header__top">
            <span className="lbl-level">{(item.level || 'BUTLER COFFEE').toUpperCase()}</span>
            <span className="lbl-bagsize">{item.bagSize}</span>
          </div>
          <div className="lbl-name">{item.coffee.name}</div>
          {item.notes && <div className="lbl-notes">{item.notes}</div>}
        </div>

        <div className="lbl-sep" />

        {/* Grid 1 */}
        <div className="lbl-grid">
          {[
            { h: 'PROCESS', v: item.process },
            { h: 'VARIETY', v: item.variety },
            { h: 'REGION',  v: item.region  },
            { h: 'ALT (M)', v: item.alt     },
          ].map(c => (
            <div key={c.h} className="lbl-cell">
              <span className="lbl-ch">{c.h}</span>
              <span className="lbl-cv">{c.v || '—'}</span>
            </div>
          ))}
        </div>

        <div className="lbl-sep" />

        {/* Grid 2 */}
        <div className="lbl-grid">
          {[
            { h: 'FARM',     v: item.farm     },
            { h: 'FARMER',   v: item.farmer   },
            { h: 'ROAST',    v: item.roast    },
            { h: 'ROASTERS', v: item.roasters },
          ].map(c => (
            <div key={c.h} className="lbl-cell">
              <span className="lbl-ch">{c.h}</span>
              <span className="lbl-cv">{c.v || '—'}</span>
            </div>
          ))}
        </div>

        <div className="lbl-sep" />

        {/* Date / Lot */}
        <div className="lbl-datelot">
          <div className="lbl-datelot__half">
            <span className="lbl-ch">ROAST DATE</span>
            <span className="lbl-dv">{formatDate(item.date)}</span>
          </div>
          <div className="lbl-datelot__vsep" />
          <div className="lbl-datelot__half">
            <span className="lbl-ch">LOT NO.</span>
            <span className="lbl-dv">{item.lot || '—'}</span>
          </div>
        </div>

        <div className="lbl-sep" />

        {/* Footer */}
        <div className="lbl-footer">
          <span>Best before one year after roast date.</span>
          <span>www.butler.coffee</span>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function LabelsPanel() {
  const { coffees } = useCoffee();
  // Form state
  const [selectedId, setSelectedId] = useState('');
  const [bagSize,    setBagSize]    = useState('');
  const [qty,        setQty]        = useState(1);
  const [lotNo,      setLotNo]      = useState('');
  const [roastDate,  setRoastDate]  = useState(todayISO());
  const [details,    setDetails]    = useState(blankDetails(null));
  const [errors,     setErrors]     = useState({});

  // Queue + PDF state
  const [queue,      setQueue]      = useState([]);
  const [pdfStatus,  setPdfStatus]  = useState('idle');
  const [pdfUrl,     setPdfUrl]     = useState(null);
  const [pdfBlob,    setPdfBlob]    = useState(null);

  const selectedCoffee = coffees.find(c => c.id === selectedId) || null;

  function selectCoffee(id) {
    setSelectedId(id);
    const c = coffees.find(x => x.id === id) || null;
    setDetails(blankDetails(c));
    if (c?.bagSizes?.length) setBagSize(c.bagSizes[0]);
    else setBagSize('');
  }

  function det(k, v) { setDetails(p => ({ ...p, [k]: v })); }

  function validate() {
    const e = {};
    if (!selectedCoffee)    e.coffee   = 'Select a coffee';
    if (!bagSize.trim())    e.bagSize  = 'Required';
    if (!lotNo.trim())      e.lotNo    = 'Required';
    if (!roastDate.trim())  e.roastDate = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function addToQueue() {
    if (!validate()) return;
    const count = Math.max(1, Number(qty) || 1);
    const item = {
      coffee: selectedCoffee,
      level: selectedCoffee.level || '',
      bagSize, lot: lotNo, date: roastDate,
      ...details,
    };
    setQueue(prev => [...prev, ...Array.from({ length: count }, () => ({ ...item }))]);
    setPdfUrl(null);
    setErrors({});
  }

  function removeItem(idx) { setQueue(p => p.filter((_, i) => i !== idx)); setPdfUrl(null); }
  function clearQueue()    { setQueue([]); setPdfUrl(null); setPdfBlob(null); }

  async function generate() {
    if (!queue.length) return;
    setPdfStatus('loading'); setPdfUrl(null); setPdfBlob(null);
    try {
      const doc  = await buildPDF(queue);
      const blob = doc.output('blob');
      setPdfBlob(blob);
      setPdfUrl(URL.createObjectURL(blob));
      setPdfStatus('done');
    } catch (err) {
      console.error(err);
      setPdfStatus('error');
    }
  }

  async function sharePDF() {
    if (!pdfBlob) return;
    const filename = `butler-labels-${new Date().toISOString().slice(0, 10)}.pdf`;
    const file = new File([pdfBlob], filename, { type: 'application/pdf' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Butler Coffee Labels' });
      } else if (navigator.share) {
        // Fallback: share without file (just title + text)
        await navigator.share({ title: 'Butler Coffee Labels', text: 'Your coffee labels are ready.' });
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    }
  }

  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  const sortedCoffees = [...coffees].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <div className="labels-panel">
      <div className="labels-layout">

        {/* ── LEFT: form ───────────────────────────────────────────────────── */}
        <div className="labels-left">

          {/* Coffee selector */}
          <div className="card">
            <div className="card__header">Coffee</div>
            <div className="card__body">

              <div className="field">
                <label>Coffee name</label>
                <select className={`input${errors.coffee ? ' input--error' : ''}`}
                  value={selectedId} onChange={e => selectCoffee(e.target.value)}>
                  <option value="">— select a coffee —</option>
                  {sortedCoffees.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {errors.coffee && <span className="field-error">{errors.coffee}</span>}
              </div>

              {selectedCoffee && (
                <div className="lbl-level-badge">
                  {(selectedCoffee.level || '').toUpperCase() || 'NO LEVEL'}
                </div>
              )}

              {/* Row 1: Bag size + Qty */}
              <div className="form-grid form-grid--bagqty">
                <div className="field">
                  <label>Bag size</label>
                  {selectedCoffee?.bagSizes?.length ? (
                    <select className={`input${errors.bagSize ? ' input--error' : ''}`}
                      value={bagSize} onChange={e => setBagSize(e.target.value)}>
                      <option value="">— size —</option>
                      {selectedCoffee.bagSizes.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <input className={`input${errors.bagSize ? ' input--error' : ''}`}
                      type="text" value={bagSize}
                      onChange={e => setBagSize(e.target.value)} placeholder="250g" />
                  )}
                  {errors.bagSize && <span className="field-error">{errors.bagSize}</span>}
                </div>
                <div className="field">
                  <label>Qty</label>
                  <input className="input" type="number" min="1" max="99"
                    value={qty} onChange={e => setQty(e.target.value)} />
                </div>
              </div>

              {/* Row 2: Lot no. + Roast date */}
              <div className="form-grid form-grid--2">
                <div className="field">
                  <label>Lot no. <span className="field-req">*</span></label>
                  <input className={`input${errors.lotNo ? ' input--error' : ''}`}
                    type="text" value={lotNo}
                    onChange={e => setLotNo(e.target.value)} placeholder="e.g. 24-07" />
                  {errors.lotNo && <span className="field-error">{errors.lotNo}</span>}
                </div>
                <div className="field">
                  <label>Roast date <span className="field-req">*</span></label>
                  <input className={`input${errors.roastDate ? ' input--error' : ''}`}
                    type="date" value={roastDate}
                    onChange={e => setRoastDate(e.target.value)} />
                  {errors.roastDate && <span className="field-error">{errors.roastDate}</span>}
                </div>
              </div>

            </div>
          </div>

          {/* Detail fields */}
          <div className="card">
            <div className="card__header">
              Details
              <span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--muted)', marginLeft: 6 }}>auto-filled · editable</span>
            </div>
            <div className="card__body">

              <div className="form-grid form-grid--eq2">
                {[
                  { label: 'Process',      key: 'process'  },
                  { label: 'Variety',      key: 'variety'  },
                  { label: 'Region',       key: 'region'   },
                  { label: 'Altitude (m)', key: 'alt'      },
                  { label: 'Farm',         key: 'farm'     },
                  { label: 'Farmer',       key: 'farmer'   },
                  { label: 'Roast',        key: 'roast'    },
                  { label: 'Roasters',     key: 'roasters' },
                ].map(({ label, key }) => (
                  <div className="field" key={key}>
                    <label>{label}</label>
                    <input className="input" type="text" value={details[key]}
                      onChange={e => det(key, e.target.value)} />
                  </div>
                ))}
              </div>

              <div className="field">
                <label>Notes</label>
                <input className="input" type="text" value={details.notes}
                  onChange={e => det('notes', e.target.value)}
                  placeholder="Short tasting note, e.g. Mango, Berries, Chocolate" />
              </div>

              <div style={{ marginTop: 14 }}>
                <button className="btn btn--primary" onClick={addToQueue}
                  style={{ width: '100%' }}>
                  + Add to queue{qty > 1 ? ` (×${qty})` : ''}
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* ── RIGHT: queue + generate + preview ────────────────────────────── */}
        <div className="labels-right">
          <div className="card">
            <div className="card__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Queue <span className="nav-link__badge" style={{ marginLeft: 6 }}>{queue.length}</span></span>
              {queue.length > 0 && (
                <button className="btn btn--ghost btn--sm" onClick={clearQueue}>Clear all</button>
              )}
            </div>
            <div className="card__body">

              {queue.length === 0 ? (
                <div className="empty-state" style={{ padding: '12px 0' }}>
                  <div className="empty-state__icon">🏷️</div>
                  <div className="empty-state__title">Queue is empty</div>
                  <div className="empty-state__text">Fill in the form and click Add to queue.</div>
                </div>
              ) : (
                <div className="queue-list">
                  {queue.map((item, idx) => (
                    <div key={idx} className="queue-item">
                      <div className="queue-item__body">
                        <div className="queue-item__name">{item.coffee.name}</div>
                        <div className="queue-item__meta">
                          {item.bagSize && <span>{item.bagSize}</span>}
                          <span>{formatDate(item.date)}</span>
                          {item.lot && <span>Lot {item.lot}</span>}
                        </div>
                      </div>
                      <button className="btn btn--ghost btn--sm btn--icon"
                        style={{ color: 'var(--red)', flexShrink: 0 }}
                        onClick={() => removeItem(idx)} title="Remove">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {queue.length > 0 && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button className="btn btn--primary" onClick={generate}
                    disabled={pdfStatus === 'loading'} style={{ width: '100%' }}>
                    {pdfStatus === 'loading'
                      ? '⏳ Generating…'
                      : `📄 Generate PDF (${queue.length} label${queue.length !== 1 ? 's' : ''})`}
                  </button>
                  {pdfStatus === 'done' && pdfUrl && (
                    <div className="pdf-actions">
                      <a href={pdfUrl}
                        download={`butler-labels-${new Date().toISOString().slice(0, 10)}.pdf`}
                        className="btn btn--ghost pdf-actions__btn"
                        style={{ textDecoration: 'none', textAlign: 'center' }}>
                        ⬇️ Download
                      </a>
                      {canShare && (
                        <button className="btn btn--ghost pdf-actions__btn" onClick={sharePDF}>
                          ↗️ Share
                        </button>
                      )}
                    </div>
                  )}
                  {pdfStatus === 'error' && (
                    <div style={{ color: 'var(--red)', fontSize: '0.85rem' }}>
                      PDF generation failed — check console.
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* Preview */}
          {queue.length > 0 && (
            <div className="card">
              <div className="card__header">Preview</div>
              <div className="card__body">
                <div className="lbl-preview-list">
                  {queue.map((item, idx) => (
                    <div key={idx} style={{ marginBottom: idx < queue.length - 1 ? 16 : 0 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
                        Label {idx + 1}
                      </div>
                      <LabelPreview item={item} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
