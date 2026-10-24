// gift-block.js
// The buy area of a product page, with the gift step that happens on the site, before Stripe.
//   - Prints and originals: a normal buy button, plus "This is a gift" which opens the gift form.
//   - The "(letters) On Art" gift page (type Gift): choose 12 or 6 months, then the gift form.
//   - Subscriptions: the normal button and a quiet link to the gift page.
// The gift form sends the messages to Social Studio (studio.maisonevieve.com/gift), which saves them in
// the private Gifts spreadsheet and returns a reference. The buyer then goes to the product's normal
// Stripe link with that reference attached (client_reference_id), so the payment can be matched.

const GIFT_API = 'https://studio.maisonevieve.com/gift';
const GIFT_PAGE_SLUG = 'letters-on-art-gift';

// Standard card messages. The buyer can pick one and edit it, or write her own.
const STANDARD = {
  letters: {
    en: [
      'Something to look forward to, every month. Open each letter slowly; I\'ll be thinking of you every time one arrives.',
      'For the quiet moments you deserve and rarely take. Here\'s to slow mornings, beautiful things, and you.',
    ],
    fr: [
      'Quelque chose à attendre, chaque mois. Ouvre chaque lettre lentement : je penserai à toi chaque fois qu\'une arrivera.',
      'Pour les moments calmes que tu mérites et que tu t\'accordes si rarement. À tes matins lents, aux belles choses, et à toi.',
    ],
  },
  art: {
    en: [
      'A little stillness for your walls. Every time you look at it, know that I\'m thinking of you.',
      'For the corner of your home that deserves something beautiful, and for you, who deserves the same.',
    ],
    fr: [
      'Un peu de calme pour tes murs. Chaque fois que tu le regarderas, sache que je pense à toi.',
      'Pour le coin de ta maison qui mérite quelque chose de beau, et pour toi, qui le mérites tout autant.',
    ],
  },
};

// Standard messages for the second card, some months later.
const FOLLOWUP = {
  letters: {
    en: [
      'Halfway through, and still thinking of you. I hope the letters have found you on the right days.',
      'A small note to say I haven\'t forgotten. Keep taking your quiet moments; they suit you.',
    ],
    fr: [
      'À mi-chemin, et je pense toujours à toi. J\'espère que les lettres sont arrivées les bons jours.',
      'Un petit mot pour te dire que je ne t\'oublie pas. Continue de prendre tes moments de calme : ils te vont bien.',
    ],
  },
  art: {
    en: [
      'Some months on, I hope it still catches your eye in the morning light. Thinking of you.',
      'A little note to say I\'m still thinking of you, and of the corner where it hangs.',
    ],
    fr: [
      'Quelques mois plus tard, j\'espère qu\'il attire encore ton regard dans la lumière du matin. Je pense à toi.',
      'Un petit mot pour te dire que je pense encore à toi, et au coin où il est accroché.',
    ],
  },
};

