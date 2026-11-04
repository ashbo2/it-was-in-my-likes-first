# Ads (Google AdSense)

The placements are built and switched off. Filling in `window.ADSENSE` in `docs/config.js` turns them on.

## Placements
| Name | Where | Size | Shows on |
|---|---|---|---|
| `rail` | Fixed in the empty right margin | 160×600 display | Screens ≥1280px wide and ≥740px tall |
| `feed` | Between result rows 20 and 21 (SoundCloud + Spotify, single + compare) | Responsive display (or In-feed unit) | All, only when results have >20 rows |
| `bottom` | Above the footer | Responsive horizontal display | All |

Max 3 ads on desktop, 2 on phones. There are deliberately no ads near the inputs and buttons (accidental-click policy risk), in song cards, in PDFs, or before results load.

Until AdSense is configured, every spot shows an empty "ad space" box. Set `placeholders: false` in `window.ADSENSE` to hide them. Add `?adpreview` to any URL to label each box with its placement name and size; pair it with `&demo&u=test` to get a list of fake results.

## Go-live checklist
1. Get AdSense approval for `inmylikes.com`. Google needs these two things on the live site first:
   - The verification meta tag in `docs/index.html`, replacing the `<!-- adsense-verify -->` comment:
     `<meta name="google-adsense-account" content="ca-pub-XXXXXXXXXXXXXXXX">`
   - `docs/ads.txt` containing:
     `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`
2. In AdSense, turn on **Privacy & messaging → European regulations**. This is Google's consent banner, required for EEA/UK/CH visitors.
3. Create 3 ad units (**Ads → By ad unit**): a 160×600 display unit, a responsive display unit, and a responsive horizontal display unit.
4. Paste the publisher ID and the 3 slot IDs into `window.ADSENSE` in `docs/config.js`, then push. Cloudflare redeploys automatically.
5. Leave **Auto ads** off in AdSense, or it will add extra placements on top of these.

## How it works (`docs/ads.js`)
- Ads only load on `inmylikes.com`. The workers.dev, GitHub Pages, and `?demo` addresses never show them.
- Each slot requests an ad once. The in-results slot is a fixed element between two lists (`#list1` / `#list1b`), so searching and sorting re-render the rows without reloading the ad.
- If the ad script is blocked (ad blockers), all slots are removed, so no empty boxes are left behind.
- A placement with an empty slot ID stays hidden.

## Notes
- `docs/privacy.html` already includes Google's required advertising disclosure. It still needs a contact email (see the `CONTACT` comment).
