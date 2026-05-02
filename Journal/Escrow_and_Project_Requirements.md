# Escrow and Project Requirements

## What is an Escrow?

An **escrow** is a neutral holding arrangement where a third party temporarily holds something of value — money, assets, tokens — on behalf of two parties involved in a deal. The held asset is only released when both sides have fulfilled their agreed obligations.

### A Simple Real-World Example

Imagine you are buying a house:
1. You hand your deposit to a **lawyer** (the escrow agent), not directly to the seller.
2. The lawyer holds it safely while the paperwork is sorted.
3. Once everything checks out and both sides are happy, the lawyer releases the money to the seller.
4. If the deal falls apart, the lawyer returns your deposit to you.

Neither party can run off with the money during the deal — the escrow agent holds it until the conditions are met.

### Why Escrow Matters in Crypto

In traditional finance, banks and lawyers play the escrow role. In crypto, there are no banks — and you cannot reverse a transaction. If you send ETH to a stranger and they disappear, it is gone.

A **smart contract escrow** replaces the lawyer with code. The rules are written into the contract and enforced automatically on the blockchain. No trust in a person is needed — only trust in the code.

---

## What is Multisig?

**Multisig** (short for multi-signature) means that more than one party must sign off (approve) before an action is taken.

Think of it like a bank safe that needs two keys to open. Both keyholders must be present — one key alone is not enough.

In our system, the escrow is **2-of-3 multisig**:
- The **seller** holds one key.
- The **buyer** holds one key.
- The **arbiter** holds one key.

To release funds, **at least 2 of the 3** must agree. This means:

| Scenario | Who signs | Outcome |
|---|---|---|
| Deal goes well | Seller + Buyer | Escrow releases tokens to buyer |
| Buyer disputes | Buyer + Arbiter | Arbiter sides with buyer — funds returned |
| Seller disputes | Seller + Arbiter | Arbiter sides with seller — tokens released |
| Arbiter is absent | Seller + Buyer | They can still resolve it themselves |

No single party can steal the funds — not even the arbiter.

---

## What is an Arbiter?

An **arbiter** is a trusted third party who steps in only when the buyer and seller cannot agree. They review the evidence and cast the deciding vote.

In our system, the arbiter:
- Does **not** hold any funds.
- Cannot release funds **alone** — they need to combine their approval with either the buyer or the seller.
- Is only called upon when a **dispute** is raised.
- May charge a small fee for their service, deducted from the disputed amount.

---

## Our Project — ABC P2P Token Trading System

### Overview

We are building a decentralised **peer-to-peer marketplace** where:
- **Sellers** list stablecoins (e.g., USDT, USDC, DAI) they want to sell.
- **Buyers** browse listings and purchase those stablecoins using **ETH**.
- All trades are protected by a **smart contract escrow with multisig**.
- Disputes are handled by an **arbiter**.

No central company holds funds at any point. Everything runs on-chain.

---

### How a Trade Works (Step by Step)

#### 1. Seller Posts a Listing
The seller specifies:
- Which stablecoin they are selling (e.g., USDC).
- How much they are selling (e.g., 500 USDC).
- The price in ETH they want in return.
- Which arbiter they accept (from an approved list).

The seller **deposits their stablecoins into the escrow contract**. The tokens are now locked — the seller cannot take them back unilaterally.

#### 2. Buyer Shows Interest
A buyer sees the listing and sends the required ETH to the escrow contract. The ETH is also locked. Both assets are now held safely in the smart contract.

#### 3. Off-Chain Payment / Confirmation
The buyer and seller communicate (e.g., buyer confirms they have sent ETH, seller confirms they see it). This is the moment where both parties verify the deal.

#### 4. Both Parties Confirm
- The **seller** calls `confirmSeller()` on the contract to signal they are satisfied.
- The **buyer** calls `confirmBuyer()` on the contract to signal they received or are happy to proceed.

Once **both have confirmed**, the escrow automatically:
- Releases the **stablecoins to the buyer**.
- Releases the **ETH to the seller**.

