// Site-wide top banner, added to every page that has a <header>.
// The site is static, so the visitor's browser picks the message by date:
//   - gifts: until 14 December (Christmas)
//   - challenge: 15 December to 31 January ("Thirty Slow Mornings")
//   - after that: no banner.
// To change a message or a link, edit CAMPAIGNS below and push.

const CHALLENGE_LINK = 'https://www.youtube.com/@meditatingonart'; // replace with the challenge sign-up page when it exists

const CAMPAIGNS = [
  {
    id: 'gift-2026', from: '2026-10-24', until: '2026-12-14',
    en: { text: 'A Christmas gift that opens twelve times.', cta: 'See the gift', href: '/en/art/letters-on-art-gift.html' },
    fr: { text: 'Un cadeau de Noël qui s’ouvre douze fois.', cta: 'Voir le cadeau', href: '/fr/art/letters-on-art-gift.html' },
  },
  {
    id: 'challenge-2027', from: '2026-12-15', until: '2027-01-31',
    en: { text: 'What if your mornings started with a painting? Thirty Slow Mornings, free from 2 January.', cta: 'Join', href: CHALLENGE_LINK },
    fr: { text: 'Et si vos matins commençaient par un tableau ? Thirty Slow Mornings, gratuit dès le 2 janvier.', cta: 'Je participe', href: CHALLENGE_LINK },
  },
];

const CSS = `<style>
  .top-banner { display: none; background: var(--black, #000); color: #fff; font-family: 'Fraunces', serif; font-size: 14px; line-height: 1.4; text-align: center; padding: 9px 44px; position: relative; }
  .top-banner.show { display: block; }
  .top-banner a { color: #fff; text-decoration: none; }
  .top-banner .tb-cta { margin-left: 10px; font-style: italic; border-bottom: 1px solid rgba(255,255,255,0.6); white-space: nowrap; }
  .top-banner a:hover .tb-cta { border-color: #fff; }
  .top-banner .tb-close { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #fff; font-size: 18px; line-height: 1; cursor: pointer; padding: 6px; opacity: 0.7; }
  .top-banner .tb-close:hover { opacity: 1; }
  @media (max-width: 600px) { .top-banner { font-size: 13px; padding: 8px 38px 8px 14px; } .top-banner .tb-cta { margin-left: 6px; } }
  /* The header is fixed, so pages without a full-bleed hero move their content down by the banner's height. */
  body.has-banner:not(.hero-dark) main { padding-top: var(--banner-h, 0px); }
</style>`;

function bannerHtml(lang) {
  const data = JSON.stringify(CAMPAIGNS.map(c => ({ id: c.id, from: c.from, until: c.until, m: c[lang] || c.en })));
  const close = lang === 'fr' ? 'Fermer' : 'Close';
  return `<div class="top-banner" id="topBanner" role="region" aria-label="${lang === 'fr' ? 'Annonce' : 'Announcement'}"><a id="tbLink" href="#"><span id="tbText"></span><span class="tb-cta" id="tbCta"></span></a><button class="tb-close" id="tbClose" aria-label="${close}">&times;</button></div>
<script>
  (function () {
    var C = ${data};
    var d = new Date(), today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    var c = C.filter(function (x) { return today >= x.from && today <= x.until; })[0];
    if (!c) return;
    try { if (localStorage.getItem('banner-closed') === c.id) return; } catch (e) {}
    var b = document.getElementById('topBanner');
    document.getElementById('tbText').textContent = c.m.text;
    document.getElementById('tbCta').textContent = c.m.cta;
    var a = document.getElementById('tbLink'); a.href = c.m.href;
    if (/^https?:/.test(c.m.href)) { a.target = '_blank'; a.rel = 'noopener'; }
    b.classList.add('show');
    function fit() { document.documentElement.style.setProperty('--banner-h', b.offsetHeight + 'px'); }
    document.body.classList.add('has-banner'); fit(); window.addEventListener('resize', fit);
    document.getElementById('tbClose').addEventListener('click', function () {
      b.classList.remove('show'); document.body.classList.remove('has-banner');
      document.documentElement.style.setProperty('--banner-h', '0px');
      try { localStorage.setItem('banner-closed', c.id); } catch (e) {}
    });
  })();
</script>`;
}

function addBanner(html, lang) {
  if (!/<header[\s>]/.test(html) || html.includes('id="topBanner"')) return html;
  return html
    .replace('</head>', CSS + '\n</head>')
    .replace(/<header([^>]*)>/, (m) => m + '\n' + bannerHtml(lang));
}

module.exports = { addBanner };
