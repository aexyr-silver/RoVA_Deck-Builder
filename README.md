# RoVA Deck Builder and Playtest

A deck builder and an online playtest table for the **Remnants of the Void Arcana** tutorial set.
The tutorial cards are placeholders for testing the rules and are not for release.

- **Deck builder:** `index.html`, the main page of the site
- **Playtest table:** `sim.html`, reached from the **Playtest** link in the deck builder

Both pages work in any modern browser on a computer. On a screen 1000 px wide or more, the playtest table fits the window without scrolling. On narrower screens (phones, small tablets) the parts stack and the page scrolls.

---

## Contents

1. [Deck builder](#deck-builder)
2. [Decklist format](#decklist-format)
3. [Playtest table](#playtest-table)
4. [For the site owner](#for-the-site-owner)

---

## Deck builder

A deck has two parts, and the builder has a mode for each:

- **Summons:** the Arcana deck (summon cards and Fragments)
- **Tokens:** the Void Token stack (normal and special tokens)

Use the **Summons / Tokens** switch at the top to change mode. Switching modes never deletes anything; each mode keeps its own list.

### Adding and removing cards

- The right side shows every available card or token. The left side shows what's in your deck.
- **Click** a card on the right to add one copy. A number badge shows how many you have.
- **Right-click** a card on the right to remove one copy.
- On the left, use **+** and **−** beside each entry.
- **Copy limits:** up to 5 copies of each summon and each special token. Normal Void Tokens have no limit. A card at its limit is shown faded.

### Finding cards

- **Search** looks through names and card text (effect, affinity, restriction).
- The filters narrow the list by **Arcana Type**, **card type** (Full, Half, Quarter, Fragment) and **cost**. In Tokens mode, only the type filter is shown.
- **Hover** over any card to see it larger. For special tokens, hovering shows the token's inscription card.
- The card images follow the site theme: in **Light** theme they're shown in a dark version, and in **Dark** theme in the white version, so they stand out against the page. Printing always uses the white, ink-saving version.

### The deck list

- The left panel groups your summons by card type: Full, Half, Quarter, Fragment. Your tokens are grouped into special and normal.
- The small tags at the top show counts: how many summons cost 0 and how many of each card type, or for tokens, how many are special and how many of each value.
- The builder does **not** check deck rules such as deck size or the 0-cost minimum. Deck lists are checked by hand.

### Deck name, clearing, theme

- Type a **deck name** at the top. It's included when you export.
- **Clear** empties the list for the current mode only. Click it once and it asks "Clear all…?"; click again within 3 seconds to confirm.
- The **Auto / Dark / Light** button changes the colour theme. Auto follows your device's setting.
- Your deck, its name and your theme are saved in this browser, so they're still there next time. They don't carry over to another browser or device. To move a deck, export it and import it there.

### Export

Click **Export** to open the export window:

- **Copy list:** copies the decklist as text, to paste into a message. See [Decklist format](#decklist-format).
- **Print decklist:** a clean printable list of the deck.
- **Print proxies (1:1):** every card and token in the deck at real size (cards 63 × 88 mm), plus one inscription card for each kind of special token. Print at 100% and cut them out.

To get a PDF instead of paper, choose **Save as PDF** in your browser's print window.

### Import

Click **Import**, paste a decklist and press **Load list**. It replaces both your current summons and your tokens. If the list has a deck name line, that name is filled in. Any line the builder doesn't recognise is listed so you can fix it; everything else is still loaded.

---

## Decklist format

Both the deck builder and the playtest table read and write this format:

```
RoVA Decklist - My Deck

Full (3)
3 Blaze Titan - Lv. 3

Half (5)
5 Frost Keeper - Lv. 4

Quarter (2)
2 Blaze Spark - Lv. 5

Total: 10x summons (2x 0-Cost)

7 Void Token v.3
5 Void Token v.5
3 Refract Rune Token v.3
Total: 15x tokens (1x Inscription)
```

- **Summon lines:** `count name title Lv. level`. The tutorial cards have no titles, so a `-` stands in its place.
- **Token lines:** `count name Token v.value`. Normal tokens are written `Void Token v.3`, `v.5`, `v.7` or `v.13`.
- **"Inscription"** counts the kinds of special token, since each kind needs one inscription card.
- The headings (`Full (3)` and so on) and the `Total:` lines are for reading; they're ignored when importing. A list typed by hand loads as long as the card lines are right.

---

## Playtest table

A virtual table for two players. It's a **sandbox with helpers**: you move cards and tokens yourself and apply the rules yourself, like at a real table. The page takes care of routine steps (drawing, end-of-turn resets, generating tokens) and logs every action.

### 1. Lobby: choose your deck

- Enter **your name**.
- Pick a deck from the menu or choose **Paste a decklist…** and paste one exported from the deck builder.
- The line under the box shows what was read: number of summons, how many cost 0, number of tokens, and any lines it couldn't recognise.
- Your pasted deck is remembered in this browser.

### 2. Lobby: start a game

**Play online with someone (two computers):**

1. One player clicks **Create room** and gets a 6-character **room code**. **Copy** puts it on the clipboard. Send the code to the other player.
2. The other player chooses their own deck, types the code under **Join an online game** and clicks **Join**.
3. When they've joined, the host sees their name and deck size and clicks **Start game**. This opens the table for both players; nothing is shuffled or drawn until each player does their own setup (see [Before turn 1](#3-before-turn-1-setup-and-ready)).

You can't join your own room: once you've created a room, the Join box in that tab is locked, and joining it from another tab or window of the same browser is refused. To test online play alone, use two different browsers or devices, or use Solo.

The two browsers connect directly to each other. A free public service (PeerJS) is used only to help them find each other. The host's browser runs the game, so **if the host closes or reloads the page, the game ends**. The page warns before closing.

**Play solo (one computer):**

Choose a deck for the second player under **Second player's deck**, then click **Start solo game**. You control both sides; use **Switch to …** to act as the other player. In solo mode, both hands are visible, and the left column has Setup, Ready and Reset for both sides.

### 3. Before turn 1: Setup and Ready

The table opens empty: decks and token stacks are not shuffled, and no one has drawn. Each player, in the left column under **Your side**:

1. Presses **Setup**. This shuffles your deck and your token stack, draws your 4 starting cards and reveals 3 setup tokens onto your Void Altar.
2. Votes for the Arcana Field state: **Radiant** or **Dormant**. You can change your vote until you press Ready. Votes are secret: the other player only sees that you've voted.
3. Looks at their hand and tokens, then presses **Ready**. Ready only works after you've set up and voted. Press **Not ready** to take it back; your vote can't be changed while you're ready.

When **both** players are ready, the votes are counted:

- **Votes don't match:** an error pops up for both players, showing who voted what. Both players are set back to not ready. Agree on one state, vote again and press Ready.
- **Votes match:** the Arcana Field is set to that state and **locked for the whole game**. The setup tokens are compared to decide who goes first, and turn 1 starts. If the setup tokens tie, both token stacks are shuffled and 3 tokens revealed again, as in the rules; this is shown in the log.

The other player's status (for example "Not set up", "Voted · not ready", "Ready") is shown under your buttons.

Until the game begins, cards and piles can't be used; clicking them shows a reminder.

### Reset side

**Reset side** puts all of your cards back into your deck and all of your tokens back into your token stack, unshuffled, exactly as before Setup. Your hand, arena, Abyss, altar and stash are emptied, and a Fragment of yours on the Fragment Recall Altar is removed. Click it once and it asks **Confirm reset?**; click again within 3 seconds to do it.

- Only you can reset your own side (in solo, you can reset either).
- After a reset, press **Setup** and **Ready** again.
- If you reset during a game, the game goes back to the setup stage. The other player's side is left as it is, but both players need to vote on the Arcana Field again and press **Ready**. Turn 1 starts over when both are ready.
- After a win, both players can reset to play again without going back to the lobby.

### The table

The screen has three columns:

- **Left:** whose turn it is, the Arcana Field state, any prompt waiting for you (such as tokens to generate), and all the buttons.
- **Middle:** the board. Card sizes adjust to the window so the whole board fits.
- **Right:** the match log and the chat.

On the board, your side is at the bottom and the other player's side is at the top, mirrored the way they'd be across a real table. The **Fragment Recall Altar** is shared and sits in the middle. Each side follows the rules' field layout:

| Area | Where on your side | What's shown |
| --- | --- | --- |
| Void Altar | Top left, 3 hexagon slots | The top token of each slot; "+N below" when tokens are stacked |
| Token stack | Left edge, upper | How many tokens are left |
| Sealed Token Stash | Left edge, lower | The top token, and your count out of 6. It glows at 6 or more |
| Arena | Middle, 8 slots | Front row nearest the middle. Quarter-zone slots have a purple outline |
| Void Abyss | Right edge, upper | The newest card, and how many are in it |
| Arcana deck | Right edge, lower | How many cards are left |

Your hand is along the bottom. If it gets too long, it scrolls sideways. The other player's hand is shown as card backs with a count, unless they reveal it.

Cards and tokens on the table are shown as **tiles** with large text, so they can be read at any window size:

- **Card tile:** cost (top left), level (top right), name, card type, and **emission / capacity** in large numbers at the bottom. The border is the card's Arcana Type colour.
- **Token tile:** the value in Roman numerals, and the rune's name for special tokens ("Void" for normal tokens). The border is the type colour for special tokens and grey for normal ones.
- The other player's revealed hand shows a smaller tile with just the name and emission / capacity.

**Hover** over any card or token to see the full card image. Special tokens show their inscription card. Like in the deck builder, the images follow the site theme.

### Doing things: click anything

Click a card, token or pile to see what you can do with it.

| Click on | Options |
| --- | --- |
| **A card in your hand** | Summon to a slot (Quarters can only go in Quarter-zone slots), or place a Fragment on the Fragment Recall Altar · Sacrifice (e.g. to pay a cost) · Put on top or bottom of the deck |
| **A summon in an arena** | Rest / Stand · Damage +1, −1, Clear · Move to another empty slot · Sacrifice · Return to hand · Put on top or bottom of the deck |
| **The Fragment on the altar** | Sacrifice now (if it's attacked or its effect ends) · Return to hand |
| **A token on a Void Altar** | Charge +1, +2, +3, +5, +7, −1, Reset · Claim it into its owner's stash · Move it to another slot · Sacrifice |
| **A token stack** | Generate a token to a slot of your choice |
| **A Sealed Token Stash** | Sacrifice the top token |
| **A Void Abyss** | Opens a window with every card in it (newest first): Make active · Deactivate · Dissipate (turn face down for good) · Return to hand · Put on top of the deck |
| **A deck** | Draw 1 or 2 (your own) · Look at the top 1–4 cards (yours or the opponent's) · Shuffle (your own) |

When an option needs a place, such as a slot to summon into, the allowed spots light up in teal and a prompt appears in the left column. Click a spot, or press **Esc** or **Cancel** to back out.

You can act on the other player's cards too, for example damaging their summon or charging a token on their altar, because effects often need that. Every action is logged with the name of the player who did it.

### Buttons in the left column

At the top:

- **Arcana Field:** shows "by vote" during setup, then the voted state with a lock. It can't be changed once the game has begun.
- **Coin flip:** the Radiant/Dormant marker coin, for effects that call for a flip.

Under **Turn** (once the game has begun):

- **End turn:** only the player whose turn it is can press it.
- **Draw 1** and **Stand all**: for effects that need them.
- **Activate win (N):** use the Fragment Recall Altar to activate your stashed tokens. It's logged as a win if you have 6 or more. It counts as your altar use for the turn, and it's greyed out if you've already used the altar this turn.
- **Reveal hand / Hide hand:** lets the other player see your hand, for effects that reveal it.

Under **Your side**: **Setup**, **Ready** and **Reset side** (see above). In solo there's a box for each side, and **Switch to …** at the bottom.

### What the helpers do for you

- **Deciding who goes first:** when both players are ready, the higher first setup token goes first; ties are compared by adding the second and then the third token, as in the rules.
- **Start of each turn:** your summons stand and you draw 2. The first player draws only 1 on the very first turn.
- **End of turn:**
  1. Charge on all altar tokens resets.
  2. Damage on all summons clears.
  3. A Fragment left on the altar is sacrificed.
  4. A reminder to sacrifice any summon left with 0 capacity.
- **Tokens after a sacrifice:** every sacrifice adds a token for the other player to generate. A teal prompt in the left column shows who has tokens to generate. Click **Choose slot** and then a slot on that player's altar, or **Skip one** when an effect says no token is generated.
- **Empty token stack:** the altar's tokens are shuffled into a new stack and 3 are generated, as in the rules.
- **Active Abyss card:** a sacrificed card with an Abyss effect becomes active on its own. Only one card can be active across both Abysses: making a new one active dissipates the old one.
- **Looking at a deck:** a window shows the cards, leftmost on top. Use **Top**, **Bottom** or **To hand** (your own deck only) to rearrange them, **Reveal to opponent** to show them in the log, and **Done** to finish. Only you see the cards unless you reveal them.

What the helpers **don't** do: work out card effects, track emission and capacity changes, or check whether a move is legal. Use damage counters, the log and the chat for those.

### Match log and chat

- **Match log:** every action in order, numbered by turn and step (e.g. `T3·12`), with a heading at the start of each turn. Setup steps before turn 1 are numbered `T0`. Use it to check what happened or to settle a ruling.
- **Chat:** a separate conversation between the players. Type a message and press **Enter** or **Send**. A message from the other player also pops up briefly at the bottom of the screen.

---

## For the site owner

### Files

| Path | What it is |
| --- | --- |
| `index.html`, `app.js`, `style.css` | Deck builder |
| `sim.html`, `sim.js`, `sim.css` | Playtest table (uses `style.css` too) |
| `data/cards.json` | Every card and token: data and image paths |
| `data/presets.json` | The preset decks in the playtest lobby |
| `cards/`, `tokens/`, `inscriptions/`, `backs/` | Card and token images, real size at 300 dpi (white version, used for printing and on the dark theme) |
| `cards-dark/`, `tokens-dark/`, `inscriptions-dark/`, `backs-dark/` | The same images in a dark version, used on the light theme |
| `vendor/peerjs-1.5.5.min.js` | PeerJS, used for online play (MIT licence, see `vendor/peerjs-LICENSE.txt`) |

### Updating the cards

Replace `data/cards.json` and the image folders (both the white and the `-dark` folders) with a new export, then commit. The site updates within a few minutes. If a browser still shows the old version, refresh with **Ctrl + Shift + R** (or **Cmd + Shift + R** on a Mac).

### Changing the preset decks

Edit `data/presets.json`. Each preset has a `name` (shown in the lobby menu) and a `list` (a decklist in the format above, with each line break written as `\n`). The easiest way to make one is to build the deck in the deck builder, export it, and paste the text in.

### Hosting on GitHub Pages

Settings → Pages → Build and deployment → Source: **Deploy from a branch**, Branch: `main`, folder `/ (root)`. Keep all folder names lowercase and next to `index.html`, because GitHub Pages is case-sensitive.