const T = {
  en: {
    isGift: 'This is a gift',
    wrapNote: 'Gift wrapping is included: satin ribbon, your message printed on a card, and a second card some months later with a small practice and a few more words from you.',
    recipient: 'Her name, as it will appear on the card',
    giver: 'Your name',
    cardMsg: 'Your message for the card',
    std1: 'Message 1', std2: 'Message 2', own: 'Write my own',
    followup: 'A few words for the second card, some months later (optional)',
    followupPh: 'Thinking of you…',
    continue: 'Continue to payment',
    addressNote: 'On the next page, enter her address as the delivery address.',
    saving: 'One moment…',
    error: 'Your message couldn\'t be saved. Please try again, or write to bonjour@maisonevieve.com.',
    names: 'Please add both names.',
    months12: '12 months', months6: '6 months',
    detail12: '12 letters and postcards, 4 seasonal issues',
    detail6: '6 letters and postcards, 2 seasonal issues',
    onceNote: 'Paid once. Nothing renews.',
    giving: 'Giving it?', seeGift: 'See the gift',
    chars: 'characters left',
  },
  fr: {
    isGift: 'C\'est un cadeau',
    wrapNote: 'L\'emballage cadeau est inclus : un ruban de satin, votre message imprimé sur une carte, et une seconde carte quelques mois plus tard, avec une petite pratique et quelques mots de plus de votre part.',
    recipient: 'Son prénom, tel qu\'il figurera sur la carte',
    giver: 'Votre prénom',
    cardMsg: 'Votre message pour la carte',
    std1: 'Message 1', std2: 'Message 2', own: 'Écrire le mien',
    followup: 'Quelques mots pour la seconde carte, quelques mois plus tard (facultatif)',
    followupPh: 'Je pense à toi…',
    continue: 'Continuer vers le paiement',
    addressNote: 'Sur la page suivante, indiquez son adresse comme adresse de livraison.',
    saving: 'Un instant…',
    error: 'Votre message n\'a pas pu être enregistré. Merci de réessayer, ou d\'écrire à bonjour@maisonevieve.com.',
    names: 'Merci d\'indiquer les deux prénoms.',
    months12: '12 mois', months6: '6 mois',
    detail12: '12 lettres et cartes postales, 4 numéros de saison',
    detail6: '6 lettres et cartes postales, 2 numéros de saison',
    onceNote: 'Un seul paiement. Rien ne se renouvelle.',
    giving: 'Pour offrir ?', seeGift: 'Voir le cadeau',
    chars: 'caractères restants',
  },
};

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CSS = `<style>
  .buy-block { margin-top: 28px; }
  .buy-block .btn { width: 100%; text-align: center; cursor: pointer; text-transform: none; }
  .gift-toggle { display: flex; align-items: center; gap: 10px; margin: 0 0 18px; font-family: var(--serif); font-size: 1.05rem; cursor: pointer; }
  .gift-toggle input { width: 18px; height: 18px; accent-color: #000; }
  .gift-form { display: none; background: var(--cream); padding: 24px 22px; margin-bottom: 20px; }
  .gift-form.open { display: block; }
  .gift-form label { display: block; font-size: 0.85rem; color: var(--charcoal); margin: 14px 0 6px; }
  .gift-form label:first-of-type { margin-top: 0; }
  .gift-form input[type=text], .gift-form textarea { width: 100%; font-family: var(--serif); font-size: 1rem; padding: 11px 14px; border: 0; background: #fff; border-radius: 0; outline: none; transition: box-shadow 0.2s ease; }
  .gift-form input[type=text]:focus, .gift-form textarea:focus { box-shadow: 0 0 0 1px rgba(0,0,0,0.35); }
  .gift-form textarea { min-height: 96px; resize: vertical; font-family: var(--serif); }
  .gift-std { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
  .gift-std button { font: inherit; font-size: 0.8rem; background: transparent; border: 0; border-bottom: 1px solid rgba(0,0,0,0.25); padding: 4px 2px; margin-right: 10px; cursor: pointer; color: var(--charcoal); }
  .gift-std button.active { color: #000; border-bottom-color: #000; }
  .gift-count { font-size: 0.75rem; color: var(--charcoal); text-align: right; margin-top: 4px; }
  .gift-note { font-size: 0.85rem; color: var(--charcoal); font-style: italic; margin-top: 14px; line-height: 1.5; }
  .gift-hp { position: absolute; left: -9999px; }
  .gift-msg { margin-top: 12px; font-size: 0.9rem; color: #a0342c; min-height: 1em; }
  .gift-options { display: grid; gap: 10px; margin-bottom: 20px; }
  .gift-option { display: grid; grid-template-columns: auto 1fr auto; gap: 4px 12px; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.15); padding: 16px 4px; cursor: pointer; }
  .gift-option input { accent-color: #000; width: 18px; height: 18px; grid-row: span 2; }
  .gift-option .go-name { font-family: var(--serif); font-size: 1.15rem; }
  .gift-option .go-price { font-family: var(--serif); font-size: 1.15rem; text-align: right; }
  .gift-option .go-detail { grid-column: 2 / 4; font-size: 0.85rem; color: var(--charcoal); }
  .gift-option:has(input:checked) .go-name { font-style: italic; }
  .gift-link-line { margin-top: 16px; font-family: var(--serif); font-style: italic; font-size: 0.98rem; color: var(--charcoal); }
  .gift-link-line a { color: var(--black); text-decoration: underline; text-underline-offset: 3px; }
  @media (min-width: 900px) { .specs-box { position: sticky; top: 96px; align-self: start; } }
  .festive-box { background: var(--cream); border: 2px solid #9e2a2b; box-shadow: inset 0 0 0 5px #fff, inset 0 0 0 6px #9e2a2b; padding: 30px 30px 26px; margin: 40px 0 8px; }
  .festive-box h3 { margin-top: 0 !important; color: #9e2a2b; }
  .product-desc h3 { font-family: var(--serif); font-weight: 500; font-size: 1.3rem; margin: 36px 0 12px; }
  .product-desc ol, .product-desc ul { margin: 12px 0 18px 1.2em; }
  .product-desc li + li { margin-top: 8px; }
</style>`;

