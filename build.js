// build.js
// Run with: node build.js
// Reads the Master Sheet (Blog, DigitalPosts, Art tabs) and generates the full
// bilingual site into /dist. Static pages (home, art shop, legal, etc.) are
// copied through from /source with their paths fixed for the new structure.

const fs = require('fs');
const path = require('path');
const { parseCSV } = require('./parse-csv');
const { parseBody } = require('./parse-body');

// ---------------------------------------------------------------------------
// CONFIG -- fill these in with your real values (see the README for how to find them)
// ---------------------------------------------------------------------------
const SHEET_ID = 'REPLACE_WITH_YOUR_SHEET_ID';
const TAB_GIDS = {
  blog: 'REPLACE_WITH_BLOG_TAB_GID',
  digitalPosts: 'REPLACE_WITH_DIGITALPOSTS_TAB_GID',
  art: 'REPLACE_WITH_ART_TAB_GID',
};
const SITE_URL = 'https://maisonevieve.com'; // update if still on the workers.dev address
// ---------------------------------------------------------------------------

const DIST = path.join(__dirname, 'dist');
const SOURCE = path.join(__dirname, 'source'); // your existing static pages live here
const ASSETS = ['images', 'videos', 'audio', 'pdfs']; // shared, not language-specific

function csvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
}

async function fetchTab(gid) {
  const res = await fetch(csvUrl(gid));
  if (!res.ok) throw new Error(`Failed to fetch sheet tab (gid ${gid}): ${res.status}`);
  const text = await res.text();
  return parseCSV(text);
}

function readPartial(name) {
  return fs.readFileSync(path.join(__dirname, 'partials', name), 'utf-8');
}

function readTemplate(name) {
  return fs.readFileSync(path.join(__dirname, 'templates', name), 'utf-8');
}

function fillTemplate(tpl, tokens) {
  let out = tpl;
  for (const [key, value] of Object.entries(tokens)) {
    out = out.split(`{{${key}}}`).join(value ?? '');
  }
  return out;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFile(relPath, content) {
  const fullPath = path.join(DIST, relPath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, content, 'utf-8');
}

// Groups rows that share a post_id into { en: row, fr: row } pairs
function groupByPostId(rows) {
  const groups = {};
  for (const row of rows) {
    const id = row.post_id || row.slug;
    if (!groups[id]) groups[id] = {};
    groups[id][row.lang || 'en'] = row;
  }
  return groups;
}

function formatDate(dateStr, lang) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
}

