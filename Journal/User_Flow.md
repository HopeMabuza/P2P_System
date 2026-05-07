# User Flow — ABC P2P Escrow System

## Roles

| Role | Who they are |
|---|---|
| **Seller** | Holds USDC and wants to sell it for ZAR (fiat) |
| **Buyer** | Has ZAR and wants to buy USDC |
| **Arbiter Pool** | A set of approved neutral addresses that vote to settle disputes |
| **Escrow Contract** | Holds seller's USDC and enforces every rule automatically |
| **Escrow Owner** | Admin — can set the arbiter pool address and authorize upgrades |
| **Arbiter Pool Owner** | Admin — can add and remove arbiters |

---

## Contract Status Lifecycle

```
Created ──► Active ──► InTrade ──► Paid ──► Completed
               │           │
               │           └──► Disputed ──► Completed
               │                         └──► (back to seller via Cancelled path)
               └──► Cancelled  (seller cancels before anyone locks)
```

| # | Status | Meaning |
|---|---|---|
| 0 | **Active** | Ad is live. USDC is locked in escrow. Waiting for a buyer. |
| 1 | **InTrade** | Buyer has initiated the trade. 5-minute payment window starts now. |
| 2 | **Paid** | Buyer has confirmed off-chain payment. Waiting for seller to release. |
| 3 | **Completed** | Seller released funds. USDC sent to buyer. Trade is done. |
| 4 | **Cancelled** | Seller cancelled an active ad, or trade expired. USDC returned to seller. |
| 5 | **Disputed** | A party raised a dispute. Waiting for arbiter pool vote. |

---

## Seller Flow

### Step 1 — Approve the Escrow to Spend Your USDC

Before posting, the seller must give the escrow contract permission to pull USDC from their wallet. This is done on the USDC contract, not the escrow.

```
Seller wallet ──► USDC Contract
                  .approve(escrowAddress, tokenAmount)
```

- This does **not** move any tokens yet.
- It sets a permission: "this escrow is allowed to take up to X USDC from me."
- On the frontend this is the first MetaMask popup when the seller clicks "Post Ad".

---

### Step 2 — Create the Ad (`createAd`)

The seller calls `createAd(zarRate, zarAmount, tokenAmount)`.

What happens inside the contract:
1. Creates an `Ad` struct saved in `ads[adId]`.
2. Calls `transferFrom` on USDC — pulls the seller's tokens into the escrow.
3. Status → **Active (0)**.
4. Emits `AdCreated(adId, seller, tokenAmount, zarRate)`.

Fields stored on the ad:
- `zarRate` — the ZAR/USDC exchange rate the seller is offering
- `zarAmount` — total ZAR the buyer must pay off-chain
- `tokenAmount` — USDC held in escrow

After this:
- The seller's USDC is held by the escrow contract.
- The seller cannot take the tokens back except via `cancelAd`.
- The ad appears in the **Active** tab.

---

### Step 3 — Wait for a Buyer (or Cancel)

The ad is live and visible to anyone. The seller can monitor the **Active** tab.

**To cancel before anyone locks:** the seller calls `cancelAd(adId)`.
- Only works while status is **Active (0)**.
- USDC is returned to the seller.
- Status → **Cancelled (4)**.

---

### Step 4 — Release Funds (`releaseFunds`)

Once the buyer has confirmed their payment off-chain (step 2 of the buyer flow), the seller verifies the payment and calls `releaseFunds(adId)`.

What happens inside the contract:
1. Checks caller is the seller.
2. Checks status is **Paid (2)**.
3. Transfers USDC from escrow to the buyer.
4. Status → **Completed (3)**.
5. Emits `FundsReleased(adId)`.

The seller has now fulfilled the trade. The buyer receives USDC; the seller keeps the ZAR paid off-chain.

---

### Step 5 — Reclaim on Timeout (`claimExpiredTrade`)

If the buyer initiates a trade but does not confirm payment within **5 minutes**, the seller can reclaim their USDC.

The seller calls `claimExpiredTrade(adId)`.

