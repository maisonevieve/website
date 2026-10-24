// build.js
// Run with: node build.js
// Reads the Master Sheet (Blog, DigitalPosts, Art tabs) and generates the full
// bilingual site into /dist. Static pages (home, art shop, legal, etc.) are
// copied through from /source with their paths fixed for the new structure.

const fs = require('fs');
const path = require('path');
const { parseCSV } = require('./parse-csv');
const { blogCategory } = require('./blog-category');
const { parseBody } = require('./parse-body');
const { giftBlock, festiveSections } = require('./gift-block');
const { addBanner } = require('./banner');

// ---------------------------------------------------------------------------
// CONFIG -- fill these in with your real values (see the README for how to find them)
// ---------------------------------------------------------------------------
const SHEET_ID = '1sczM9aCG-XNgvkn9SORw358l72w8mCivfu5lza3E3s8'; // verified against Drive directly on 2026-09-20 -- the previous ID no longer resolves
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
// alt = { en: '/en/...', fr: '/fr/...' } -- the same page in each language. Written
// at build time because translated pages usually have their own translated slug,
// so a simple /en/ -> /fr/ swap in the browser would land on a missing page.
// Falls back to that language's homepage when a page has no translation yet.
function readHeaderPartial(lang, alt = {}) {
  return readPartial('header.html')
    .split('{{LANG}}').join(lang)
    .split('{{ALT_EN}}').join(alt.en || '/en/')
    .split('{{ALT_FR}}').join(alt.fr || '/fr/')
    .split('{{FIRST_LETTER}}').join(lang === 'fr' ? 'Un rituel à feuilleter' : 'A ritual you can flip through')
    .replace(/>Home</g, lang === 'fr' ? '>Accueil<' : '>Home<')
    .replace(/>About</g, lang === 'fr' ? '>À propos<' : '>About<')
    .replace(/>Subscriptions?</g, lang === 'fr' ? '>Abonnement<' : '>Subscription<');
}

// Interface words written in English inside the post/product templates.
function localizeTemplate(html, lang) {
  if (lang !== 'fr') return html;
  return html
    .split('&#8592; Back to the Journal').join('&#8592; Retour au Journal')
    .split('&#8592; Back to Available Art').join('&#8592; Retour aux œuvres disponibles');
}

