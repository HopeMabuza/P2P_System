# User Flow — ABC P2P Escrow System

## Roles

| Role | Who they are |
|---|---|
| **Seller** | Holds stablecoins (USDC) and wants to sell them for ETH |
| **Buyer** | Has ETH and wants to buy USDC |
| **Arbiter** | A neutral address both parties trust to settle disputes |
| **Smart Contract** | Holds all funds and enforces every rule automatically |

---

## Contract Status Lifecycle

Every ad moves through these states in order:

```
Created ──► Active ──► Locked ──► Confirming ──► Completed
                  │         │
                  │         └──► Disputed ──► Refunded
                  │                      └──► Completed
                  └──► (cancelled before buyer locks — not yet implemented)
```

| # | Status | Meaning |
|---|---|---|
| 0 | **Active** | Ad is live. USDC is locked in escrow. Waiting for a buyer. |
| 1 | **Locked** | Buyer has sent ETH. Both assets are in escrow. Trade in progress. |
| 2 | **Confirming** | One party has confirmed. Waiting for the other. |
| 3 | **Completed** | Both confirmed. USDC sent to buyer, ETH sent to seller. Done. |
| 4 | **Disputed** | A party raised a dispute. Waiting for arbiter. |
| 5 | **Refunded** | Arbiter sided with buyer. USDC back to seller, ETH back to buyer. |

---

## Seller Flow

### Step 1 — Approve the Escrow to Spend Your USDC

Before posting, the seller must give the escrow contract permission to pull USDC from their wallet. This is done on the USDC contract, not the escrow.

```
Seller wallet ──► USDC Contract
                  .approve(escrowAddress, amount)
```

- This does **not** move any tokens yet.
- It just sets a permission: "this escrow is allowed to take up to X USDC from me."
- On the frontend, this is the first MetaMask popup when the seller clicks "Post Ad".

---

### Step 2 — Post the Ad (`postAd`)

The seller calls `postAd(tokenAddress, tokenAmount, ethPrice, arbiterAddress)`.

What happens inside the contract:
1. Checks the token is on the whitelist (only approved stablecoins allowed).
2. Checks the arbiter is not the seller themselves.
3. Creates an `Ad` struct and saves it in `listings[adId]`.
4. Calls `transferFrom` on USDC — pulls the seller's tokens into the escrow.
5. Status → **Active (0)**.
6. Emits `AdPosted(adId, seller, token, tokenAmount, ethPrice)`.

After this:
- The seller's USDC is now held by the escrow contract.
- The seller cannot take the tokens back unilaterally.
- The ad appears in the **Active** tab on the frontend.

---

### Step 3 — Wait for a Buyer

Nothing for the seller to do here. The ad is live and visible to anyone.

The seller can monitor the **Active** tab. When a buyer locks the trade, the ad moves to **Pending**.

---

### Step 4 — Confirm the Trade (`confirmTransaction`)

Once the buyer has locked the trade (sent their ETH into escrow), the seller should verify off-chain that everything looks correct, then call `confirmTransaction(adId)`.

What happens inside the contract:
1. Checks caller is the seller.
2. Checks the trade is in Locked (1) or Confirming (2) state.
3. Sets `sellerConfirmed = true`.
4. If this is the first confirmation: status → **Confirming (2)**.
5. If the buyer has also already confirmed: triggers `_releaseToBuyer` → status → **Completed (3)**.
6. Emits `Confirmed(adId, seller)`.

---

### Step 5 — Trade Completes

Once both parties confirm:
- USDC is transferred from the escrow to the buyer.
- ETH is transferred from the escrow to the seller.
- Status → **Completed (3)**.
- The ad moves to the **Completed** tab.

The seller has now received their ETH. The trade is final and cannot be reversed.

---

## Buyer Flow

### Step 1 — Browse Active Listings

The buyer opens the app. No wallet needed to browse. Active listings are visible in the **Active** tab, showing:
- How much USDC is for sale
- The ETH price required
- The seller's address
- The assigned arbiter

---

### Step 2 — Lock the Trade (`lockTrade`)

The buyer calls `lockTrade(adId)` and sends the **exact** ETH price as `msg.value`.

What happens inside the contract:
1. Checks the ad is still Active (first come, first served).
2. Checks the buyer is not the seller or arbiter.
3. Checks `msg.value == ethPrice` exactly (not more, not less).
4. Records `buyer = msg.sender`.
5. Status → **Locked (1)**.
6. Emits `TradeLocked(adId, buyer)`.

After this:
- The buyer's ETH is now held by the escrow contract alongside the seller's USDC.
- Neither party can touch the funds without the other's agreement.
- The ad moves to the **Pending** tab on both sides.