#### 5. If There is a Dispute
Either party can call `raiseDispute()`. The arbiter is notified and steps in to review the case. The arbiter then sides with either the buyer or the seller, and their combined signature with one party releases the funds accordingly.

---

### Roles and Responsibilities

| Role | Responsibilities |
|---|---|
| **Seller** | Lists the trade, deposits stablecoins into escrow, confirms when satisfied |
| **Buyer** | Sends ETH into escrow, confirms receipt, raises dispute if needed |
| **Arbiter** | Remains neutral, reviews disputes, casts deciding vote in conflicts |
| **Smart Contract** | Holds all funds, enforces rules, executes release automatically |

---

### Smart Contract Requirements

#### Escrow Contract
- Accept stablecoin deposits from the seller on listing creation.
- Accept ETH deposits from the buyer when they lock in a trade.
- Track confirmation status for both buyer and seller.
- Release tokens and ETH automatically when both parties confirm.
- Support dispute raising by either party.
- Implement 2-of-3 multisig logic for dispute resolution.
- Emit events for every state change (listed, locked, confirmed, disputed, resolved).

#### Listing Contract / Registry
- Store all active listings (seller address, token, amount, price, arbiter, status).
- Allow sellers to cancel a listing only if no buyer has locked in yet.
- Mark listings as active, locked, completed, or disputed.

#### Arbiter Registry
- Maintain a list of approved arbiters.
- Track arbiter reputation or dispute history (optional, future phase).
- Allow arbiters to set their fee percentage.

---

### Token Support (Phase 1)

We will support the following stablecoins initially:

| Token | Standard | Notes |
|---|---|---|
| USDT | ERC-20 | Most widely used stablecoin |
| USDC | ERC-20 | Regulated, transparent reserves |
| DAI | ERC-20 | Decentralised, algorithmic |

All tokens must be ERC-20 compliant. The contract will use a whitelist of approved token addresses to prevent scam tokens.

---

### Payment Flow Diagram

```
Seller                  Smart Contract (Escrow)            Buyer
  |                            |                              |
  |--- deposit stablecoins --->|                              |
  |                            |<--- deposit ETH ------------|
  |                            |    (trade is now locked)     |
  |                            |                              |
  |--- confirmSeller() ------->|                              |
  |                            |<--- confirmBuyer() ----------|
  |                            |                              |
  |                            |--- release stablecoins ----->|
  |<-- release ETH ------------|                              |
```

#### In a Dispute:

```
Either Party            Smart Contract                    Arbiter
  |                          |                               |
  |--- raiseDispute() ------>|                               |
  |                          |--- notify arbiter ----------->|
  |                          |                               |
  |                          |<-- arbiterReleaseToBuyer() ---|  (or releaseToSeller)
  |                          |    + one party signature      |
  |                          |                               |
  |                          |--- execute release ---------->|
```

---

### Security Considerations

- **Reentrancy protection** — all fund transfers must follow the checks-effects-interactions pattern or use a reentrancy guard.
- **Token whitelist** — only pre-approved stablecoin addresses accepted to prevent fake tokens.
- **Timeouts** — if a buyer locks a trade but never confirms, the seller can reclaim their tokens after a set time window (e.g., 72 hours).
- **Arbiter cannot act alone** — the 2-of-3 structure ensures the arbiter cannot steal funds without a party's co-signature.
- **No upgradeability in Phase 1** — contracts will be immutable to maximise trustlessness. No admin can change the rules after deployment.

---

### Out of Scope (Phase 1)

- Fiat on/off ramps
- Order book or price discovery mechanisms
- Mobile app
- Arbiter DAO governance
- Cross-chain support

---

### Summary

We are building a trustless P2P stablecoin marketplace secured by a multisig escrow smart contract. Buyers and sellers trade directly. Funds are locked on-chain and only released when both parties agree — or when an arbiter breaks a deadlock. No company holds your money at any point. The code is the middleman.
