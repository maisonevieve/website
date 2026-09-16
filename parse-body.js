// parse-body.js
// Converts a Sheet "body" cell (plain text with light Markdown + embed shortcodes)
// into real HTML, matching the syntax documented for Evi:
//   blank line            -> new paragraph
//   ### Heading           -> <h3>
//   **bold**              -> <strong>
//   *italic*               -> <em>
//   [text](url)            -> <a href="url">
//   [video: file.mp4]       -> <video> embed (file lives in /videos/)
//   [audio: file.mp3]       -> <audio> embed (file lives in /audio/)
//   [youtube: VIDEO_ID]     -> responsive YouTube embed
//   [flipbook: a.jpg, b.mp4, c.jpg] -> image/video slideshow (files in /images/ or /videos/)
//   [pdf-flipbook: file.pdf] -> real page-turning PDF embed (file lives in /pdfs/)

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

function inlineFormat(text) {
  // Order matters: links before bold/italic so URLs with underscores etc. aren't mangled.
  // A link starting with http:// or https:// is treated as external and opens in a new
  // tab; anything else (a relative path to another page on this site) opens in the same tab.
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
    const trimmed = url.trim();
    // Treat it as internal (same tab) either if it's a relative path, OR if it's a full
    // URL that happens to point at one of this site's own domains -- so typing either
    // "/en/blog/post.html" or the full "https://maisonevieve.com/en/blog/post.html"
    // both behave correctly, rather than needing to remember which form to use.
    const ownDomains = ['maisonevieve.com', 'website.maisonevieve.workers.dev'];
    const isOwnDomain = ownDomains.some(domain => trimmed.includes(domain));
    const isExternal = /^https?:\/\//i.test(trimmed) && !isOwnDomain;
    return isExternal
      ? `<a href="${url}" target="_blank" rel="noopener">${label}</a>`
      : `<a href="${url}">${label}</a>`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return text;
}

function renderEmbed(kind, arg) {
  if (kind === 'signup') {
    return `<div class="embed-signup">
    <p class="embed-signup-headline">Get The First Letter</p>
    <p class="embed-signup-sub">A sensory meditation on receiving a letter, plus a sample issue of the magazine.</p>
    <form class="embed-signup-form" action="https://assets.mailerlite.com/jsonp/2634193/forms/198581432152491948/subscribe" method="post" target="ml_hidden_iframe">
      <input type="email" name="fields[email]" placeholder="Your email" required>
      <button type="submit">Send it to me</button>
    </form>
    <p class="embed-signup-confirm">Thank you — check your inbox shortly.</p>
  </div>`;
  }
  arg = (arg || '').trim();
  if (kind === 'video') {
    return `<div class="embed-video"><video controls poster=""><source src="/videos/${escapeAttr(arg)}" type="video/mp4"></video></div>`;
  }
  if (kind === 'audio') {
    // [audio: file.mp3] -> no label shown. [audio: file.mp3 | My Title] -> shows "My Title".
    const parts = arg.split('|').map(s => s.trim());
    const filename = parts[0];
    const label = parts[1];
    const audioMimeTypes = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg' };
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const mimeType = audioMimeTypes[ext] || 'audio/mpeg';
    const labelHtml = label ? `<p>${label}</p>` : '';
    return `<div class="embed-audio">${labelHtml}<audio controls><source src="/audio/${escapeAttr(filename)}" type="${mimeType}"></audio></div>`;
  }
  if (kind === 'youtube') {
    return `<div class="embed-youtube"><iframe src="https://www.youtube.com/embed/${escapeAttr(arg)}" title="Video" allowfullscreen></iframe></div>`;
  }
  if (kind === 'flipbook') {
    const files = arg.split(',').map(s => s.trim()).filter(Boolean);
    const slides = files.map((f, i) => {
      const isVideo = /\.(mp4|mov|webm)$/i.test(f);
      const folder = isVideo ? 'videos' : 'images';
      const active = i === 0 ? ' active' : '';
      if (isVideo) {
        return `<div class="slide${active}"><video muted loop playsinline><source src="/${folder}/${escapeAttr(f)}" type="video/mp4"></video></div>`;
      }
      return `<div class="slide${active}"><img src="/${folder}/${escapeAttr(f)}" alt=""></div>`;
    }).join('\n    ');
    return `<div class="embed-flipbook">\n    ${slides}\n    <button class="flipbook-arrow prev" aria-label="Previous">&#8249;</button>\n    <button class="flipbook-arrow next" aria-label="Next">&#8250;</button>\n  </div>`;
  }
  if (kind === 'pdf-flipbook') {
    return `<div class="embed-pdf-flipbook" data-pdf-src="/pdfs/${escapeAttr(arg)}"><div class="pdf-spread"></div><div class="pdf-nav-row"><button class="pdf-prev" aria-label="Previous">&#8249;</button><span class="pdf-page-indicator">Loading…</span><button class="pdf-next" aria-label="Next">&#8250;</button><button class="pdf-fullscreen-btn" aria-label="Fullscreen">&#9974;</button></div></div>`;
  }
  if (kind === 'signup') {
    // Optional custom headline: [signup: Your custom text here] -- falls back to a
    // sensible default if left blank: [signup]
    const headline = arg || 'Enjoying this? Get "The First Letter," free.';
    return `<div class="embed-signup">
    <p class="embed-signup-title">${headline}</p>
    <form class="embed-signup-form" action="https://assets.mailerlite.com/jsonp/2634193/forms/198581432152491948/subscribe" method="post" target="ml_hidden_iframe_inline">
      <input type="email" name="fields[email]" placeholder="Your email" required>
      <button type="submit">Sign up</button>
    </form>
  </div>`;
  }
  return '';
}

function parseBody(raw) {
  if (!raw) return '';
  const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const html = blocks.map(block => {
    const embedMatch = block.match(/^\[(video|audio|youtube|flipbook|pdf-flipbook|signup)(?:\s*:\s*(.*))?\]$/i);
    if (embedMatch) {
      return renderEmbed(embedMatch[1].toLowerCase(), embedMatch[2]);
    }
    const headingMatch = block.match(/^###\s+(.+)$/);
    if (headingMatch) {
      return `<h3>${inlineFormat(headingMatch[1])}</h3>`;
    }
    return `<p>${inlineFormat(block)}</p>`;
  }).join('\n\n  ');
  return html;
}

module.exports = { parseBody };