---

### Step 3 — Confirm the Trade (`confirmTransaction`)

The buyer verifies off-chain that they are happy to proceed, then calls `confirmTransaction(adId)`.

What happens inside the contract:
1. Checks caller is the buyer.
2. Checks the trade is Locked (1) or Confirming (2).
3. Sets `buyerConfirmed = true`.
4. If this is the first confirmation: status → **Confirming (2)**.
5. If the seller has also already confirmed: triggers `_releaseToBuyer` → status → **Completed (3)**.
6. Emits `Confirmed(adId, buyer)`.

---

### Step 4 — Trade Completes

Once both parties confirm:
- USDC is transferred to the buyer's wallet.
- ETH is transferred to the seller's wallet.
- Status → **Completed (3)**.
- The ad moves to the **Completed** tab.

---

## Combined Timeline

```
SELLER                          CONTRACT                        BUYER
  │                                │                              │
  │── approve USDC ──────────────►│ (USDC contract only)         │
  │── postAd() ──────────────────►│ pulls USDC into escrow       │
  │                                │ status = Active (0)          │
  │                                │◄───────── lockTrade() ───────│
  │                                │ receives ETH, records buyer  │
  │                                │ status = Locked (1)          │
  │── confirmTransaction() ──────►│ sellerConfirmed = true       │
  │                                │ status = Confirming (2)      │
  │                                │◄── confirmTransaction() ─────│
  │                                │ buyerConfirmed = true        │
  │                                │ both confirmed → release     │
  │◄────────────── ETH ───────────│ status = Completed (3)       │
  │                                │────────── USDC ─────────────►│
```

---

## Dispute Flow

Either the buyer or seller can raise a dispute at any point while the trade is **Locked** or **Confirming**.

### Step 1 — Open a Dispute (`openDispute`)

Either party calls `openDispute(adId)`.

What happens:
1. Status → **Disputed (4)**.
2. Emits `Disputed(adId, caller)`.
3. All funds remain locked in the escrow — nobody can touch them.

---

### Step 2 — Arbiter Resolves (`resolveDispute`)

The arbiter reviews the situation off-chain, then calls `resolveDispute(adId, releaseToBuyer)`.

**If `releaseToBuyer = true` (trade cancelled, buyer wins):**
- USDC is returned to the **seller** (they get their tokens back).
- ETH is returned to the **buyer** (they get their ETH back).
- Status → **Refunded (5)**.

**If `releaseToBuyer = false` (trade proceeds, seller wins):**
- USDC goes to the **buyer**.
- ETH goes to the **seller**.
- Status → **Completed (3)**.

---

### Why the Arbiter Cannot Steal Funds

The arbiter has no ability to send funds to themselves. `resolveDispute` can only send funds to either the buyer or the seller — those addresses are locked in at the time the ad was posted and locked. The arbiter simply decides which direction the funds flow.

---

## What Each Party Sees on the Frontend

### Seller sees:
| Their ad status | What they see |
|---|---|
| Active (0) | "Your listing is live. Waiting for a buyer." |
| Locked (1) | "Confirm Payment" button + "Dispute" option |
| Confirming (2), they confirmed | "You confirmed. Waiting for the buyer to confirm." |
| Completed (3) | "Trade completed successfully." |
| Disputed (4) | Waiting for arbiter |
| Refunded (5) | USDC returned |

### Buyer sees:
| Ad status | What they see |
|---|---|
| Active (0) | "Buy — Send X ETH" button |
| Locked (1) | "Confirm Payment" button + "Dispute" option |
| Confirming (2), they confirmed | "You confirmed. Waiting for the seller to confirm." |
| Completed (3) | "Trade completed successfully." |
| Disputed (4) | Waiting for arbiter |

### Arbiter sees (when disputed):
| | |
|---|---|
| Disputed (4) | "Release to Buyer" and "Refund Seller" buttons |

---

## Security Rules Enforced by the Contract

| Rule | How it is enforced |
|---|---|
| Only whitelisted tokens can be posted | `require(allowedTokens[_token])` in `postAd` |
| Seller cannot be the buyer | `require(msg.sender != ad.seller)` in `lockTrade` |
| Seller cannot be the arbiter | `require(_arbiter != msg.sender)` in `postAd` |
| Buyer must send exact ETH | `require(msg.value == ad.ethPrice)` in `lockTrade` |
| Only parties can confirm/dispute | `onlyParties(adId)` modifier |
| Only arbiter can resolve | `onlyArbiter(adId)` modifier |
| Arbiter cannot send funds to themselves | `resolveDispute` only sends to `ad.buyer` or `ad.seller` |
| Funds cannot be touched after completion | All functions check `status` before acting |
