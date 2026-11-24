/**
 * SettingsPanel — site-wide settings shown on the public website:
 * contact email, Stripe Customer Portal link, and the company details used
 * on the legal pages and in the footer. Saved to the "Settings" sheet tab;
 * saving triggers a website rebuild (auto-publish).
 */
import { useEffect, useState } from 'react';
import { apiCall } from './lib/api.js';

const EMPTY = {
  contactEmail: '', portalUrl: '',
  companyName: '', companyAddress: '', companyTaxId: '',
  legalUpdated: '',
};

const FIELDS = [
  {
    group: 'Contact', icon: '✉️',
    items: [
      { key: 'contactEmail', label: 'Contact email', type: 'email', placeholder: 'hola@butler.coffee',
        hint: 'Shown in the footer, on the Contact, Portal and legal pages, and in the contact form error message.' },
      { key: 'portalUrl', label: 'Stripe Customer Portal link', type: 'url', placeholder: 'https://billing.stripe.com/p/login/…',
        hint: 'From Stripe → Settings → Billing → Customer portal. Leave empty and the Portal page asks customers to email you instead.' },
    ],
  },
  {
    group: 'Company (legal pages & footer)', icon: '🏢',
    items: [
      { key: 'companyName', label: 'Legal name', placeholder: 'Butler Society SL',
        hint: 'The registered business name used in the legal pages and the footer copyright.' },
      { key: 'companyAddress', label: 'Registered address', placeholder: 'Calle …, 28001 Madrid, Spain',
        hint: 'Leave empty to hide it from the legal pages.' },
      { key: 'companyTaxId', label: 'Tax ID (CIF / NIF)', placeholder: 'B12345678',
        hint: 'Leave empty to hide it from the legal pages.' },
      { key: 'legalUpdated', label: 'Legal pages “last updated”', placeholder: '24 November 2026',
        hint: 'Shown at the top of every legal page. Leave empty to keep each page’s own date.' },
    ],
  },
];

export default function SettingsPanel() {
  const [form, setForm]       = useState(EMPTY);
  const [saved, setSaved]     = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [status, setStatus]   = useState(null); // { type: 'success'|'error', msg }

  useEffect(() => {
    let cancelled = false;
    apiCall('GET', undefined, 'settings')
      .then(data => { if (!cancelled) { const v = { ...EMPTY, ...data }; setForm(v); setSaved(v); } })
      .catch(err => { if (!cancelled) setStatus({ type: 'error', msg: `Could not load settings: ${err.message}` }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const dirty = Object.keys(EMPTY).some(k => (form[k] || '') !== (saved[k] || ''));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const data = await apiCall('POST', { action: 'save', settings: form }, 'settings');
      const v = { ...EMPTY, ...data };
      setForm(v);
      setSaved(v);
      setStatus({ type: 'success', msg: 'Saved. The website will update in about a minute.' });
    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-panel active">
      <div className="form-header">
        <h1 className="form-header__title">Site Settings</h1>
      </div>

      {loading ? (
        <div style={{ padding: 24, color: 'var(--muted, #888)' }}>Loading settings…</div>
      ) : (
        <form onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
          {FIELDS.map(section => (
            <div className="card" key={section.group}>
              <div className="card__header">
                <span className="card__icon">{section.icon}</span>
                <span className="card__title">{section.group}</span>
              </div>
              <div className="card__body">
                {section.items.map(f => (
                  <div className="field" key={f.key}>
                    <label htmlFor={`set-${f.key}`}>{f.label}</label>
                    <input
                      id={`set-${f.key}`}
                      className="input"
                      type={f.type || 'text'}
                      value={form[f.key] || ''}
                      placeholder={f.placeholder}
                      onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
                    />
                    {f.hint && <div className="field-hint">{f.hint}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {status && (
            <div
              role={status.type === 'error' ? 'alert' : 'status'}
              style={{
                margin: '8px 0 16px', padding: '10px 14px', borderRadius: 8, fontSize: '0.9rem',
                background: status.type === 'error' ? 'rgba(255,80,80,0.12)' : 'rgba(80,200,120,0.12)',
                color: status.type === 'error' ? '#ff8a80' : '#7ee2a8',
              }}
            >
              {status.msg}
            </div>
          )}

          <div className="form-actions-row">
            <button type="button" className="btn btn--ghost btn--sm" disabled={!dirty || saving}
              onClick={() => { setForm(saved); setStatus(null); }}>
              Undo changes
            </button>
            <button type="submit" className="btn btn--primary" disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
