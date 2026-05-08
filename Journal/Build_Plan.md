# P2P Stablecoin Platform — Build Plan

## The Stack

| Layer | Technology |
|---|---|
| Contracts | Solidity + Hardhat |
| Backend | Node.js + Express + PostgreSQL + Prisma |
| Frontend | React + Vite |
| Auth | Sign-In with Ethereum (SIWE) + JWT |
| Blockchain reads | ethers.js |
| Real-time | Socket.io (for chat) |

---

## Iteration 1 — Foundation: User Accounts & Auth
**What you build:**
- Node.js + Express server wired up
- PostgreSQL database with Prisma ORM
- `users` table + `bank_accounts` table
- Wallet login: user connects MetaMask → signs a message → server verifies → issues a JWT session
- First-time profile form: display name, email, phone, bank name, account number

**What you can demo:** Visit the site, connect MetaMask, fill in your profile, be logged in. No blockchain transactions needed yet.

**Skills gained:** Node.js, Express, PostgreSQL, Prisma, SIWE, JWT, React forms

---

## Iteration 2 — Listings (Fully Off-Chain)
**What you build:**
- Listings CRUD API on the backend
- `listings` table in the database
- Browse listings page with search and filter
- Create listing form (ZAR rate, token amount, payment methods, description)
- Listing detail page

**What you can demo:** Post an ad, browse other ads, filter by price or payment method. Zero gas. Zero blockchain.

**Skills gained:** REST API design, database relationships, React Router, pagination, search UI

---

## Iteration 3 — EscrowFactory Contract
**What you build:**
- `EscrowFactory.sol` — deploys minimal proxy clones
- `SingleEscrow.sol` — one seller, one buyer, one trade, nothing else
- Full Hardhat test suite for both
- Deploy scripts for local network

**What you can demo:** Run the tests. Deploy to local Hardhat node. Create an escrow from the console and watch it work.

**Skills gained:** Factory pattern, EIP-1167 minimal proxies, Solidity testing with Hardhat, deploy scripts

---

## Iteration 4 — Trade Request Flow
**What you build:**
- `trade_requests` and `trades` tables
- Buyer clicks "Request Trade" → server notifies seller
- Seller sees buyer's profile and accepts or declines
- If accepted → seller calls `EscrowFactory.createEscrow()` → tokens lock
- Server listens for `EscrowCreated` event → updates the trade record with the escrow address
- Seller's bank details are now privately visible to the buyer inside the trade screen

**What you can demo:** Full handshake — buyer requests, seller accepts, escrow deploys, bank details appear.

**Skills gained:** ethers.js event listeners, syncing blockchain events to a database, real-time notifications

---

## Iteration 5 — Trade Execution
**What you build:**
- Trade screen with countdown timer showing the buyer's payment window
- Buyer uploads proof of payment (bank transfer screenshot)
- Buyer clicks "I have paid" → calls `confirmPayment()` on the escrow
- Seller sees the proof, clicks "Release funds" → calls `releaseFunds()` → buyer receives tokens
- Trade marked complete in the database

**What you can demo:** A complete trade from start to finish. Money actually moves.

**Skills gained:** File uploads, blockchain transaction UX, syncing contract state to the UI

---

## Iteration 6 — Disputes + Arbiter Portal
**What you build:**
- Refactor `ArbiterPool.sol` to work with the factory pattern
- "Open Dispute" button in the trade screen
- Separate `/arbiter` portal — its own layout and login gate (only arbiter wallets can enter)
- Arbiters see assigned disputes, view proof of payment, vote
- Dispute resolves on-chain, escrow pays the winner

**What you can demo:** Open a dispute, log in as an arbiter, vote, watch the escrow resolve.

**Skills gained:** Role-based access control, multi-portal React apps, on-chain voting UI

---

## Iteration 7 — Dynamic NFT: Trader Reputation
**What you build:**
- `TraderNFT.sol` — ERC721 minted automatically after a user's first completed trade
- NFT metadata and image evolves at milestones:
  - 1 trade → **Bronze**
  - 10 trades → **Silver**
  - 50 trades → **Gold**
  - 100 trades → **Platinum**
- Profile page showing the NFT and trade stats
- Trader leaderboard (ranked by volume + rating)

**What you can demo:** Complete trades and watch your NFT visually level up. Check the leaderboard.

**Skills gained:** ERC721, dynamic NFT metadata, on-chain SVG generation, leaderboards

---

## Iteration 8 — Arbiter NFT + Arbiter Rankings
**What you build:**
- `ArbiterNFT.sol` — same dynamic NFT concept for arbiters
- Arbiter stats tracked: disputes resolved, accuracy rate, average response time
- Arbiter leaderboard in the arbiter portal
- Levels based on performance, not just volume

**What you can demo:** Arbiter profile with stats and their NFT rank. Leaderboard in the portal.

**Skills gained:** Performance analytics, NFT metadata patterns, ranking algorithms

---

## Iteration 9 — KYC + Trading Limits
**What you build:**
- Integrate Smile ID (Africa-focused, has a free tier) for SA ID verification
- `kyc_verifications` table
- Tiered trading limits enforced by the server:
  - No KYC → browse only
  - Email + phone → up to R5,000
  - SA ID verified → up to R50,000
  - Full KYC → unlimited
- Verification badges shown on profiles and listings

**What you can demo:** Go through the KYC flow, get a verified badge, unlock higher trading limits.

**Skills gained:** Third-party API integration, compliance flows, tiered access control

---

## Iteration 10 — Testnet Deployment + Polish
**What you build:**
- Deploy all contracts to a public testnet (Base Sepolia or Polygon Amoy)
- Email notifications via Resend (trade updates, dispute alerts)
- Security hardening review
- UX polish pass on all screens

**What you can demo:** A live, publicly accessible app that anyone can use with testnet funds.

**Skills gained:** Production deployment, environment configuration, security mindset

---

## Progress Overview

```
Iteration  1  →  Users can log in with their wallet
Iteration  2  →  Users can post and browse listings
Iteration  3  →  The escrow contract works and is tested
Iteration  4  →  A real trade can be initiated on-chain
Iteration  5  →  A real trade can complete end to end
Iteration  6  →  Disputes can be raised and resolved
Iteration  7  →  Traders earn and level up their NFT
Iteration  8  →  Arbiters have their own ranking system
Iteration  9  →  Platform is KYC-compliant with trading limits
Iteration 10  →  Live on testnet, production-ready
```

Each iteration is roughly 1-2 weeks of focused building.
By Iteration 5 you have a working P2P platform.
Everything after that is what makes it a great one.
