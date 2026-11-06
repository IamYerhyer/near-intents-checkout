#!/usr/bin/env python3
"""Reproduce the widget's live behaviour from the command line.

One command:  python3 verify.py

Uses only the Python standard library and no API key. It performs the same
two calls the browser widget makes against the public NEAR Intents 1Click
API and prints the results:

  1. GET  /v0/tokens  -> how many assets / chains a buyer can pay with
  2. POST /v0/quote   -> a dry-run EXACT_OUTPUT quote: how much ETH (on
     Ethereum) a buyer must send so the merchant receives exactly
     25.00 USDC on NEAR

Dry-run quotes are real quotes from live solvers; no deposit address is
issued and no funds move. Minting a deposit address for a real payment
uses the same endpoint without "dry": true and requires the merchant's
1Click JWT — see README.md.
"""

import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone

API = "https://1click.chaindefuser.com"
MERCHANT = "iamyerhyer.near"
USDC_NEAR = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"
ETH_ETHEREUM = "nep141:eth.omft.near"


def call(method, path, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Content-Type": "application/json",
            # the API's edge rejects Python's default urllib user-agent with 403
            "User-Agent": "Mozilla/5.0 (compatible; near-intents-checkout-verify/1.0)",
        },
    )
    # Honour http_proxy/https_proxy env vars explicitly: urllib does not
    # reliably pick them up on every platform, and the API can be
    # unreachable directly from proxied networks.
    proxies = {}
    for scheme in ("http", "https"):
        p = os.environ.get(scheme + "_proxy") or os.environ.get(scheme.upper() + "_PROXY")
        if p:
            proxies[scheme] = p
    opener = urllib.request.build_opener(urllib.request.ProxyHandler(proxies))
    # solver quotes can take a while; allow 60s and retry once on timeout
    last = None
    for _ in range(2):
        try:
            with opener.open(req, timeout=60) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:  # timeout / dropped connection — retry once
            last = e
    raise last


def main():
    tokens = call("GET", "/v0/tokens")
    priced = [t for t in tokens if isinstance(t.get("price"), (int, float)) and t["price"] > 0]
    chains = sorted({t["blockchain"] for t in priced})
    print(f"1) Token list: {len(priced)} priced assets across {len(chains)} chains")
    print(f"   chains: {', '.join(chains)}")

    deadline = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    result = call("POST", "/v0/quote", {
        "dry": True,
        "swapType": "EXACT_OUTPUT",
        "slippageTolerance": 100,
        "originAsset": ETH_ETHEREUM,
        "depositType": "ORIGIN_CHAIN",
        "destinationAsset": USDC_NEAR,
        "refundTo": MERCHANT,
        "refundType": "INTENTS",
        "recipient": MERCHANT,
        "recipientType": "INTENTS",
        "amount": "25000000",  # exactly 25.00 USDC (6 decimals)
        "deadline": deadline,
        "depositMode": "SIMPLE",
    })
    q = result["quote"]
    print("2) Live quote (dry run):")
    print(f"   buyer sends        : {q['amountInFormatted']} ETH  (~${float(q['amountInUsd']):.2f})")
    print(f"   merchant receives  : {q['amountOutFormatted']} USDC on NEAR (exactly)")
    print(f"   estimated settle   : ~{q['timeEstimate']} seconds")
    print("OK — the widget's two live calls reproduce from the command line.")


if __name__ == "__main__":
    main()