async function main() {
  console.log('Fetching Master Sheet...');
  const [blogRows, digitalRows, artRows] = await Promise.all([
    fetchTab(TAB_GIDS.blog),
    fetchTab(TAB_GIDS.digitalPosts),
    fetchTab(TAB_GIDS.art),
  ]);

  ensureDir(DIST);

  const sitemapUrls = []; // { loc, alternates: {en, fr} }

  // ---- Blog (public) ----
  const blogTemplate = readTemplate('blog-post.html');
  const blogGroups = groupByPostId(blogRows.filter(r => r.status === 'published'));
  const blogIndexByLang = { en: [], fr: [] };

  for (const [postId, langs] of Object.entries(blogGroups)) {
    const langPaths = {};
    for (const lang of ['en', 'fr']) {
      const row = langs[lang];
      if (!row) continue;
      const bodyHtml = parseBody(row.body);
      const html = fillTemplate(blogTemplate, {
        LANG: lang,
        TITLE: row.title,
        DATE: formatDate(row.date, lang),
        IMAGE: row.image,
        BODY_HTML: bodyHtml,
        HEADER: readPartial('header.html'),
        FOOTER: readPartial('footer-minimal.html'),
      });
      const relPath = `${lang}/blog/${row.slug}.html`;
      writeFile(relPath, html);
      langPaths[lang] = relPath;
      blogIndexByLang[lang].push(row);
    }
    if (Object.keys(langPaths).length) {
      sitemapUrls.push({ loc: langPaths, changefreq: 'monthly' });
    }
  }

  // ---- DigitalPosts (members-only, unlisted -- built, but never listed anywhere or in the sitemap) ----
  const digitalTemplate = readTemplate('digital-post.html');
  const digitalGroups = groupByPostId(digitalRows.filter(r => r.status === 'published'));
  for (const [postId, langs] of Object.entries(digitalGroups)) {
    for (const lang of ['en', 'fr']) {
      const row = langs[lang];
      if (!row) continue;
      const bodyHtml = parseBody(row.body);
      const gatedBadge = (row.gated || '').toLowerCase() === 'yes' ? '<div class="gated-badge">Members</div>' : '';
      const quoteBlock = row.quote ? `<p class="post-quote">"${row.quote}"</p>` : '';
      const html = fillTemplate(digitalTemplate, {
        LANG: lang,
        TITLE: row.title,
        DATE: formatDate(row.date, lang),
        IMAGE: row.image,
        BODY_HTML: bodyHtml,
        GATED_BADGE: gatedBadge,
        QUOTE_BLOCK: quoteBlock,
        HEADER: readPartial('header.html'),
        FOOTER: readPartial('footer-minimal.html'),
      });
      writeFile(`${lang}/members/${row.slug}.html`, html);
      // Deliberately NOT added to sitemapUrls or any listing page -- direct-link-only, as designed.
    }
  }

  // ---- Art (products) ----
  const productTemplate = readTemplate('product.html');
  const artGroups = groupByPostId(artRows);
  const availableArt = { en: [], fr: [] }; // status !== 'sold out', for listings

  for (const [postId, langs] of Object.entries(artGroups)) {
    const langPaths = {};
    for (const lang of ['en', 'fr']) {
      const row = langs[lang];
      if (!row) continue;

      const images = (row.images || '').split(',').map(s => s.trim()).filter(Boolean);
      const video = (row.video || '').trim();
      const galleryFiles = video ? [...images, video] : images;
      const slides = galleryFiles.map((f, i) => {
        const isVideo = /\.(mp4|mov|webm)$/i.test(f);
        const active = i === 0 ? ' active' : '';
        return isVideo
          ? `<div class="slide${active}"><video controls poster=""><source src="/videos/${f}" type="video/mp4"></video></div>`
          : `<div class="slide${active}"><img src="/images/${f}" alt=""></div>`;
      }).join('\n  ');
      const dots = galleryFiles.map((_, i) => `<span${i === 0 ? ' class="active"' : ''}></span>`).join('');

      const isOriginal = (row.type || '').toLowerCase() === 'original';
      const typeLabel = isOriginal ? 'Original Work' : 'Limited Print — Signed & Numbered';
      const editionLine = (!isOriginal && row.edition_size)
        ? `<p class="edition-line">Edition of ${row.edition_size} — ${row.edition_remaining} remaining</p>` : '';
      const mediumRow = (isOriginal && row.medium) ? `<tr><td>Medium</td><td>${row.medium}</td></tr>` : '';

      const html = fillTemplate(productTemplate, {
        LANG: lang,
        TITLE: row.title,
        TYPE_LABEL: typeLabel,
        EDITION_LINE: editionLine,
        DESCRIPTION: row.description,
        PRICE: row.price,
        SIZE: row.size,
        MATERIAL: row.material,
        MEDIUM_ROW: mediumRow,
        STRIPE_LINK: row.stripe_link,
        GALLERY_SLIDES: slides,
        GALLERY_DOTS: dots,
        HEADER: readPartial('header.html'),
        FOOTER: readPartial('footer-minimal.html'),
      });
      const relPath = `${lang}/art/${row.slug}.html`;
      writeFile(relPath, html);
      langPaths[lang] = relPath;

      if ((row.status || '').toLowerCase() !== 'sold out') {
        availableArt[lang].push({ ...row, _href: `/${lang}/art/${row.slug}.html` });
      }
    }
    if (Object.keys(langPaths).length) {
      sitemapUrls.push({ loc: langPaths, changefreq: 'weekly' });
    }
  }

  // ---- Card HTML for listings (latest 3, and full catalogue) ----
  function artCardHtml(row, featuredImgOverride) {
    const img = featuredImgOverride || row.featured || (row.images || '').split(',')[0].trim();
    const label = (row.type || '').toLowerCase() === 'original' ? 'Original work' : 'Limited print';
    const priceLabel = (row.type || '').toLowerCase() === 'original' ? 'Signed original' : 'Signed & numbered';
    return `<div class="art-card">
          <div class="media"><a href="${row._href}"><img src="/images/${img}" alt="${row.title}"></a></div>
          <h4>${row.title}</h4>
          <div class="price">${priceLabel}</div>
          <a href="${row._href}" class="view-link">View piece</a>
        </div>`;
  }

  function catalogueCellHtml(row) {
    const img = row.featured || (row.images || '').split(',')[0].trim();
    const isVideo = /\.(mp4|mov|webm)$/i.test(img);
    const inner = isVideo
      ? `<video autoplay muted loop playsinline><source src="/videos/${img}" type="video/mp4"></video>`
      : `<img src="/images/${img}" alt="${row.title}">`;
    return `<div class="catalogue-cell"><a href="${row._href}">${inner}</a></div>`;
  }

  // ---- Copy static pages through, injecting art cards + fixing asset paths ----
  const staticPages = ['index.html', 'art.html', 'catalogue.html', 'blog.html', 'legal.html', '404.html', 'links.html', 'the-first-letter.html'];

  for (const lang of ['en', 'fr']) {
    for (const page of staticPages) {
      const srcPath = path.join(SOURCE, page);
      if (!fs.existsSync(srcPath)) continue;
      // French static marketing pages don't exist yet -- skip rather than fake a translation
      if (lang === 'fr') continue;

      let html = fs.readFileSync(srcPath, 'utf-8');

      // Fix shared-asset paths to be root-relative, now that pages live under /en/ or /fr/
      html = html.replace(/(src|data-pdf-src)="images\//g, '$1="/images/');
      html = html.replace(/(src|data-pdf-src)="videos\//g, '$1="/videos/');
      html = html.replace(/(src|data-pdf-src)="audio\//g, '$1="/audio/');
      html = html.replace(/(src|data-pdf-src)="pdfs\//g, '$1="/pdfs/');

      // Inject latest-3 art cards
      if (html.includes('ART_CARDS:latest:START')) {
        const latest = availableArt[lang].slice(-3).reverse();
        const cardsHtml = latest.map(r => artCardHtml(r)).join('\n        ');
        html = html.replace(
          /<!-- ART_CARDS:latest:START -->[\s\S]*?<!-- ART_CARDS:latest:END -->/,
          `<!-- ART_CARDS:latest:START -->\n        ${cardsHtml}\n        <!-- ART_CARDS:latest:END -->`
        );
      }
      // Inject full catalogue
      if (html.includes('ART_CARDS:all:START')) {
        const all = availableArt[lang];
        const cellsHtml = all.map(r => catalogueCellHtml(r)).join('\n    ');
        html = html.replace(
          /<!-- ART_CARDS:all:START -->[\s\S]*?<!-- ART_CARDS:all:END -->/,
          `<!-- ART_CARDS:all:START -->\n    ${cellsHtml}\n    <!-- ART_CARDS:all:END -->`
        );
      }

      writeFile(`${lang}/${page}`, html);
    }
  }

  // Blog index page: inject post cards into blog.html for each language
  for (const lang of ['en', 'fr']) {
    const distBlogPath = path.join(DIST, lang, 'blog.html');
    if (!fs.existsSync(distBlogPath)) continue;
    let html = fs.readFileSync(distBlogPath, 'utf-8');
    const posts = blogIndexByLang[lang].sort((a, b) => new Date(b.date) - new Date(a.date));
    const cardsHtml = posts.map(row => `<div class="post-card">
      <a href="/${lang}/blog/${row.slug}.html" class="card-link">
        <div class="media"><img src="/images/${row.image}" alt="${row.title}"></div>
        <p class="post-date">${formatDate(row.date, lang)}</p>
        <h2>${row.title}</h2>
        <p class="excerpt">${row.excerpt}</p>
      </a>
      <a href="/${lang}/blog/${row.slug}.html" class="read-link">Read the post</a>
    </div>`).join('\n    ');
    html = html.replace(/<div class="post-grid">[\s\S]*?<\/div>\s*<\/div>/, `<div class="post-grid">\n    ${cardsHtml}\n  </div>\n</div>`);
    fs.writeFileSync(distBlogPath, html, 'utf-8');
  }

  // ---- Root redirect: sends "/" to the visitor's language, defaulting to English
  // (French static pages don't exist yet, so this stays /en/ until they do) ----
  writeFile('index.html', `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><script>
  window.location.replace('/en/');
</script></head><body></body></html>`);

  // ---- Sitemap (DigitalPosts deliberately excluded) ----
  const urlEntries = sitemapUrls.map(({ loc, changefreq }) => {
    const links = Object.entries(loc).map(([lang, p]) =>
      `<xhtml:link rel="alternate" hreflang="${lang}" href="${SITE_URL}/${p}" />`).join('\n    ');
    const primary = loc.en || Object.values(loc)[0];
    return `  <url>
    <loc>${SITE_URL}/${primary}</loc>
    ${links}
    <changefreq>${changefreq}</changefreq>
  </url>`;
  }).join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlEntries}
</urlset>`;
  writeFile('sitemap.xml', sitemap);
  writeFile('robots.txt', `User-agent: *\nDisallow: /en/members/\nDisallow: /fr/members/\nSitemap: ${SITE_URL}/sitemap.xml\n`);

  // ---- Copy shared asset folders straight through ----
  for (const folder of ASSETS) {
    const src = path.join(SOURCE, folder);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(DIST, folder), { recursive: true });
    }
  }

  console.log('Build complete. Output in /dist');
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