What happens inside the contract:
1. Checks the `paymentDeadline` has passed.
2. Returns USDC to the seller.
3. Status → **Cancelled (4)**.
4. Emits `TradeExpired(adId, expiredBuyer)`.

---

## Buyer Flow

### Step 1 — Browse Active Listings

The buyer opens the app. No wallet needed to browse. Active listings are visible in the **Active** tab, showing:
- How much USDC is for sale
- The ZAR rate and total ZAR amount required
- The seller's address

---

### Step 2 — Initiate the Trade (`initiateTrade`)

The buyer calls `initiateTrade(adId)`.

What happens inside the contract:
1. Checks the ad is still **Active (0)** (first come, first served).
2. Checks the buyer is not the seller.
3. Records `buyer = msg.sender`.
4. Sets `paymentDeadline = block.timestamp + 5 minutes`.
5. Status → **InTrade (1)**.
6. Emits `TradeInitiated(adId, buyer)`.

After this:
- The buyer has 5 minutes to make the off-chain ZAR payment and confirm it.
- The USDC remains locked in escrow.
- The ad moves to the **Pending** tab on both sides.

---

### Step 3 — Pay Off-Chain and Confirm (`confirmPayment`)

The buyer sends the ZAR payment through their bank or payment app (off-chain), then calls `confirmPayment(adId)` to signal they've paid.

What happens inside the contract:
1. Checks caller is the buyer.
2. Checks status is **InTrade (1)**.
3. Checks `block.timestamp <= paymentDeadline` (still within 5 minutes).
4. Status → **Paid (2)**.
5. Emits `PaymentConfirmed(adId)`.

The ball is now in the seller's court to verify and release.

---

### Step 4 — Trade Completes

Once the seller calls `releaseFunds`:
- USDC is transferred to the buyer's wallet.
- Status → **Completed (3)**.
- The ad moves to the **Completed** tab.

---

## Combined Timeline

```
SELLER                          CONTRACT                          BUYER
  │                                │                                │
  │── approve USDC ──────────────►│ (USDC contract only)           │
  │── createAd() ────────────────►│ pulls USDC into escrow         │
  │                                │ status = Active (0)            │
  │                                │◄──────── initiateTrade() ──────│
  │                                │ records buyer, starts timer    │
  │                                │ status = InTrade (1)           │
  │                   [buyer pays ZAR off-chain]                    │
  │                                │◄────── confirmPayment() ───────│
  │                                │ status = Paid (2)              │
  │   [seller verifies ZAR received]                                │
  │── releaseFunds() ────────────►│ transfers USDC to buyer        │
  │                                │ status = Completed (3)         │
  │                                │──────────── USDC ─────────────►│
```

---

## Cancellation & Timeout Summary

| Situation | Who acts | Function | Result |
|---|---|---|---|
| Seller wants to cancel before any buyer | Seller | `cancelAd(adId)` | USDC back to seller, status = Cancelled (4) |
| Buyer locked but didn't confirm in time | Seller | `claimExpiredTrade(adId)` | USDC back to seller, status = Cancelled (4) |

---

## Dispute Flow

Either the buyer or seller can raise a dispute while the trade is **InTrade (1)** or **Paid (2)**.

### Step 1 — Open a Dispute (`openDispute`)

Either party calls `openDispute(adId)`.

What happens:
1. Status → **Disputed (5)**.
2. Emits `DisputeOpened(adId, opener)`.
3. All funds remain locked in the escrow — nobody can touch them.

---

### Step 2 — ArbiterPool Registers the Dispute (`registerDispute`)

The ArbiterPool contract registers the dispute and randomly selects **3 arbiters** from the pool.

- A **5-minute voting window** opens.
- Emits `DisputeRegistered(disputeId, adId, assigned[3])`.

> Note: Arbiter selection currently picks the first 3 in the pool. Random selection via Chainlink VRF is planned.

---

### Step 3 — Arbiters Vote (`vote`)

Each of the 3 assigned arbiters calls `vote(disputeId, releaseToBuyer)`.