function altPaths(langs, section) {
  const alt = {};
  for (const l of ['en', 'fr']) {
    if (langs[l] && langs[l].slug) alt[l] = `/${l}/${section}/${langs[l].slug}.html`;
  }
  return alt;
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
  if (/\.html$/.test(relPath) && typeof content === 'string') content = addBanner(content, /^fr[\\/]/.test(relPath) ? 'fr' : 'en');
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

// Link previews (Instagram DMs, WhatsApp, iMessage, Pinterest, Facebook): without these tags
// apps fall back to the favicon and stretch it. Each page gets its own title, text and image.
const OG_DEFAULT_IMAGE = 'art-meditation-letter-experience.jpg'; // used when a page has no image of its own
function attr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function plainText(s, max) {
  const t = String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/[*_#>\[\]`]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : t;
}
function ogTags({ title, description, image, path: pagePath, lang, type }) {
  // Light copies in images/og/ (about 1200px, under 300 KB) load reliably in WhatsApp and Instagram;
  // a new image without one there simply uses the original.
  const file = String(image || '').trim() || OG_DEFAULT_IMAGE;
  const ogName = file.replace(/\.[^.]+$/, '') + '.jpg';
  const img = fs.existsSync(path.join(__dirname, 'images', 'og', ogName))
    ? `${SITE_URL}/images/og/${encodeURI(ogName)}`
    : `${SITE_URL}/images/${encodeURI(file)}`;
  const desc = plainText(description, 200);
  return [
    `<meta property="og:site_name" content="Maison Eviève">`,
    `<meta property="og:type" content="${type || 'article'}">`,
    `<meta property="og:title" content="${attr(title)}">`,
    desc ? `<meta property="og:description" content="${attr(desc)}">` : '',
    desc ? `<meta name="description" content="${attr(desc)}">` : '',
    `<meta property="og:url" content="${SITE_URL}/${pagePath}">`,
    `<meta property="og:image" content="${attr(img)}">`,
    `<meta property="og:locale" content="${lang === 'fr' ? 'fr_FR' : 'en_GB'}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].filter(Boolean).join('\n');
}

function heroImageBlock(row) {
  if (!row.image) {
    console.warn(`No image set for "${row.title}" (slug: ${row.slug}) -- showing a plain placeholder block instead of a broken image.`);
    return '<div class="post-hero-image"></div>';
  }
  return `<div class="post-hero-image">\n  <img src="/images/${row.image}" alt="${row.title}">\n</div>`;
}

// Publication date kept out of sight for readers but visible to search engines.
function dateMeta(row) {
  const d = parseSheetDate(row.date);
  if (!d) return '';
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `<meta property="article:published_time" content="${iso}">\n<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: row.title, datePublished: iso, inLanguage: row.lang, author: { '@type': 'Person', name: 'Evi Michailidou' } })}</script>`;
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
      row._category = blogCategory(langs, lang);
      const bodyHtml = parseBody(row.body, lang);
      const ctaHtml = row.cta_link
        ? `<div class="wrap post-cta"><a href="${row.cta_link}" class="btn" target="_blank" rel="noopener">${row.cta_label || 'Subscribe'}</a></div>`
        : '';
      // A single quiet First Letter line before the closing button -- skipped when the
      // post already has its own sign-up form (e.g. The First Letter, The Collector's Diary).
      const hasOwnSignup = /\[signup/i.test(row.body || '');
      const endSignup = hasOwnSignup ? '' : (lang === 'fr'
        ? `<div class="wrap end-signup">
  <p class="end-signup-line">Avant de partir : Un rituel à feuilleter, le numéro de bienvenue de « (meditating) On Art », avec une méditation sur la réception d'une lettre, à lire ou à écouter.</p>
  <form class="embed-signup-form" action="https://assets.mailerlite.com/jsonp/2634193/forms/198581432152491948/subscribe" method="post" target="ml_hidden_iframe">
    <input type="email" name="fields[email]" placeholder="Votre e-mail" required>
    <input type="hidden" name="fields[language]" value="Français">
    <button type="submit">Envoyez-la-moi</button>
  </form>
  <p class="embed-signup-confirm">Merci, regardez votre boîte de réception dans quelques instants.</p>
</div>`
        : `<div class="wrap end-signup">
  <p class="end-signup-line">Before you go: A ritual you can flip through, the welcome issue of “(meditating) On Art”, with a meditation on receiving a letter to read or listen to.</p>
  <form class="embed-signup-form" action="https://assets.mailerlite.com/jsonp/2634193/forms/198581432152491948/subscribe" method="post" target="ml_hidden_iframe">
    <input type="email" name="fields[email]" placeholder="Your email" required>
    <input type="hidden" name="fields[language]" value="English">
    <button type="submit">Send it to me</button>
  </form>
  <p class="embed-signup-confirm">Thank you. Check your inbox in a few minutes.</p>
</div>`);
      const html = localizeTemplate(fillTemplate(blogTemplate, {
        LANG: lang,
        TITLE: row.title,
        OG_TAGS: ogTags({ title: row.title, description: row.excerpt || row.body, image: row.image, path: `${lang}/blog/${row.slug}`, lang }),
        CATEGORY: row._category,
        DATE_META: dateMeta(row),
        POST_HERO_IMAGE: heroImageBlock(row),
        BODY_HTML: bodyHtml,
        POST_CTA: ctaHtml,
        END_SIGNUP: endSignup,
        HEADER: readHeaderPartial(lang, altPaths(langs, 'blog')),
        FOOTER: readPartial('footer-minimal.html'),
      }), lang);
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
      const bodyHtml = parseBody(row.body, lang);
      const gatedBadge = (row.gated || '').toLowerCase() === 'yes' ? '<div class="gated-badge">Members</div>' : '';
      const quoteBlock = row.quote ? `<p class="post-quote">"${row.quote}"</p>` : '';
      const html = localizeTemplate(fillTemplate(digitalTemplate, {
        LANG: lang,
        TITLE: row.title,
        DATE: formatDate(row.date, lang),
        POST_HERO_IMAGE: heroImageBlock(row),
        BODY_HTML: bodyHtml,
        GATED_BADGE: gatedBadge,
        QUOTE_BLOCK: quoteBlock,
        HEADER: readHeaderPartial(lang, altPaths(langs, 'members')),
        FOOTER: readPartial('footer-minimal.html'),
      }), lang);
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
      // "paused" keeps a row in the Sheet (e.g. the Digital and Both subscriptions,
      // parked until 2027) without building a page or listing it anywhere.
      if ((row.status || '').toLowerCase() === 'paused') continue;

      const images = (row.images || '').split(',').map(s => s.trim()).filter(Boolean);
      const video = (row.video || '').trim();
      const galleryFiles = video ? [...images, video] : images;
      const slides = galleryFiles.map((f, i) => {
        const isVideo = /\.(mp4|mov|webm)$/i.test(f);
        const active = i === 0 ? ' active' : '';
        return isVideo
          ? `<div class="slide${active}"><video controls poster=""><source src="/images/${f}" type="video/mp4"></video></div>`
          : `<div class="slide${active}"><img src="/images/${f}" alt=""></div>`;
      }).join('\n  ');
      const dots = galleryFiles.map((_, i) => `<span${i === 0 ? ' class="active"' : ''}></span>`).join('');

      const isOriginal = (row.type || '').toLowerCase() === 'original';
      const isSubscription = (row.type || '').toLowerCase() === 'subscription';
      const isBundle = (row.type || '').toLowerCase() === 'bundle';
      const isLetter = (row.type || '').toLowerCase() === 'letter';
      // The gift page for "(letters) On Art": a one-time 12 or 6 month package, sold only as a gift.
      // Sheet columns for this row: price + stripe_link = 12 months, yearly_price + yearly_stripe_link = 6 months.
      const isGift = (row.type || '').toLowerCase() === 'gift';
      const isNumberedEdition = !isOriginal && !isSubscription && !isBundle && !isLetter && row.edition_size;

      // Product-page labels, by language -- previously hardcoded in English only,
      // which meant French product pages showed English UI text regardless of the
      // row's own language. Centralized here so every label (including the two new
      // types below) is correct in both languages from the start.
      const L = lang === 'fr' ? {
        subscription: 'Abonnement', original: 'Œuvre originale',
        limitedNumbered: 'Tirage limité, signé et numéroté', handFinished: 'Fini à la main et signé',
        bundle: 'Coffret', letter: 'Lettre à l\'aveugle',
        edition: (size, remaining) => `Édition de ${size}, ${remaining} restants`,
        medium: 'Support', size: 'Dimensions', material: 'Matériau', theme: 'Thème',
        unframed: 'Cette pièce est livrée sans cadre.',
        purchase: 'Acheter', subscribe: 'S\'abonner',
        galleryPrev: 'Précédent', galleryNext: 'Suivant',
      } : {
        subscription: 'Subscription', original: 'Original Work',
        limitedNumbered: 'Limited print, signed and numbered', handFinished: 'Hand-finished and signed',
        bundle: 'Bundle', letter: 'Blind-Date Letter',
        edition: (size, remaining) => `Edition of ${size}, ${remaining} remaining`,
        medium: 'Medium', size: 'Size', material: 'Material', theme: 'Theme',
        unframed: 'This piece comes unframed.',
        purchase: 'Purchase', subscribe: 'Subscribe',
        galleryPrev: 'Previous', galleryNext: 'Next',
      };

      const typeLabel = isGift ? (lang === 'fr' ? 'À offrir' : 'A gift')
        : isSubscription ? L.subscription
        : isBundle ? L.bundle
        : isLetter ? L.letter
        : isOriginal ? L.original
        : (isNumberedEdition ? L.limitedNumbered : L.handFinished);
      const editionLine = isNumberedEdition
        ? `<p class="edition-line">${L.edition(row.edition_size, row.edition_remaining)}</p>` : '';
      const mediumRow = (isOriginal && row.medium) ? `<tr><td>${L.medium}</td><td>${row.medium}</td></tr>` : '';
      // Size/material only apply to physical, individually-crafted pieces -- not
      // subscriptions, bundles (a curated set, not one object), or letters.
      const isPhysicalSingleItem = !isSubscription && !isBundle && !isLetter && !isGift;
      const sizeRow = (isPhysicalSingleItem && row.size) ? `<tr><td>${L.size}</td><td>${row.size}</td></tr>` : '';
      const materialRow = (isPhysicalSingleItem && row.material) ? `<tr><td>${L.material}</td><td>${row.material}</td></tr>` : '';
      // Theme is optional and only meaningful for bundles for now (e.g. a seasonal
      // or aesthetic name) -- left blank unless Evi fills it in for a given bundle.
      const themeRow = (isBundle && row.theme) ? `<tr><td>${L.theme}</td><td>${row.theme}</td></tr>` : '';
      const unframedNote = isPhysicalSingleItem ? `<p class="unframed-note">${L.unframed}</p>` : '';
      const purchaseLabel = isSubscription ? L.subscribe : L.purchase;
      // Bundles and letters are one-off purchases, same as original art and prints --
      // no recurring-price suffix. Only an actual Subscription gets "per month".
      const priceSuffix = isSubscription ? ` <span class="price-suffix">${lang === 'fr' ? '/ mois' : 'per month'}</span>` : '';

      // Subscriptions: a quiet second option under the button, from the Sheet's
      // yearly_price / yearly_stripe_link / yearly_bonus columns (left out when empty).
      const yearlyLine = (isSubscription && row.yearly_price && row.yearly_stripe_link)
        ? (lang === 'fr'
          ? `<p class="yearly-line">ou <a href="${row.yearly_stripe_link}" target="_blank" rel="noopener">€${row.yearly_price} par an</a>${row.yearly_bonus ? `, avec ${row.yearly_bonus} en bonus` : ''}</p>`
          : `<p class="yearly-line">or <a href="${row.yearly_stripe_link}" target="_blank" rel="noopener">€${row.yearly_price} a year</a>${row.yearly_bonus ? `, with ${row.yearly_bonus} as a bonus` : ''}</p>`)
        : '';
      const html = localizeTemplate(fillTemplate(productTemplate, {
        LANG: lang,
        TITLE: row.title,
        OG_TAGS: ogTags({ title: row.title, description: row.description, image: images[0], path: `${lang}/art/${row.slug}`, lang, type: 'product' }),
        TYPE_LABEL: typeLabel,
        EDITION_LINE: editionLine,
        DESCRIPTION: isGift ? festiveSections(parseBody(row.description, lang)) : toParagraphs(row.description),
        PRICE_LINE: isGift
          ? `<div class="price-line">${lang === 'fr' ? 'Dès ' + row.yearly_price + ' €' : 'From €' + row.yearly_price}</div>`
          : `<div class="price-line">€${row.price}${priceSuffix}</div>`,
        BUY_BLOCK: giftBlock({ row, lang, isGift, isSubscription, giftable: isPhysicalSingleItem, purchaseLabel }),
        PRICE_SUFFIX: priceSuffix,
        SIZE_ROW: sizeRow,
        MATERIAL_ROW: materialRow,
        MEDIUM_ROW: mediumRow,
        THEME_ROW: themeRow,
        UNFRAMED_NOTE: unframedNote,
        YEARLY_LINE: isGift ? '' : yearlyLine,
        GALLERY_SLIDES: slides,
        GALLERY_DOTS: dots,
        GALLERY_PREV_LABEL: L.galleryPrev,
        GALLERY_NEXT_LABEL: L.galleryNext,
        HEADER: readHeaderPartial(lang, altPaths(langs, 'art')),
        FOOTER: readPartial('footer-minimal.html'),
      }), lang);
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

  // Canonical feelings list: maps whatever's chosen in the Sheet's "feelings"
  // multi-select dropdown (case-insensitive, matched loosely) to a clean slug used
  // for filtering on the catalogue page. Keeping this in one place means the match
  // stays forgiving even if a dropdown option's exact wording changes later, while
  // the generated markup always gets a consistent, exact slug.
  const FEELINGS = [
    { slug: 'fractured-focus', match: /fractured\s*focus|brain\s*fog/i },
    { slug: 'quiet-burnout', match: /quiet\s*burnout|exhaustion/i },
    { slug: 'urban-loneliness', match: /urban\s*loneliness|disconnection/i },
    { slug: 'rushing-anxiety', match: /rushing\s*anxiety|urgency/i },
    { slug: 'deep-stillness', match: /deep\s*stillness|calm/i },
    { slug: 'bittersweet-nostalgia', match: /bittersweet\s*nostalgia|longing/i },
    { slug: 'creative-spark', match: /creative\s*spark|awe/i },
    { slug: 'emotional-safety', match: /praise\s*of\s*shadows|emotional\s*safety/i },
  ];
  function feelingsSlugs(raw) {
    if (!raw) return [];
    // Sheets' multi-select chip dropdown joins chosen chips as "A, B" in the cell --
    // split back into individual values here.
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    const slugs = parts.map(part => {
      const found = FEELINGS.find(f => f.match.test(part));
      if (!found) console.warn(`Unrecognized feeling "${part}" -- check spelling against the canonical list.`);
      return found ? found.slug : null;
    }).filter(Boolean);
    return [...new Set(slugs)]; // de-duplicate, in case two phrasings map to the same slug
  }

  // ---- Card HTML for listings (latest 3, and full catalogue) ----
  function artCardHtml(row, featuredImgOverride, lang) {
    const img = featuredImgOverride || row.featured || (row.images || '').split(',')[0].trim();
    const isSubscription = (row.type || '').toLowerCase() === 'subscription';
    const priceUnknownText = lang === 'fr' ? 'Prix sur demande' : 'Price upon inquiry';
    const monthSuffix = lang === 'fr' ? ' / mois' : ' / mo';
    const isGiftRow = (row.type || '').toLowerCase() === 'gift';
    const priceText = isGiftRow && row.yearly_price ? (lang === 'fr' ? `Dès ${row.yearly_price} €` : `From €${row.yearly_price}`)
      : row.price ? `€${row.price}${isSubscription ? monthSuffix : ''}` : priceUnknownText;
    // "View piece" only makes sense for art; subscriptions, bundles and letters get their own words.
    const type = (row.type || '').toLowerCase();
    const viewLabels = {
      subscription: ['See the subscription', 'Voir l\'abonnement'],
      bundle: ['See the bundle', 'Voir le coffret'],
      letter: ['See the letter', 'Voir la lettre'],
      gift: ['See the gift', 'Voir le cadeau'],
    };
    const [enLabel, frLabel] = viewLabels[type] || ['View piece', 'Voir l\'œuvre'];
    const viewLinkText = lang === 'fr' ? frLabel : enLabel;
    const feelingsAttr = feelingsSlugs(row.feelings).join(' ');
    return `<div class="art-card" data-feelings="${feelingsAttr}">
          <div class="media"><a href="${row._href}"><img src="/images/${img}" alt="${row.title}"></a></div>
          <h4>${row.title}</h4>
          <div class="price">${priceText}</div>
          <a href="${row._href}" class="view-link">${viewLinkText}</a>
        </div>`;
  }

  // Homepage "Available art": three columns, three treatments.
  //   1st: the product's video plays 4 seconds on loop, muted (its image if there is no video).
  //   2nd: a carousel. First slide the image alone, then two slides with lines from the description.
  //   3rd: the image, and on hover 3 seconds of the video on loop (or the second image).
  function descriptionLines(text) {
    const plain = (text || '')
      .split('\n')
      .filter(l => !/^\s*(#|-|\d+\.|type\s*:|dimensions\s*:|material\s*:|practice\s*:|matériau|pratique|dimensions)/i.test(l))
      .join(' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();
    const sentences = plain.match(/[^.!?…]+[.!?…]+["»”]?/g) || (plain ? [plain] : []);
    const lines = [];
    let cur = '';
    for (const sRaw of sentences) {
      const sent = sRaw.trim();
      if ((cur + ' ' + sent).trim().length > 150 && cur) { lines.push(cur.trim()); cur = ''; if (lines.length === 2) break; }
      cur += ' ' + sent;
    }
    if (lines.length < 2 && cur.trim()) lines.push(cur.trim());
    return lines.slice(0, 2).map(l => l.length > 180 ? l.slice(0, 177).replace(/\s+\S*$/, '') + '…' : l);
  }
  function homeCardHtml(row, index, lang) {
    if (index !== 0 && index !== 1 && index !== 2) return artCardHtml(row, null, lang);
    const card = artCardHtml(row, null, lang);
    const imgs = (row.images || '').split(',').map(x => x.trim()).filter(Boolean);
    const first = row.featured || imgs[0] || '';
    const video = (row.video || '').trim();
    let media;
    if (index === 0) {
      media = video
        ? `<div class="media"><a href="${row._href}"><video class="home-loop" autoplay muted loop playsinline data-loop="4" poster="/images/${first}" src="/images/${video}"></video></a></div>`
        : `<div class="media"><a href="${row._href}"><img src="/images/${first}" alt="${row.title}"></a></div>`;
    } else if (index === 1) {
      const lines = descriptionLines(row.description);
      const others = imgs.filter(f => f !== first);
      const pick = (k) => others[k] || others[0] || first;
      const slide = (img, text, active) => `<div class="tier-slide${active ? ' active' : ''}"><img src="/images/${img}" alt="">${text ? `<div class="tier-slide-overlay"><h4>${text}</h4></div>` : ''}</div>`;
      const slides = [slide(first, '', true)].concat(lines.map((l, k) => slide(pick(k), l, false)));
      const dots = slides.map((_, k) => `<button${k === 0 ? ' class="active"' : ''} aria-label="${lang === 'fr' ? 'Diapositive' : 'Slide'} ${k + 1}"></button>`).join('');
      media = `<div class="media media-carousel"><div class="tier-carousel">${slides.join('')}<div class="tier-carousel-dots">${dots}</div></div></div>`;
    } else {
      const second = imgs.find(f => f !== first) || '';
      const preview = video
        ? `<video class="home-hover cell-video" muted playsinline loop preload="metadata" data-loop="3" src="/images/${video}#t=0.1"></video>`
        : second ? `<img class="home-hover" src="/images/${second}" alt="">` : '';
      media = `<div class="media media-hover"><a href="${row._href}"><img src="/images/${first}" alt="${row.title}">${preview}</a></div>`;
    }
    return card.replace(/<div class="media">[\s\S]*?<\/div>/, media);
  }

  // Catalogue grid cell -- supports the hover treatment: fades from the piece's
  // first image to its second (if one exists) while a dark scrim and the title
  // fade in. Video cells skip the image crossfade (the video itself already
  // provides motion) but still get the scrim + title on hover.
  function catalogueCellHtml(row) {
    const imgList = (row.images || '').split(',').map(s => s.trim()).filter(Boolean);
    const primaryImg = row.featured || imgList[0] || '';
    const secondaryImg = imgList.find(f => f !== primaryImg) || '';
    const isVideo = /\.(mp4|mov|webm)$/i.test(primaryImg);
    const feelingsAttr = feelingsSlugs(row.feelings).join(' ');

    let inner;
    if (isVideo) {
      inner = `<video autoplay muted loop playsinline><source src="/images/${primaryImg}" type="video/mp4"></video>`;
    } else {
      const video = (row.video || '').trim();
      // A product with a video previews 3 seconds of it on loop (hover, or first tap on touch screens);
      // otherwise the second image fades in.
      const secondaryTag = video
        ? `<video class="cell-img cell-img-secondary cell-video" muted playsinline loop preload="metadata" data-loop="3" src="/images/${video}#t=0.1"></video>`
        : secondaryImg
        ? `<img class="cell-img cell-img-secondary" src="/images/${secondaryImg}" alt="">`
        : '';
      inner = `<img class="cell-img cell-img-primary" src="/images/${primaryImg}" alt="${row.title}">${secondaryTag}`;
    }
    return `<div class="catalogue-cell" data-feelings="${feelingsAttr}"><a href="${row._href}">${inner}<div class="cell-overlay"><span class="cell-title">${row.title}</span></div></a></div>`;
  }

  // ---- Copy static pages through, injecting art cards + fixing asset paths ----
  const staticPages = ['index.html', 'art.html', 'catalogue.html', 'blog.html', 'legal.html', '404.html', 'links.html', 'thank-you.html', 'gift-card.html'];

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
        const cardsHtml = latest.map((r, i) => homeCardHtml(r, i, lang)).join('\n        ');
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
        const carouselHtml = rest.map(r => artCardHtml(r, null, lang)).join('\n        ');
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

  // Blog index page: inject the most recent post as a featured lead story, and
  // the rest into the regular grid below it, for each language
  for (const lang of ['en', 'fr']) {
    const distBlogPath = path.join(DIST, lang, 'blog.html');
    if (!fs.existsSync(distBlogPath)) continue;
    let html = fs.readFileSync(distBlogPath, 'utf-8');
    // Newest first, by post number (dates are no longer shown anywhere on the blog).
    const posts = blogIndexByLang[lang].sort((a, b) => (Number(b.post_id) || 0) - (Number(a.post_id) || 0));
    const [featured, ...rest] = posts;

    if (featured) {
      const featuredHtml = `<a href="/${lang}/blog/${featured.slug}.html" class="card-link">
      <div class="media">${featured.image ? `<img src="/images/${featured.image}" alt="${featured.title}">` : ''}</div>
    </a>
    <div>
      <a href="/${lang}/blog/${featured.slug}.html" class="card-link">
        <p class="post-category">${featured._category}</p>
        <h2>${featured.title}</h2>
        <p class="excerpt">${featured.excerpt}</p>
      </a>
      <a href="/${lang}/blog/${featured.slug}.html" class="read-link">${lang === 'fr' ? "Lire l'article" : 'Read the post'}</a>
    </div>`;
      html = html.replace(/<div class="featured-post">[\s\S]*?<\/div>\s*<\/div>/, `<div class="featured-post">\n    ${featuredHtml}\n  </div>`);
    }

    const cardsHtml = rest.map(row => `<div class="post-card">
      <a href="/${lang}/blog/${row.slug}.html" class="card-link">
        <div class="media">${row.image ? `<img src="/images/${row.image}" alt="${row.title}">` : ''}</div>
        <p class="post-category">${row._category}</p>
        <h2>${row.title}</h2>
        <p class="excerpt">${row.excerpt}</p>
      </a>
      <a href="/${lang}/blog/${row.slug}.html" class="read-link">${lang === 'fr' ? "Lire l'article" : 'Read the post'}</a>
    </div>`).join('\n    ');
    html = html.replace(/<div class="post-grid">[\s\S]*?<\/div>\s*<\/div>/, `<div class="post-grid">\n    ${cardsHtml}\n  </div>\n</div>`);
    fs.writeFileSync(distBlogPath, addBanner(html, lang), 'utf-8');
  }

  // ---- Root-level 404 fallback: Cloudflare's not_found_handling looks for the
  // nearest 404.html to the unmatched path. For anything outside /en/ or /fr/
  // entirely (e.g. an old QR code linking to /blog/some-slug with no language
  // prefix), neither language folder is "near" -- so without a copy at the very
  // root, those paths would still fall through to a blank response. Defaults to
  // the English version, matching the root "/" redirect's own default. ----
  const rootNotFoundSrc = path.join(DIST, 'en', '404.html');
  if (fs.existsSync(rootNotFoundSrc)) {
    fs.copyFileSync(rootNotFoundSrc, path.join(DIST, '404.html'));
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
  // ---- Redirects for renamed pages, so old links (pins, QR codes, emails) keep working.
  // Add a line here whenever a slug changes in the Sheet. Each is listed with and
  // without .html, since the site answers to both forms of every address. ----
  const RENAMED = [
    ['/en/art/yoga-energy-blogs', '/en/art/yoga-energy-blocks'], // typo fixed, Oct 2026
    ['/fr/art/yoga-energy-blogs', '/fr/art/yoga-energy-blocks'],
  ];
  writeFile('_redirects', RENAMED.flatMap(([from, to]) => [
    `${from}.html ${to}.html 301`,
    `${from} ${to} 301`,
  ]).join('\n') + '\n');
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

  // ---- Image manifest: a list of every photo in /images, so the Pin Creator can see photos no page uses yet ----
  try {
    const imgRoot = path.join(DIST, 'images');
    if (fs.existsSync(imgRoot)) {
      const walk = (dir, rel) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
        e.isDirectory() ? walk(path.join(dir, e.name), rel + e.name + '/') : [rel + e.name]);
      // images/og/ only holds light link-preview copies, so it is left out of the photo list.
      const photos = walk(imgRoot, '').filter(f => /\.(jpe?g|png|webp)$/i.test(f) && !f.startsWith('og/')).sort();
      writeFile('image-manifest.json', JSON.stringify({ site: SITE_URL, images: photos.map(f => `${SITE_URL}/images/${encodeURI(f)}`) }, null, 1));
      console.log(`Wrote image-manifest.json (${photos.length} photos)`);
    }
  } catch (err) {
    console.warn('WARNING: could not write image-manifest.json:', err.message);
  }

  console.log('Build complete. Output in /dist');
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
