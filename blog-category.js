// The small label shown above a blog post's title, in place of a date, so posts
// never look dated when they are promoted again. Worked out once per post (from the
// English row, so both languages always match) from its slug, title and tags.
// A "category" column on the Blog tab, if one is ever added and filled in, wins.
const CATEGORIES = {
  letters:    { en: 'Letters & writing', fr: 'Lettres & écriture' },
  collecting: { en: 'Collecting art',    fr: "Collectionner l'art" },
  paris:      { en: 'Paris',             fr: 'Paris' },
  seasonal:   { en: 'Seasonal rituals',  fr: 'Rituels de saison' },
  meditation: { en: 'Art meditation',    fr: "Méditation sur l'art" },
  history:    { en: 'Art history',       fr: "Histoire de l'art" },
  slow:       { en: 'Slow living',       fr: 'Vivre lentement' },
};

function categoryKey(row) {
  const slug = (row.slug || '').toLowerCase();
  const title = (row.title || '').toLowerCase();
  const tags = (row.tags || '').toLowerCase();
  const all = `${slug} ${title} ${tags}`;
  if (/letter|postcard|envelope|pen-pal|correspond|wax-seal|snail-mail/.test(all)) return 'letters';
  if (/^gift|gift-ideas|gift-for|art-print|frame-a-print|art-collection|where-to-hang|wall-art|art-on-paper|buy-art|signed-numbered|anthropos|toile|tuileries|choose-art/.test(slug)) return 'collecting';
  if (/paris|montmartre|marais|luxembourg|covered-passages|garnier|sacre-coeur|metro|giverny/.test(slug)) return 'paris';
  if (/christmas|new year/.test(tags) || /winter|christmas|new year|solstice|galette|resolution/.test(`${slug} ${title}`)) return 'seasonal';
  if (/meditat|breath|ritual|grounding/.test(`${slug} ${title}`) || /\bmeditation\b/.test(tags)) return 'meditation';
  if (/art history|famous art pieces|museum/.test(tags) || /painting|painter|museum/.test(`${slug} ${title}`)) return 'history';
  return 'slow';
}

// langs = { en: row, fr: row } for one post_id
function blogCategory(langs, lang) {
  const row = langs[lang] || {};
  const own = (row.category || '').trim();
  if (own) return own;
  const key = categoryKey(langs.en || row);
  return CATEGORIES[key][lang] || CATEGORIES[key].en;
}

module.exports = { blogCategory, categoryKey };
