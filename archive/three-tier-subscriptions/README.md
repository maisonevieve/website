# Three-tier subscription setup (archived 24 October 2026)

Before 24 October 2026 the home page and the art page offered three subscriptions:
Digital (€11 / €120), Letter & Magazine (€22 / €240) and Both (€27 / €290),
each with a three-slide carousel, plus a "Compare" pop-up with a monthly/yearly
toggle, a yearly-bonus row, and a "Here's how to choose" link to the
choose_membership blog post (now a draft in the Master Sheet).

These four files are the full pages as they were at commit 28694ce
(git tag `archive/three-tier-subscriptions`). To bring the setup back, copy from them:

- the `<section id="subscriptions">` block (art page: the "4. Subscriptions + compare" section)
- the `<!-- Compare modal -->` block right after it
- the CSS lines for `.compare-row`, `.modal-*`, `.compare-table*`, `.billing-toggle`, `.toggle-btn`, `.save-badge`
- the script lines for the billing toggle and `wireModal('openCompare', 'closeCompare', 'compareModal')`

In the Master Sheet, the Digital and Both rows in the Art tab are set to status
"paused"; clear that status to build their product pages again.

This folder is not deployed: the site publishes only the dist/ folder.
