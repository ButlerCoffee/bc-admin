/**
 * BlogIndex — lists all published blog posts.
 * Posts are fetched from the GAS endpoint and sorted newest-first.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBlogPosts, invalidateBlogCache } from '../lib/blogApi.js';

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return iso; }
}

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function excerpt(content, max = 150) {
  const text = stripHtml(content);
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

export default function BlogIndex() {
  const navigate = useNavigate();
  const [posts,   setPosts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  function load(fresh = false) {
    if (fresh) invalidateBlogCache();
    setLoading(true);
    setError(null);
    getBlogPosts()
      .then(setPosts)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  /* ── Loading ── */
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260, gap: 16 }}>
      <div className="loading-spinner" />
      <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Loading posts…</span>
    </div>
  );

  /* ── Error ── */
  if (error) return (
    <div className="empty-state" style={{ padding: '60px 24px' }}>
      <div className="empty-state__icon">⚠️</div>
      <div className="empty-state__title">Couldn't load posts</div>
      <div className="empty-state__text">{error}</div>
      <button className="btn btn--ghost btn--sm" style={{ marginTop: 16 }} onClick={() => load(true)}>
        Try again
      </button>
    </div>
  );

  /* ── Empty ── */
  if (!posts.length) return (
    <div className="empty-state" style={{ padding: '60px 24px' }}>
      <div className="empty-state__icon">✍️</div>
      <div className="empty-state__title">No posts yet</div>
      <div className="empty-state__text">
        Add Google Docs to the Published Drive folder to publish them here.
      </div>
      <button className="btn btn--ghost btn--sm" style={{ marginTop: 16 }} onClick={() => load(true)}>
        Refresh
      </button>
    </div>
  );

  /* ── List ── */
  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.4rem', fontWeight: 800, margin: 0, marginBottom: 3 }}>
            Blog
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: 0 }}>
            {posts.length} article{posts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={() => load(true)} title="Refresh posts">
          <i className="fa-solid fa-rotate" style={{ marginRight: 5 }} />Refresh
        </button>
      </div>

      {/* Post cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {posts.map(post => (
          <div
            key={post.id}
            onClick={() => navigate(`/butlercoffee/blog/${post.slug}`)}
            style={{
              background: 'var(--surf)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r2)',
              padding: '20px 24px',
              cursor: 'pointer',
              transition: 'border-color var(--ease), transform var(--ease)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#bbb'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; }}
          >
            {/* Title + date row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
              <h3 style={{
                fontFamily: 'var(--font-head)',
                fontSize: '1.05rem',
                fontWeight: 700,
                margin: 0,
                lineHeight: 1.35,
                color: 'var(--text)',
              }}>
                {post.title}
              </h3>
              <span style={{
                color: 'var(--muted)',
                fontSize: '0.72rem',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                paddingTop: 3,
              }}>
                {formatDate(post.updated)}
              </span>
            </div>

            {/* Excerpt */}
            {post.content && (
              <p style={{
                margin: '0 0 12px',
                color: 'var(--muted)',
                fontSize: '0.83rem',
                lineHeight: 1.65,
              }}>
                {excerpt(post.content)}
              </p>
            )}

            {/* Read link */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '0.75rem',
              fontWeight: 700,
              color: 'var(--text)',
              background: 'var(--yellow)',
              padding: '3px 10px',
              borderRadius: 4,
            }}>
              Read article
              <i className="fa-solid fa-arrow-right" style={{ fontSize: '0.68rem' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
