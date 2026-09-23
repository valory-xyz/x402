# Exact Payment Scheme for Nano (DAG-L1) (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on Nano, a
feeless, instant-finality layer-1 DAG (unit: `XNO`, ticker `xno`, asset `nano:mainnet`).

This scheme facilitates payments of a specific amount of XNO from a client to a resource
server. On Nano there is no gas and no sponsored transaction: the payer submits its own
signed `send` block directly to the network, so the facilitator's job is **verify-only** —
the mechanism exposes `verify` and reports `settle` as already-final-by-publication.

## Scheme Name

`exact` (network kind: `nano`)

## Summary

On EVM and SVM the facilitator exists because the payer cannot move an asset without paying
a fee (ETH for gas, a Solana fee payer), so a third party sponsors and submits an
otherwise-unsubmittable transaction. On Nano that constraint is absent:

- a payment is a small signed `send` block the payer publishes itself; no gas, no sponsored
  transaction, no fee payer;
- the amount the payer's balance drops by and the amount the payee's balance rises by are the
  **same integer** — there is no fee, so there is nothing to reconcile;
- the mechanism's `settle` therefore has no work to do, and the honest implementation
  reports `settle` as already-final-by-publication and returns the receive-block hash as the
  receipt.

## Protocol Flow

The protocol flow for `exact` on Nano is client-driven and facilitator-light.

1. **Client** makes an HTTP request to a **Resource Server**.
2. **Resource Server** responds with a `402 Payment Required` response. The response body
   contains the `paymentRequirements` for the `exact` scheme with `network: nano:mainnet`,
   a `maxAmountRequired`, an `asset` of `xno`, and a `payTo` — an `nano_` address the seller
   advertises in the same `accepts[]` shape a server already advertises.
3. **Client** constructs a Nano `send` block from its own XNO account to the advertised
   `payTo` for the requested amount, signs it with its private key, and publishes the block
   to a Nano node.
4. **Client** sends a new HTTP request to the resource server with the `X-PAYMENT` header
   containing the signed block's hash and/or block fields.
5. **Resource Server** forwards the `X-PAYMENT` header and `paymentRequirements` to a
   **Facilitator Server's** `/verify` endpoint.
6. **Facilitator** reads the send block from the Nano ledger and verifies it *from the block
   alone* — a client-supplied transaction hash is never trusted. Verification (details below)
   returns `paid`, `unknown` (a block that cannot be read), or a structured refusal.
7. **Resource Server**, upon successful verification, may request settlement from the
   facilitator's `/settle` endpoint; on Nano this is reported as already-final-by-publication
   and returns the receive-block hash as the receipt.
8. **Resource Server** grants the **Client** access to the resource in its response.

## `PaymentRequirements` for `exact`

In addition to the standard x402 `PaymentRequirements` fields, the `exact` scheme on Nano
uses:

```json
{
  "scheme": "exact",
  "network": "nano:mainnet",
  "maxAmountRequired": "0.001",
  "asset": "xno",
  "payTo": "nano_1payToAddressAdvertisedBySeller..."
}
```

`asset` is `xno` on `nano:mainnet`. The `payTo` address is read by the facilitator **out of
the send block**, never out of the request body, so a client cannot redirect the credit.

## `X-Payment` header payload

The `payload` field of the `X-PAYMENT` header contains the Nano send block's hash plus the
block fields needed for an offline first check:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "nano:mainnet",
  "payload": {
    "blockHash": "68A3EA0D50C61177D3E0BE4A33F6ECD8B847EE161A6AE1ED026FA28030F3D4F5",
    "amount": "0.001",
    "subtype": "send"
  }
}
```

The facilitator re-fetches the block from the ledger by `blockHash` and verifies every field
from the ledger record; the `amount` and `subtype` in the payload are advisory for the first
302-less check and are never trusted for verification.

## Verification

The facilitator verifies a Nano payment from the ledger record, with no dependence on the
client-supplied payload. A block passes verification when all of the following hold:

1. the block at `blockHash` exists on the ledger and has `subtype == send`;
2. the block's `link_as_account` (its destination) equals the seller's advertised `payTo`,
   read out of the block — never out of the request body;
3. the block's `amount` is `>=` the requested `maxAmountRequired`;
4. the linked receive block exists on the payee's account — this is what makes "no fee was
   deducted" checkable rather than asserted (received amount == sent amount, because Nano has
   no fee);
5. finality is a threshold the seller picks and the facilitator does not collapse:
   - `confirmed` — a representative has voted for the block,
   - `cemented` — the network has finalised the block and it cannot be rolled back;
   a facilitator should report an uncemented send as `unknown`, never as `paid`.

Refusals map to merchant decisions, so an honest payload reflects the uncertainty:

- `destination_mismatch` — the block's `link_as_account` is not the advertised `payTo`
  (a client cannot redirect the credit);
- `underpaid` — block amount is less than `maxAmountRequired`;
- `send_not_cemented` — the payee requires cementing and the block is not yet final;
- `settled: null` — the block cannot be read (uncertainty, not non-payment). A facilitator
  that maps an unreadable block to "payment failed" will re-ask a payer who already paid.

## Settlement

Because the payer's balance drop and the payee's balance rise are the same integer, there is
nothing for a relayer to submit or reconcile. The honest implementation reports `settle` as
already-final-by-publication and returns the payee's receive-block hash as the receipt.

## Resiliency

Verification can use any two public Nano RPC endpoints with failover; a block read is idempotent
(`cemented_count` is monotonic), so a facilitator may verify the same block any number of times.
There is no signature-nonce state to manage on the facilitator side.

## Appendix

A self-contained reference implementation is a single file with no runtime dependencies
beyond `nanocurrency`, tested against a real cemented mainnet pair; it is provided as the
worked example for the `verify` mechanics above:

https://gist.github.com/PANDeveloper001/62036122e9a1945593d09afcb9940ee3
