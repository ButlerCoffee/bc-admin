/**
 * BlogPost — renders a single article by slug.
 * Fetches from the GAS endpoint (cached), matches by slug, renders HTML content.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getBlogPosts } from '../lib/blogApi.js';

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return iso; }
}

/**
 * Injects a <style> block for blog-content typography once per page lifecycle.
 * Styles target the raw HTML that Google Docs produces.
 */
function useBlogStyles() {
  useEffect(() => {
    if (document.getElementById('blog-content-styles')) return;
    const style = document.createElement('style');
    style.id = 'blog-content-styles';
    style.textContent = `
      .blog-content { line-height: 1.82; }
      .blog-content p   { margin: 0 0 1em; }
      .blog-content p:last-child { margin-bottom: 0; }
      .blog-content h1  { font-family: var(--font-head); font-size: 1.5rem;  font-weight: 800; margin: 1.6em 0 0.5em; line-height: 1.25; }
      .blog-content h2  { font-family: var(--font-head); font-size: 1.2rem;  font-weight: 700; margin: 1.4em 0 0.45em; line-height: 1.3; }
      .blog-content h3  { font-family: var(--font-head); font-size: 1rem;    font-weight: 700; margin: 1.2em 0 0.4em; }
      .blog-content h4, .blog-content h5 { font-family: var(--font-head); font-weight: 700; margin: 1em 0 0.4em; }
      .blog-content h1:first-child,
      .blog-content h2:first-child { margin-top: 0; }
      .blog-content ul, .blog-content ol { margin: 0 0 1em 1.4em; }
      .blog-content li  { margin-bottom: 0.3em; }
      .blog-content strong { font-weight: 700; }
      .blog-content em { font-style: italic; }
      .blog-content a  { color: var(--text); text-decoration: underline; text-underline-offset: 2px; }
      .blog-content a:hover { opacity: 0.7; }
      .blog-content hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }
      .blog-content blockquote {
        margin: 1.2em 0;
        padding: 14px 18px;
        border-left: 3px solid var(--yellow);
        background: var(--bg);
        border-radius: 0 var(--r) var(--r) 0;
        font-style: italic;
        color: var(--muted);
      }
      .blog-content blockquote p { margin: 0; }
      .blog-content img {
        max-width: 100%;
        border-radius: var(--r);
        margin: 0.5em 0;
      }
      .blog-content table {
        width: 100%;
        border-collapse: collapse;
        margin: 1em 0;
        font-size: 0.88rem;
      }
      .blog-content th, .blog-content td {
        text-align: left;
        padding: 8px 12px;
        border: 1px solid var(--border);
      }
      .blog-content th {
        background: var(--bg);
        font-weight: 700;
      }
      .blog-content code {
        font-family: monospace;
        font-size: 0.88em;
        background: var(--bg);
        padding: 1px 5px;
        border-radius: 3px;
        border: 1px solid var(--border);
      }
      .blog-content pre {
        background: #1e1e1e;
        color: #d4d4d4;
        padding: 16px 18px;
        border-radius: var(--r);
        overflow-x: auto;
        margin: 1em 0;
        font-size: 0.83em;
      }
      .blog-content pre code {
        background: none;
        border: none;
        padding: 0;
        color: inherit;
      }
    `;
    document.head.appendChild(style);
  }, []);
}

export default function BlogPost() {
  const { slug }   = useParams();
  const navigate   = useNavigate();
  const [post,     setPost]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [notFound, setNotFound] = useState(false);
  const scrolled   = useRef(false);

  useBlogStyles();

  useEffect(() => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    setPost(null);
    scrolled.current = false;

    getBlogPosts()
      .then(posts => {
        const found = posts.find(p => p.slug === slug);
        if (found) {
          setPost(found);
          if (!scrolled.current) { window.scrollTo(0, 0); scrolled.current = true; }
        } else {
          setNotFound(true);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  /* ── Loading ── */
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260, gap: 16 }}>
      <div className="loading-spinner" />
    </div>
  );

  /* ── Error ── */
  if (error) return (
    <div className="empty-state" style={{ padding: '60px 24px' }}>
      <div className="empty-state__icon">⚠️</div>
      <div className="empty-state__title">Couldn't load article</div>
      <div className="empty-state__text">{error}</div>
      <button className="btn btn--ghost btn--sm" style={{ marginTop: 16 }} onClick={() => navigate('/butlercoffee/blog')}>
        ← Back to Blog
      </button>
    </div>
  );

  /* ── Not found ── */
  if (notFound) return (
    <div className="empty-state" style={{ padding: '60px 24px' }}>
      <div className="empty-state__icon">🔍</div>
      <div className="empty-state__title">Article not found</div>
      <div className="empty-state__text">
        No article matches the slug <code style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>"{slug}"</code>. It may have been moved or removed.
      </div>
      <button className="btn btn--ghost btn--sm" style={{ marginTop: 16 }} onClick={() => navigate('/butlercoffee/blog')}>
        ← Back to Blog
      </button>
    </div>
  );

  /* ── Article ── */
  return (
    <div className="view-panel">
      {/* Back navigation */}
      <div className="form-header" style={{ marginBottom: 0 }}>
        <button className="form-header__back" onClick={() => navigate('/butlercoffee/blog')}>
          ← Blog
        </button>
      </div>

      {/* Article wrapper — narrow reading column */}
      <div style={{ maxWidth: 700, margin: '0 auto', paddingTop: 8 }}>

        {/* ── Article header ── */}
        <div style={{
          marginBottom: 36,
          paddingBottom: 28,
          borderBottom: '1px solid var(--border)',
        }}>
          {/* Yellow rule */}
          <div style={{ width: 36, height: 3, background: 'var(--yellow)', borderRadius: 2, marginBottom: 18 }} />

          <h1 style={{
            fontFamily: 'var(--font-head)',
            fontSize: 'clamp(1.4rem, 3vw, 2rem)',
            fontWeight: 800,
            lineHeight: 1.2,
            margin: '0 0 14px',
            letterSpacing: '-0.02em',
          }}>
            {post.title}
          </h1>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--muted)',
            fontSize: '0.78rem',
          }}>
            <i className="fa-regular fa-clock" />
            <span>{formatDate(post.updated)}</span>
          </div>
        </div>

        {/* ── Article body ── */}
        <div
          className="blog-content"
          style={{ fontSize: '0.93rem', color: 'var(--text)' }}
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* ── Footer ── */}
        <div style={{
          marginTop: 48,
          paddingTop: 24,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => navigate('/butlercoffee/blog')}
          >
            ← All articles
          </button>
          <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>
            Butler Coffee
          </span>
        </div>
      </div>
    </div>
  );
}
