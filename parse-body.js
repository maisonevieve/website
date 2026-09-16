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
    const isExternal = /^https?:\/\//i.test(url.trim());
    return isExternal
      ? `<a href="${url}" target="_blank" rel="noopener">${label}</a>`
      : `<a href="${url}">${label}</a>`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return text;
}

function renderEmbed(kind, arg) {
  arg = arg.trim();
  if (kind === 'video') {
    return `<div class="embed-video"><video controls poster=""><source src="/videos/${escapeAttr(arg)}" type="video/mp4"></video></div>`;
  }
  if (kind === 'audio') {
    return `<div class="embed-audio"><p>Audio</p><audio controls><source src="/audio/${escapeAttr(arg)}" type="audio/mpeg"></audio></div>`;
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
    return `<div class="embed-pdf-flipbook" data-pdf-src="/pdfs/${escapeAttr(arg)}"><div class="pdf-spread"></div><div class="pdf-nav-row"><button class="pdf-prev" aria-label="Previous">&#8249;</button><span class="pdf-page-indicator">Loading…</span><button class="pdf-next" aria-label="Next">&#8250;</button></div></div>`;
  }
  return '';
}

function parseBody(raw) {
  if (!raw) return '';
  const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const html = blocks.map(block => {
    const embedMatch = block.match(/^\[(video|audio|youtube|flipbook|pdf-flipbook):\s*(.+)\]$/i);
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
