/*!
 * NEAR Intents Universal Checkout Widget
 * ---------------------------------------
 * One embeddable button that lets a buyer pay a merchant with whatever
 * asset they hold, on whatever chain they hold it, while the merchant
 * settles in a single asset on NEAR (USDC by default).
 *
 * Live parts (no API key, runs entirely in the browser):
 *   - Asset list + prices:  GET  https://1click.chaindefuser.com/v0/tokens
 *   - Real swap quotes:     POST https://1click.chaindefuser.com/v0/quote  (dry run)
 *
 * Production note: minting the one-time deposit address for a real payment
 * uses the same /v0/quote endpoint WITHOUT "dry": true and requires the
 * merchant's 1Click JWT (Authorization: Bearer). This public prototype stops
 * at the verified live quote and says so in the UI — no funds ever move.
 *
 * Embed:
 *   <script src="widget.js"></script>
 *   <div class="near-checkout" data-merchant="yourstore.near" data-amount-usd="25" data-item="Vinyl LP"></div>
 * or:
 *   NEARCheckout.render(el, { merchant: "yourstore.near", amountUsd: 25, item: "Vinyl LP" })
 */
(function () {
  "use strict";

  var API = "https://1click.chaindefuser.com";
  // USDC on NEAR (the default settlement asset)
  var DEFAULT_SETTLE = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
  var QUOTE_TTL = 20; // seconds before a displayed quote is refreshed

  var CHAIN_NAMES = {
    near: "NEAR", eth: "Ethereum", btc: "Bitcoin", sol: "Solana", base: "Base",
    arb: "Arbitrum", op: "Optimism", pol: "Polygon", bsc: "BNB Chain",
    avax: "Avalanche", tron: "Tron", xrp: "XRP", doge: "Dogecoin",
    sui: "Sui", aptos: "Aptos", ton: "TON", zec: "Zcash", ltc: "Litecoin",
    bch: "Bitcoin Cash", gnosis: "Gnosis", starknet: "Starknet", bera: "Berachain",
    monad: "Monad", scroll: "Scroll", stellar: "Stellar", cardano: "Cardano",
    dash: "Dash", aleo: "Aleo", hypercore: "Hyperliquid", xlayer: "X Layer",
    plasma: "Plasma", movement: "Movement", miden: "Miden", fogo: "Fogo",
    abs: "Abstract", hood: "Robinhood Chain", qtc: "QTC", prl: "PRL", adi: "ADI"
  };

  var tokenCache = null;

  function fetchTokens() {
    if (tokenCache) return Promise.resolve(tokenCache);
    return fetch(API + "/v0/tokens")
      .then(function (r) {
        if (!r.ok) throw new Error("token list HTTP " + r.status);
        return r.json();
      })
      .then(function (list) {
        tokenCache = list.filter(function (t) {
          return t && t.assetId && t.symbol && typeof t.price === "number" && t.price > 0;
        });
        return tokenCache;
      });
  }

  function toSmallest(amount, decimals) {
    // string-safe conversion for typical checkout magnitudes
    var parts = String(amount).split(".");
    var whole = parts[0];
    var frac = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
    return (whole + frac).replace(/^0+(?=\d)/, "");
  }

  function quoteDeadline() {
    return new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  }

  function requestQuote(cfg, originAsset, settleAsset, settleDecimals) {
    var body = {
      dry: true, // dry run: real quote, no deposit address, no funds move
      swapType: "EXACT_OUTPUT",
      slippageTolerance: 100, // 1%
      originAsset: originAsset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: settleAsset,
      refundTo: cfg.merchant,
      refundType: "INTENTS",
      recipient: cfg.merchant,
      recipientType: "INTENTS",
      amount: toSmallest(cfg.amountUsd, settleDecimals),
      deadline: quoteDeadline(),
      depositMode: "SIMPLE"
    };
    return fetch(API + "/v0/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error((data && data.message) || "quote HTTP " + r.status);
        return data.quote;
      });
    });
  }

  // ---------- UI ----------

  var CSS = [
    ".nc-btn{font:600 15px/1.2 system-ui,sans-serif;background:#00ec97;color:#04150c;border:0;border-radius:10px;padding:13px 20px;cursor:pointer}",
    ".nc-btn:hover{filter:brightness(1.07)}",
    ".nc-overlay{position:fixed;inset:0;background:rgba(4,10,8,.62);display:flex;align-items:center;justify-content:center;z-index:99999;padding:14px}",
    ".nc-modal{background:#0d1512;color:#e9f5ee;font:15px/1.45 system-ui,sans-serif;width:430px;max-width:100%;max-height:92vh;overflow:auto;border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.5)}",
    ".nc-modal h2{margin:0 0 4px;font-size:19px}",
    ".nc-sub{color:#9db8a9;font-size:13px;margin:0 0 14px}",
    ".nc-row{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #1d2b23}",
    ".nc-row b{font-weight:600}",
    ".nc-search,.nc-select{width:100%;box-sizing:border-box;background:#132019;color:#e9f5ee;border:1px solid #274434;border-radius:9px;padding:11px;margin:6px 0 10px;font-size:15px}",
    ".nc-list{max-height:230px;overflow:auto;border:1px solid #1d2b23;border-radius:9px}",
    ".nc-asset{display:flex;justify-content:space-between;width:100%;box-sizing:border-box;background:none;border:0;border-bottom:1px solid #16241b;color:#e9f5ee;padding:10px 12px;cursor:pointer;text-align:left;font-size:14px}",
    ".nc-asset:hover{background:#14231a}",
    ".nc-asset .nc-chain{color:#8fb39e;font-size:12px}",
    ".nc-big{font-size:24px;font-weight:700;margin:8px 0 0}",
    ".nc-note{background:#12241a;border:1px solid #24513a;border-radius:9px;padding:11px 13px;font-size:13px;color:#bfe6cf;margin:12px 0}",
    ".nc-warn{background:#241d12;border-color:#514324;color:#e8d9b0}",
    ".nc-cta{width:100%;margin-top:12px}",
    ".nc-x{float:right;background:none;border:0;color:#9db8a9;font-size:20px;cursor:pointer}",
    ".nc-err{color:#ff9c9c;font-size:13px;min-height:16px}",
    ".nc-foot{color:#72907d;font-size:12px;margin-top:12px;text-align:center}"
  ].join("\n");

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function openCheckout(cfg) {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var overlay = el("div", "nc-overlay");
    var modal = el("div", "nc-modal");
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function close() {
      document.body.removeChild(overlay);
      document.head.removeChild(style);
      if (state.timer) clearInterval(state.timer);
    }
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });

    var state = { tokens: [], settle: null, origin: null, timer: null, quote: null };

    function header(title, sub) {
      modal.innerHTML = "";
      var x = el("button", "nc-x", "×");
      x.addEventListener("click", close);
      modal.appendChild(x);
      modal.appendChild(el("h2", null, title));
      if (sub) modal.appendChild(el("p", "nc-sub", sub));
    }

    function summaryRows() {
      var wrap = el("div");
      var r1 = el("div", "nc-row");
      r1.appendChild(el("span", null, cfg.item || "Purchase"));
      r1.appendChild(el("b", null, "$" + Number(cfg.amountUsd).toFixed(2)));
      var r2 = el("div", "nc-row");
      r2.appendChild(el("span", null, "Merchant receives"));
      r2.appendChild(el("b", null, "USDC on NEAR → " + cfg.merchant));
      wrap.appendChild(r1); wrap.appendChild(r2);
      return wrap;
    }

    function stepPickAsset() {
      header("Pay with any crypto", "Live prices from NEAR Intents · 200+ assets · 39 chains");
      modal.appendChild(summaryRows());
      var search = el("input", "nc-search");
      search.placeholder = "Search asset or chain (e.g. ETH, Solana, BTC)";
      modal.appendChild(search);
      var list = el("div", "nc-list");
      list.appendChild(el("div", "nc-asset", "Loading live asset list…"));
      modal.appendChild(list);
      modal.appendChild(el("p", "nc-foot", "Powered by NEAR Intents (1Click API) · quotes are real, fetched live"));

      function render(filter) {
        list.innerHTML = "";
        var f = (filter || "").toLowerCase();
        var shown = 0;
        state.tokens.forEach(function (t) {
          var chainName = CHAIN_NAMES[t.blockchain] || t.blockchain;
          if (f && (t.symbol.toLowerCase().indexOf(f) < 0 && chainName.toLowerCase().indexOf(f) < 0)) return;
          if (shown >= 60) return;
          shown++;
          var b = el("button", "nc-asset");
          var left = el("span", null, t.symbol + " ");
          left.appendChild(el("span", "nc-chain", "on " + chainName));
          var right = el("span", null, "$" + (t.price >= 1 ? t.price.toFixed(2) : t.price.toPrecision(3)));
          b.appendChild(left); b.appendChild(right);
          b.addEventListener("click", function () { stepQuote(t); });
          list.appendChild(b);
        });
        if (!shown) list.appendChild(el("div", "nc-asset", "No asset matches that search."));
      }
      search.addEventListener("input", function () { render(search.value); });

      fetchTokens()
        .then(function (tokens) {
          state.tokens = tokens.slice().sort(function (a, b) {
            return (b.price * 0 + (a.blockchain < b.blockchain ? -1 : 1));
          });
          state.settle = tokens.filter(function (t) { return t.assetId === (cfg.settleAsset || DEFAULT_SETTLE); })[0] || null;
          render("");
        })
        .catch(function (e) {
          list.innerHTML = "";
          list.appendChild(el("div", "nc-asset", "Could not load the asset list: " + e.message));
        });
    }

    function stepQuote(origin) {
      state.origin = origin;
      header("Your payment", "Exact quote, live from NEAR Intents solvers");
      modal.appendChild(summaryRows());
      var body = el("div");
      body.appendChild(el("p", "nc-sub", "Fetching a live quote…"));
      modal.appendChild(body);
      var err = el("p", "nc-err");
      modal.appendChild(err);
      var back = el("button", "nc-btn nc-cta", "← Choose a different asset");
      back.style.background = "#1d2b23"; back.style.color = "#e9f5ee";
      back.addEventListener("click", function () {
        if (state.timer) clearInterval(state.timer);
        stepPickAsset();
      });
      modal.appendChild(back);

      var settleDecimals = state.settle ? state.settle.decimals : 6;
      var settleAssetId = state.settle ? state.settle.assetId : (cfg.settleAsset || DEFAULT_SETTLE);

      function load() {
        requestQuote(cfg, origin.assetId, settleAssetId, settleDecimals)
          .then(function (q) {
            state.quote = q;
            body.innerHTML = "";
            var chainName = CHAIN_NAMES[origin.blockchain] || origin.blockchain;
            var pay = el("div");
            pay.appendChild(el("div", null, "You pay"));
            var big = el("div", "nc-big", q.amountInFormatted + " " + origin.symbol);
            pay.appendChild(big);
            var usd = el("p", "nc-sub", "≈ $" + Number(q.amountInUsd).toFixed(2) + " · from your wallet on " + chainName);
            pay.appendChild(usd);
            var r = el("div", "nc-row");
            r.appendChild(el("span", null, "Merchant receives exactly"));
            r.appendChild(el("b", null, q.amountOutFormatted + " USDC"));
            pay.appendChild(r);
            var r2 = el("div", "nc-row");
            r2.appendChild(el("span", null, "Estimated settlement"));
            r2.appendChild(el("b", null, "~" + q.timeEstimate + " seconds"));
            pay.appendChild(r2);
            var left = QUOTE_TTL;
            var cd = el("p", "nc-sub", "Quote refreshes in " + left + "s");
            pay.appendChild(cd);
            var cta = el("button", "nc-btn nc-cta", "Continue to payment →");
            cta.addEventListener("click", stepPay);
            pay.appendChild(cta);
            body.appendChild(pay);
            if (state.timer) clearInterval(state.timer);
            state.timer = setInterval(function () {
              left--;
              if (left <= 0) { clearInterval(state.timer); load(); }
              else cd.textContent = "Quote refreshes in " + left + "s";
            }, 1000);
          })
          .catch(function (e) {
            err.textContent = "No live quote for this asset right now (" + e.message + "). Try another asset.";
          });
      }
      load();
    }

    function stepPay() {
      if (state.timer) clearInterval(state.timer);
      header("Payment", "Final step in the live product");
      modal.appendChild(summaryRows());
      var q = state.quote, o = state.origin;
      if (q && o) {
        var r = el("div", "nc-row");
        r.appendChild(el("span", null, "You send"));
        r.appendChild(el("b", null, q.amountInFormatted + " " + o.symbol));
        modal.appendChild(r);
        var r2 = el("div", "nc-row");
        r2.appendChild(el("span", null, "Merchant receives"));
        r2.appendChild(el("b", null, q.amountOutFormatted + " USDC → " + cfg.merchant));
        modal.appendChild(r2);
      }
      var note = el("div", "nc-note nc-warn",
        "Prototype boundary, stated plainly: minting the one-time deposit address for a real payment uses this same quote endpoint with the merchant's 1Click JWT. " +
        "This public demo runs verified dry-run quotes only, so no deposit address is issued and no funds move. " +
        "With a merchant JWT configured, this button requests the deposit address, the buyer sends to it from any wallet, and NEAR Intents settles USDC to the merchant in seconds.");
      modal.appendChild(note);
      var done = el("button", "nc-btn nc-cta", "Done");
      done.addEventListener("click", close);
      modal.appendChild(done);
      modal.appendChild(el("p", "nc-foot", "NEAR Intents Universal Checkout · NEAR Hackathon 2026"));
    }

    stepPickAsset();
  }

  function render(target, cfg) {
    var btn = el("button", "nc-btn", cfg.label || "Pay with any crypto · NEAR Intents");
    btn.addEventListener("click", function () { openCheckout(cfg); });
    target.appendChild(btn);
    return btn;
  }

  // Auto-render any <div class="near-checkout" data-...>
  function auto() {
    document.querySelectorAll(".near-checkout").forEach(function (node) {
      render(node, {
        merchant: node.getAttribute("data-merchant") || "iamyerhyer.near",
        amountUsd: parseFloat(node.getAttribute("data-amount-usd") || "25"),
        item: node.getAttribute("data-item") || "Purchase",
        settleAsset: node.getAttribute("data-settle-asset") || undefined,
        label: node.getAttribute("data-label") || undefined
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto);
  else auto();

  window.NEARCheckout = { render: render, open: openCheckout, _api: API };
})();
