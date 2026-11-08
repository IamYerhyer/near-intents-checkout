# NEAR Intents Universal Checkout

**One checkout button. The buyer pays with whatever they hold, on whatever chain they hold it. The merchant settles in one asset on NEAR.**

Built during the **NEAR Hackathon 2026** — a working prototype, **not a submitted entry**. The author's two submitted entries are the Investment Thesis, [near-intents-signal](https://github.com/IamYerhyer/near-intents-signal), and [nearnaira](https://github.com/IamYerhyer/nearnaira) (NearNaira, Real-World Money track).

The idea is one of the four NEAR co-founder Illia Polosukhin publicly said he would love to see built with NEAR Intents ([post](https://x.com/ilblackdragon/status/2118027843980366222), 4 Nov 2026): *"Universal checkout widget: any merchant/app can add a 'checkout' button that enables paying with Intents from whatever wallet and blockchain that user has."*

## Judge steps — do this, see that

1. **Open the live demo store:** https://iamyerhyer.github.io/near-intents-checkout/
   → A small shop with three products ($12, $25, $49), each with a checkout button.
2. **Click any "Pay with any crypto" button**
   → A checkout sheet opens and loads the **live** asset list from NEAR Intents: ~200 priced assets across 39 chains (Ethereum, Solana, Bitcoin, Base, Tron, NEAR, …), with current USD prices.
3. **Pick an asset you "hold"** — e.g. ETH on Ethereum, or SOL on Solana
   → The widget requests a **real quote** from the NEAR Intents solver network (1Click API, dry run): the exact amount of that asset needed so the merchant receives **exactly** the item price in USDC on NEAR, plus the estimated settlement time (usually seconds). The quote auto-refreshes every 20 seconds.
4. **Reproduce it from the command line (no browser, no keys):**
   `python3 verify.py`
   → Prints the live asset/chain count and one full dry-run quote (e.g. *"buyer sends 0.0113 ETH (~$25.35) → merchant receives exactly 25.0 USDC on NEAR, ~45s"*).

## What is live, and what is not — stated plainly

**Live in this prototype, with no API key:**
- Asset catalogue and prices: `GET https://1click.chaindefuser.com/v0/tokens`
- Real solver quotes (exact-output): `POST https://1click.chaindefuser.com/v0/quote` with `"dry": true`
- The quote is genuine: amounts, USD values and settlement estimates come from the live solver network, and the merchant amount is exact by construction of the EXACT_OUTPUT swap type.

**The one gated step, and why:**
- Minting the **one-time deposit address** for an actual payment uses the same `/v0/quote` call *without* `dry: true`, and that requires the merchant's **1Click JWT** (`Authorization: Bearer …`). A public demo cannot ship a merchant's JWT, so the widget stops at the verified quote and shows a clearly labelled notice at the payment step instead of faking an address.
- Production delta is deliberately small: configure the merchant JWT server-side, drop `dry`, render the returned deposit address, and poll `/v0/status`. Everything before and after that step — catalogue, pricing, exact quotes, refresh, settlement display — is the code in this repo.

**Other simplifications (demo scope):**
- Refunds are configured to the merchant's Intents account (`refundTo` = merchant) so the dry-run flow has no buyer-address form; a production checkout collects the buyer's refund address on the origin chain.
- Settlement asset is USDC on NEAR by default; it is one config value (`data-settle-asset`) because the destination asset is a parameter of the quote, not of the widget.

## Embed it on any page

```html
<script src="https://iamyerhyer.github.io/near-intents-checkout/widget.js"></script>
<div class="near-checkout"
     data-merchant="yourstore.near"
     data-amount-usd="25"
     data-item="Vinyl LP"></div>
```

Or programmatically:

```html
<script src="widget.js"></script>
<div id="buy"></div>
<script>
  NEARCheckout.render(document.getElementById('buy'),
    { merchant: 'yourstore.near', amountUsd: 25, item: 'Vinyl LP' });
</script>
```

No build step, no framework, no API key for quotes. `widget.js` is a single dependency-free file (~15 KB).

## Files

| File | What it is |
|---|---|
| `widget.js` | The whole product: button, checkout sheet, live catalogue, live quotes, refresh, payment-step notice |
| `index.html` | Demo storefront (fictional shop "Northgate Supply") proving the embed |
| `verify.py` | Stdlib-only CLI reproduction of the widget's two live API calls (honours `http_proxy`/`https_proxy` env vars) |

## Why this matters

Crypto checkout today fragments by chain: a merchant picks the two or three networks they can operationally accept and turns everyone else away. NEAR Intents collapses that to one integration — the buyer's chain stops mattering because solvers compete to deliver the merchant's exact settlement amount. This widget is that integration reduced to a script tag: the smallest possible surface between "a page on the internet" and "paid, in full, in seconds, from any chain."

## Author & payout

Shuaibu Yahaya — NEAR payout address: `iamyerhyer.near`