- Resolution triggers as soon as **2 out of 3** votes agree.
- No need to wait for the third vote once a majority is reached.
- Emits `VoteCast(disputeId, arbiter, releaseToBuyer)`.

**If majority votes `releaseToBuyer = true` (buyer wins):**
- USDC is returned to the **seller** (they get their tokens back).
- Status → **Cancelled (4)** / resolved in buyer's favour.

**If majority votes `releaseToBuyer = false` (seller wins):**
- USDC goes to the **buyer**.
- Status → **Completed (3)**.

Emits `DisputeResolved(disputeId, releasedToBuyer)`.

---

### Step 4 — Finalize Expired Dispute (`finaliseExpiredDispute`)

If the voting window expires before a majority is reached, **anyone** can call `finaliseExpiredDispute(disputeId)` to force resolution based on whichever side has more votes at that point.

---

### Why Arbiters Cannot Steal Funds

Arbiters can only vote on the direction funds flow — to buyer or seller. The ArbiterPool contract calls `resolveDispute` on the escrow, which can only send USDC to `ad.buyer` or `ad.seller`. Arbiter addresses are never a valid destination.

---

## What Each Party Sees on the Frontend

### Seller sees:
| Ad status | What they see |
|---|---|
| Active (0) | "Your listing is live. Waiting for a buyer." + "Cancel Ad" button |
| InTrade (1) | "Buyer has initiated trade. Waiting for payment confirmation." + "Dispute" option |
| Paid (2) | "Buyer confirmed payment. Verify and release." + "Release Funds" button + "Dispute" option |
| Completed (3) | "Trade completed successfully." |
| Cancelled (4) | "Ad cancelled / trade expired." |
| Disputed (5) | "Dispute open. Waiting for arbiter pool vote." |

### Buyer sees:
| Ad status | What they see |
|---|---|
| Active (0) | "Buy" button |
| InTrade (1) | "Pay ZAR off-chain, then confirm payment." + "Confirm Payment" button + "Dispute" option |
| Paid (2) | "Payment confirmed. Waiting for seller to release." + "Dispute" option |
| Completed (3) | "Trade completed successfully." |
| Cancelled (4) | "Trade expired — payment window missed." |
| Disputed (5) | "Dispute open. Waiting for arbiter pool vote." |

### Arbiter sees (when assigned to a dispute):
| | |
|---|---|
| Disputed (5) | "Vote: Release to Buyer" and "Vote: Release to Seller" buttons |

---

## Security Rules Enforced by the Contract

| Rule | How it is enforced |
|---|---|
| Seller cannot be the buyer | `require(msg.sender != ad.seller)` in `initiateTrade` |
| Only the seller can cancel an active ad | `require(msg.sender == ad.seller)` in `cancelAd` |
| Only the buyer can confirm payment | `require(msg.sender == ad.buyer)` in `confirmPayment` |
| Confirmation must happen within 5 minutes | `require(block.timestamp <= ad.paymentDeadline)` in `confirmPayment` |
| Timeout claim only after deadline | `require(block.timestamp > ad.paymentDeadline)` in `claimExpiredTrade` |
| Only parties can open a dispute | Checked inside `openDispute` |
| Only assigned arbiters can vote | `onlyArbiter` modifier + `_isAssigned` check in `vote` |
| Arbiters cannot send funds to themselves | `resolveDispute` only sends to `ad.buyer` or `ad.seller` |
| Only ArbiterPool can call resolveDispute | `onlyArbiterPool` modifier on escrow |
| Funds cannot be touched after completion | All functions check `status` before acting |

---

## Admin Operations

| Action | Who | Function |
|---|---|---|
| Update the arbiter pool address | Escrow Owner | `setArbiterPool(address)` |
| Add a new arbiter | ArbiterPool Owner | `addArbiter(address)` |
| Remove an arbiter | ArbiterPool Owner | `removeArbiter(address)` |
| Upgrade the escrow contract | Escrow Owner | UUPS `_authorizeUpgrade` |