function formHtml(t, lang, kind, alwaysOpen) {
  const std = STANDARD[kind][lang];
  return `<div class="gift-form${alwaysOpen ? ' open' : ''}" id="giftForm">
        <label for="giftRecipient">${t.recipient}</label>
        <input type="text" id="giftRecipient" maxlength="80" autocomplete="off">
        <label for="giftGiver">${t.giver}</label>
        <input type="text" id="giftGiver" maxlength="80" autocomplete="given-name">
        <label for="giftCard">${t.cardMsg}</label>
        <div class="gift-std">
          <button type="button" class="active" data-std="0">${t.std1}</button>
          <button type="button" data-std="1">${t.std2}</button>
          <button type="button" data-std="own">${t.own}</button>
        </div>
        <textarea id="giftCard" maxlength="320">${esc(std[0])}</textarea>
        <div class="gift-count"><span id="giftCardCount">320</span> ${t.chars}</div>
        <label for="giftFollowup">${t.followup}</label>
        <div class="gift-std gift-std-follow">
          <button type="button" data-fstd="0">${t.std1}</button>
          <button type="button" data-fstd="1">${t.std2}</button>
          <button type="button" class="active" data-fstd="own">${t.own}</button>
        </div>
        <textarea id="giftFollowup" maxlength="320" placeholder="${esc(t.followupPh)}"></textarea>
        <input type="text" class="gift-hp" id="giftHp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p class="gift-note">${t.wrapNote} ${t.addressNote}</p>
      </div>
      <script type="application/json" id="giftStd">${JSON.stringify(std).replace(/</g, '\\u003c')}</script>
      <script type="application/json" id="giftFollowStd">${JSON.stringify(FOLLOWUP[kind][lang]).replace(/</g, '\\u003c')}</script>`;
}

function script(t, lang, slug) {
  return `<script>
(function () {
  var API = ${JSON.stringify(GIFT_API)}, LANG = ${JSON.stringify(lang)}, SLUG = ${JSON.stringify(slug)};
  var block = document.getElementById('buyBlock'); if (!block) return;
  var form = document.getElementById('giftForm');
  var toggle = document.getElementById('giftToggle');
  var btn = document.getElementById('buyBtn');
  var msg = document.getElementById('giftMsg');
  var card = document.getElementById('giftCard');
  var count = document.getElementById('giftCardCount');
  var std = JSON.parse(document.getElementById('giftStd').textContent);
  var plainLabel = btn.textContent;
  function isGift() { return block.getAttribute('data-always-gift') === '1' || (toggle && toggle.checked); }
  function link() {
    var opt = block.querySelector('input[name=giftOption]:checked');
    return opt ? opt.getAttribute('data-link') : block.getAttribute('data-link');
  }
  function option() {
    var opt = block.querySelector('input[name=giftOption]:checked');
    return opt ? opt.value : '';
  }
  function updateCount() { count.textContent = String(320 - card.value.length); }
  card.addEventListener('input', updateCount); updateCount();
  var fstd = JSON.parse(document.getElementById('giftFollowStd').textContent);
  var follow = document.getElementById('giftFollowup');
  block.querySelectorAll('.gift-std-follow button').forEach(function (b) {
    b.addEventListener('click', function () {
      block.querySelectorAll('.gift-std-follow button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      var k = b.getAttribute('data-fstd');
      follow.value = k === 'own' ? '' : fstd[Number(k)];
      follow.focus();
    });
  });
  block.querySelectorAll('.gift-std:not(.gift-std-follow) button').forEach(function (b) {
    b.addEventListener('click', function () {
      block.querySelectorAll('.gift-std:not(.gift-std-follow) button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      var k = b.getAttribute('data-std');
      card.value = k === 'own' ? '' : std[Number(k)];
      updateCount(); card.focus();
    });
  });
  if (toggle) toggle.addEventListener('change', function () {
    form.classList.toggle('open', toggle.checked);
    btn.textContent = toggle.checked ? ${JSON.stringify(t.continue)} : plainLabel;
  });
  function go(ref) {
    var url = link();
    if (ref) url += (url.indexOf('?') < 0 ? '?' : '&') + 'client_reference_id=' + encodeURIComponent(ref);
    url += (url.indexOf('?') < 0 ? '?' : '&') + 'locale=' + LANG;
    window.location.href = url;
  }
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    msg.textContent = '';
    if (!isGift()) { go(''); return; }
    var recipient = document.getElementById('giftRecipient').value.trim();
    var giver = document.getElementById('giftGiver').value.trim();
    if (!recipient || !giver) { msg.textContent = ${JSON.stringify(t.names)}; return; }
    btn.disabled = true; btn.textContent = ${JSON.stringify(t.saving)};
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      lang: LANG, product: SLUG, option: option(), recipient_name: recipient, giver_name: giver,
      card_message: card.value, followup_message: document.getElementById('giftFollowup').value,
      website: document.getElementById('giftHp').value
    }) }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ref) throw new Error(d && d.error || 'no ref');
      go(d.ref);
    }).catch(function () {
      btn.disabled = false; btn.textContent = ${JSON.stringify(t.continue)};
      msg.textContent = ${JSON.stringify(t.error)};
    });
  });
})();
</script>`;
}

