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
const SHEET_ID = '1otOxLv7_o5mE9Bz7jAnGhPP4BW5p-s0z';
const TAB_GIDS = {
  blog: '33486819',
  digitalPosts: '344425927',
  art: '2144480433',
};
const SITE_URL = 'https://maisonevieve.com'; // update if still on the workers.dev address
// ---------------------------------------------------------------------------

const DIST = path.join(__dirname, 'dist');
const SOURCE = path.join(__dirname, 'source'); // your existing static pages live here
const ASSETS = {
  images: ['images'],
  videos: [], // intentionally unused -- video files live inside images/ instead
  audio: ['audio', 'audios'],
  pdfs: ['pdfs', 'pdf'],
}; // shared, not language-specific -- checks a couple of likely folder-name spellings

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

// The header partial contains its own {{LANG}} placeholders (so its nav links point
// at the right language). Resolving those here, before the partial is handed to the
// outer page's fillTemplate call, avoids depending on token-processing order -- the
// outer call just inserts this already-finished string, nothing left to substitute.
function readHeaderPartial(lang) {
  return readPartial('header.html').split('{{LANG}}').join(lang);
}

function readTemplate(name) {
  return fs.readFileSync(path.join(__dirname, 'templates', name), 'utf-8');
}

// Splits plain text on blank lines into separate <p> tags -- for fields like the
// product description that aren't run through the full body/shortcode parser.
function toParagraphs(text) {
  return (text || '')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${p}</p>`)
    .join('\n');
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

// Sheet dates are typed as DD/MM/YYYY (the natural way to write a date in France) --
// parsed explicitly here rather than relying on new Date(), which assumes the
// American MM/DD/YYYY order and silently misreads or rejects DD/MM/YYYY dates.
// Used for BOTH display formatting and date sorting, so the two can never disagree.
function parseSheetDate(dateStr) {
  if (!dateStr) return null;
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const d = new Date(dateStr); // handles YYYY-MM-DD and other unambiguous formats
  return isNaN(d) ? null : d;
}

function heroImageBlock(row) {
  if (!row.image) {
    console.warn(`No image set for "${row.title}" (slug: ${row.slug}) -- showing a plain placeholder block instead of a broken image.`);
    return '<div class="post-hero-image"></div>';
  }
  return `<div class="post-hero-image">\n  <img src="/images/${row.image}" alt="${row.title}">\n</div>`;
}

function formatDate(dateStr, lang) {
  const d = parseSheetDate(dateStr);
  if (!d) return dateStr || '';
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
      if (!row.slug) { console.warn(`Skipping Blog row with no slug (post_id: ${postId}, lang: ${lang})`); continue; }
      const bodyHtml = parseBody(row.body);
      const ctaHtml = row.cta_link
        ? `<div class="wrap post-cta"><a href="${row.cta_link}" class="btn" target="_blank" rel="noopener">${row.cta_label || 'Subscribe'}</a></div>`
        : '';
      const html = fillTemplate(blogTemplate, {
        LANG: lang,
        TITLE: row.title,
        DATE: formatDate(row.date, lang),
        POST_HERO_IMAGE: heroImageBlock(row),
        BODY_HTML: bodyHtml,
        POST_CTA: ctaHtml,
        HEADER: readHeaderPartial(lang),
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
      if (!row.slug) { console.warn(`Skipping DigitalPosts row with no slug (post_id: ${postId}, lang: ${lang})`); continue; }
      const bodyHtml = parseBody(row.body);
      const gatedBadge = (row.gated || '').toLowerCase() === 'yes' ? '<div class="gated-badge">Members</div>' : '';
      const quoteBlock = row.quote ? `<p class="post-quote">"${row.quote}"</p>` : '';
      const html = fillTemplate(digitalTemplate, {
        LANG: lang,
        TITLE: row.title,
        DATE: formatDate(row.date, lang),
        POST_HERO_IMAGE: heroImageBlock(row),
        BODY_HTML: bodyHtml,
        GATED_BADGE: gatedBadge,
        QUOTE_BLOCK: quoteBlock,
        HEADER: readHeaderPartial(lang),
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
      if (!row.slug) { console.warn(`Skipping Art row with no slug (post_id: ${postId}, lang: ${lang})`); continue; }

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
      const isSubscription = (row.type || '').toLowerCase() === 'subscription';
      const isNumberedEdition = !isOriginal && !isSubscription && row.edition_size;
      const typeLabel = isSubscription ? 'Subscription' : (isOriginal ? 'Original Work' : (isNumberedEdition ? 'Limited Print — Signed & Numbered' : 'Hand-Finished — Signed'));
      const editionLine = isNumberedEdition
        ? `<p class="edition-line">Edition of ${row.edition_size} — ${row.edition_remaining} remaining</p>` : '';
      const mediumRow = (isOriginal && row.medium) ? `<tr><td>Medium</td><td>${row.medium}</td></tr>` : '';
      const sizeRow = (!isSubscription && row.size) ? `<tr><td>Size</td><td>${row.size}</td></tr>` : '';
      const materialRow = (!isSubscription && row.material) ? `<tr><td>Material</td><td>${row.material}</td></tr>` : '';
      const unframedNote = isSubscription ? '' : '<p class="unframed-note">This piece comes unframed.</p>';
      const purchaseLabel = isSubscription ? 'Subscribe' : 'Purchase';
      const priceSuffix = isSubscription ? ' <span class="price-suffix">per month</span>' : '';

      const html = fillTemplate(productTemplate, {
        LANG: lang,
        TITLE: row.title,
        TYPE_LABEL: typeLabel,
        EDITION_LINE: editionLine,
        DESCRIPTION: toParagraphs(row.description),
        PRICE: row.price,
        PRICE_SUFFIX: priceSuffix,
        SIZE_ROW: sizeRow,
        MATERIAL_ROW: materialRow,
        MEDIUM_ROW: mediumRow,
        UNFRAMED_NOTE: unframedNote,
        STRIPE_LINK: row.stripe_link,
        PURCHASE_LABEL: purchaseLabel,
        GALLERY_SLIDES: slides,
        GALLERY_DOTS: dots,
        HEADER: readHeaderPartial(lang),
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
    const isSubscription = (row.type || '').toLowerCase() === 'subscription';
    const priceText = row.price ? `€${row.price}${isSubscription ? ' / mo' : ''}` : 'Price upon inquiry';
    return `<div class="art-card">
          <div class="media"><a href="${row._href}"><img src="/images/${img}" alt="${row.title}"></a></div>
          <h4>${row.title}</h4>
          <div class="price">${priceText}</div>
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
      // English pages live in source/ directly. French pages live in source/fr/,
      // translated one at a time -- skip quietly for any page not yet translated.
      const srcPath = lang === 'fr' ? path.join(SOURCE, 'fr', page) : path.join(SOURCE, page);
      if (!fs.existsSync(srcPath)) continue;

      let html = fs.readFileSync(srcPath, 'utf-8');

      // Fix shared-asset paths to be root-relative, now that pages live under /en/ or /fr/.
      // Covers both HTML attributes (src=, data-pdf-src=) and CSS references
      // (background-image: url(...)), quoted or not, single or double quotes.
      for (const folder of ['images', 'videos', 'audio', 'pdfs']) {
        html = html.replace(new RegExp(`(src|data-pdf-src|href|poster)="${folder}/`, 'g'), `$1="/${folder}/`);
        html = html.replace(new RegExp(`url\\((['"]?)${folder}/`, 'g'), `url($1/${folder}/`);
      }

      // Inject latest-3 art cards
      if (html.includes('ART_CARDS:latest:START')) {
        const latest = availableArt[lang].slice(-3).reverse();
        const cardsHtml = latest.map(r => artCardHtml(r)).join('\n        ');
        html = html.replace(
          /<!-- ART_CARDS:latest:START -->[\s\S]*?<!-- ART_CARDS:latest:END -->/,
          `<!-- ART_CARDS:latest:START -->\n        ${cardsHtml}\n        <!-- ART_CARDS:latest:END -->`
        );
      }
      // Inject the "Browse the collection" carousel: the rest of the available
      // pieces, newest first, skipping the same 3 already shown in "Available Now"
      // just above it on this page -- so nothing repeats between the two sections.
      if (html.includes('ART_CARDS:carousel:START')) {
        const rest = availableArt[lang].slice(0, -3).reverse().slice(0, 10);
        const carouselHtml = rest.map(r => artCardHtml(r)).join('\n        ');
        html = html.replace(
          /<!-- ART_CARDS:carousel:START -->[\s\S]*?<!-- ART_CARDS:carousel:END -->/,
          `<!-- ART_CARDS:carousel:START -->\n        ${carouselHtml}\n        <!-- ART_CARDS:carousel:END -->`
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
    const posts = blogIndexByLang[lang].sort((a, b) => (parseSheetDate(b.date) || 0) - (parseSheetDate(a.date) || 0));
    const cardsHtml = posts.map(row => `<div class="post-card">
      <a href="/${lang}/blog/${row.slug}.html" class="card-link">
        <div class="media">${row.image ? `<img src="/images/${row.image}" alt="${row.title}">` : ''}</div>
        <p class="post-date">${formatDate(row.date, lang)}</p>
        <h2>${row.title}</h2>
        <p class="excerpt">${row.excerpt}</p>
      </a>
      <a href="/${lang}/blog/${row.slug}.html" class="read-link">Read the post</a>
    </div>`).join('\n    ');
    html = html.replace(/<div class="post-grid">[\s\S]*?<\/div>\s*<\/div>/, `<div class="post-grid">\n    ${cardsHtml}\n  </div>\n</div>`);
    fs.writeFileSync(distBlogPath, html, 'utf-8');
  }

  // ---- Root redirect: sends "/" to English by default. (French pages are being
  // added one at a time -- this stays /en/ regardless, so visitors don't land on
  // a French page that isn't ready yet; revisit this once the French site is complete.) ----
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
  for (const [outputName, candidates] of Object.entries(ASSETS)) {
    if (candidates.length === 0) continue; // intentionally unused, nothing to look for or warn about
    let found = false;
    for (const folderName of candidates) {
      const rootSrc = path.join(__dirname, folderName);
      const sourceSrc = path.join(SOURCE, folderName);
      const src = fs.existsSync(rootSrc) ? rootSrc : (fs.existsSync(sourceSrc) ? sourceSrc : null);
      if (src) {
        fs.cpSync(src, path.join(DIST, outputName), { recursive: true });
        console.log(`Copied ${outputName}/ from "${folderName}/" (${src.includes(SOURCE) ? 'source/' : 'repo root'})`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.warn(`WARNING: no folder found for "${outputName}" (tried: ${candidates.join(', ')}) -- ${outputName} will be missing from the site.`);
    }
  }

  console.log('Build complete. Output in /dist');
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
