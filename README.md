# RoVA Deck Builder (tutorial set)

A static deck builder for the Remnants of the Void Arcana tutorial set. Not for release.

- **Summons mode:** click a card on the right to add it to the deck on the left (max 5 copies). Right-click a card to remove one.
- **Tokens mode:** the same for the token stack. Special tokens are capped at 5; normal tokens have no limit.
- Switching modes keeps both lists. **Clear** empties only the list for the current mode (click twice to confirm).
- **Export:** copy a plain-text decklist, print the decklist, or print 1:1 proxies of every card and token in the deck (use the browser's "Save as PDF"). A pasted list can be imported back.
- No rules checks: deck lists are checked by hand.

The deck is saved in the browser it was built in.

## Files

- `index.html`, `style.css`, `app.js` — the app (no build step)
- `data/cards.json` — every card and token with its data and image path
- `cards/`, `tokens/`, `inscriptions/`, `backs/` — 1:1 images at 300 dpi

## Updating cards

Replace `data/cards.json` and the image folders with a new export, then commit. The site updates on the next GitHub Pages build.

## Hosting on GitHub Pages

Settings → Pages → Build and deployment → Source: "Deploy from a branch", Branch: `main`, folder `/ (root)`.