function giftBlock({ row, lang, isGift, isSubscription, giftable, purchaseLabel, noGiftLine }) {
  const t = T[lang] || T.en;
  if (isSubscription) {
    return `${CSS}<a href="${esc(row.stripe_link)}" class="btn" target="_blank" rel="noopener" style="margin-top:28px;width:100%;text-align:center">${purchaseLabel}</a>`
      + (noGiftLine ? '' : `
      <p class="gift-link-line">${t.giving} <a href="/${lang}/art/${GIFT_PAGE_SLUG}.html">${t.seeGift}</a></p>`);
  }
  if (isGift) {
    const p12 = lang === 'fr' ? `${row.price} €` : `€${row.price}`;
    const p6 = lang === 'fr' ? `${row.yearly_price} €` : `€${row.yearly_price}`;
    return `${CSS}<div class="buy-block" id="buyBlock" data-always-gift="1">
      <div class="gift-options">
        <label class="gift-option"><input type="radio" name="giftOption" value="12" data-link="${esc(row.stripe_link)}" checked><span class="go-name">${t.months12}</span><span class="go-price">${p12}</span><span class="go-detail">${t.detail12}</span></label>
        <label class="gift-option"><input type="radio" name="giftOption" value="6" data-link="${esc(row.yearly_stripe_link)}"><span class="go-name">${t.months6}</span><span class="go-price">${p6}</span><span class="go-detail">${t.detail6}</span></label>
      </div>
      ${formHtml(t, lang, 'letters', true)}
      <button type="button" class="btn" id="buyBtn">${t.continue}</button>
      <p class="gift-msg" id="giftMsg" role="alert"></p>
      <p class="gift-note">${t.onceNote}</p>
    </div>${script(t, lang, row.slug)}`;
  }
  if (giftable) {
    return `${CSS}<div class="buy-block" id="buyBlock" data-link="${esc(row.stripe_link)}">
      <label class="gift-toggle"><input type="checkbox" id="giftToggle"> ${t.isGift}</label>
      ${formHtml(t, lang, 'art', false)}
      <button type="button" class="btn" id="buyBtn">${purchaseLabel}</button>
      <p class="gift-msg" id="giftMsg" role="alert"></p>
    </div>${script(t, lang, row.slug)}`;
  }
  return `<a href="${esc(row.stripe_link)}" class="btn" target="_blank" rel="noopener">${purchaseLabel}</a>`;
}

// Wraps a description section whose heading mentions Christmas (or Noël) in the festive box.
function festiveSections(html) {
  return html.replace(/(<h3[^>]*>[^<]*(?:Christmas|Noël|Mother's Day|Fête des mères|Valentine|Saint-Valentin)[^<]*<\/h3>)([\s\S]*?)(?=<h3|$)/g, '<div class="festive-box">$1$2</div>\n  ');
}

module.exports = { giftBlock, STANDARD, FOLLOWUP, festiveSections };
