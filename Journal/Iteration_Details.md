# P2P Stablecoin Platform — Iteration Details

## How To Approach Each Iteration

Within every iteration, follow this order:
1. **Schema first** — design the database table before writing any code
2. **Backend second** — build and test the API endpoints (use Postman or Thunder Client)
3. **Contracts third** — write and test before touching the frontend
4. **Frontend last** — connect everything together, make it visual

That order means you always have something solid to build the next layer on top of.

---

## Iteration 1 — User Accounts & Auth

**Order to build:** Backend first → Frontend second. No contracts.

**Backend tasks:**
1. Create a `backend/` folder. Initialize Node.js + Express
2. Connect PostgreSQL with Prisma. Write your first schema:
   - `users` — wallet_address, display_name, email, phone, created_at
   - `bank_accounts` — wallet_address, bank_name, account_holder, account_type, account_number (encrypted), branch_code
3. Build the auth flow — two endpoints:
   - `GET /auth/nonce` — frontend asks for a random nonce tied to a wallet address
   - `POST /auth/verify` — frontend sends the signed message back, server verifies it, returns a JWT
4. Build user profile endpoints:
   - `POST /users/profile` — save display name, email, phone
   - `POST /users/bank-account` — save bank details (encrypted before storing)
   - `GET /users/me` — return current logged-in user's data

**Frontend tasks:**
1. Add wallet connection (wagmi + viem or ethers.js) — Connect Wallet button
2. Wire up the SIWE flow: connect → request nonce → sign message → send to server → store the JWT
3. A route guard — if no JWT, redirect to the connect wallet screen
4. Onboarding form — shown only if the user has no profile yet
5. Basic dashboard page after login

**New folders/files:**
```
backend/
  src/
    routes/auth.js
    routes/users.js
    middleware/authenticate.js    ← checks JWT on protected routes
    index.js
  prisma/schema.prisma
  .env
  package.json
```

**What to focus on learning:** How SIWE works (sign a message, verify the signature server-side). This is the wallet-as-identity pattern everything else builds on.

---

## Iteration 2 — Listings (Off-Chain)

**Order to build:** Backend → Frontend. No contracts.

**Backend tasks:**
1. Add `listings` to Prisma schema — id, seller_wallet, zar_rate, zar_amount, token_amount, description, payment_methods, status, created_at
2. Build listings API:
   - `POST /listings` — create a listing (must be authenticated)
   - `GET /listings` — browse all active listings with filters (rate range, payment method)
   - `GET /listings/:id` — single listing detail including seller's public profile
   - `PATCH /listings/:id/cancel` — seller deactivates their listing
3. Add pagination to the browse endpoint

**Frontend tasks:**
1. Listings browse page — cards showing each ad, seller name, rate, token amount
2. Filter sidebar — filter by payment method, ZAR rate range
3. Create listing form — ZAR rate, token amount, description, payment methods (checkboxes)
4. Listing detail page — seller info, trade stats, the listing details, placeholder "Request Trade" button
5. My Listings page — seller sees and manages their own ads

**What to focus on learning:** REST API design. How to structure routes, validate input, and send clean responses. Also React Router — navigating between pages.

---

## Iteration 3 — EscrowFactory Contract

**Order to build:** Contracts only. No backend or frontend changes.

**Contract tasks:**
1. Write `SingleEscrow.sol` — one contract, one trade, no mapping:
   - State: seller, buyer, token, tokenAmount, status, paymentDeadline
   - `initialize()` — called once by the factory when the clone is deployed
   - `confirmPayment()` — buyer calls after sending fiat
   - `releaseFunds()` — seller releases tokens to buyer
   - `cancelTrade()` — seller cancels if buyer's window expires
   - `openDispute()` — buyer or seller escalates
   - `resolveDispute(releaseToBuyer)` — only callable by ArbiterPool
2. Write `EscrowFactory.sol`:
   - Stores the master `SingleEscrow` implementation address
   - `createEscrow(buyer, tokenAmount)` — seller calls this, deploys a clone, locks tokens
   - `mapping(address => bool) isValidEscrow` — so buyers can verify the escrow is legitimate
   - Emits `EscrowCreated(escrowAddress, seller, buyer, tokenAmount)`
3. Write tests — cover every path:
   - Happy path (create → confirm → release)
   - Expired payment (seller reclaims)
   - Dispute path
   - All access control (only seller can release, only buyer can confirm, etc.)
4. Write deploy scripts for local Hardhat network

**What to focus on learning:** The EIP-1167 minimal proxy pattern — how `Clones.clone()` works and why it's cheaper than deploying a full contract. Also how `initialize()` replaces a constructor for clones.

---

## Iteration 4 — Trade Request Flow

**Order to build:** Backend → Contracts (connect factory) → Frontend.

**Backend tasks:**
1. Add `trade_requests` and `trades` to Prisma schema
2. Trade request API:
   - `POST /listings/:id/request` — buyer requests a trade, listing locked to pending
   - `GET /trade-requests/incoming` — seller sees their pending requests
   - `PATCH /trade-requests/:id/accept` — seller accepts
   - `PATCH /trade-requests/:id/decline` — listing goes back to open
3. **Blockchain event listener** — this is the most important new skill:
   - On server startup, connect to the node with ethers.js
   - Listen for `EscrowCreated` events from the factory
   - When detected: find the matching trade record, store the escrow address, update listing status to `in_trade`
4. Bank details reveal endpoint:
   - `GET /trades/:id/payment-details` — verifies requester is the active buyer AND escrow is deployed, only then returns the seller's account number
5. A background job: if seller accepts but no escrow appears within 10 minutes, auto-cancel

**Frontend tasks:**
1. "Request Trade" button on listing detail — calls the API, shows "Waiting for seller"
2. Seller's notification dashboard — incoming requests with buyer profile card (KYC level, trade count, rating)
3. Accept / Decline buttons for seller
4. When seller accepts: MetaMask pops up asking them to call `EscrowFactory.createEscrow()` — tokens lock
5. Trade screen opens: shows seller's bank details, countdown timer for buyer

**What to focus on learning:** Event listeners with ethers.js. This is how your server stays in sync with the blockchain without polling constantly. It's a core skill for any web3 backend.

---

## Iteration 5 — Trade Execution

**Order to build:** Backend → Frontend.

**Backend tasks:**
1. File upload endpoint — buyer uploads bank transfer screenshot (use multer, store locally or in S3)
2. Listen for two more contract events:
   - `PaymentConfirmed` → update trade status in DB
   - `FundsReleased` → mark trade completed, trigger post-trade flow (rating prompt, NFT update later)
3. Trade history API — buyer and seller can see their past trades

**Frontend tasks:**
1. Full trade screen:
   - Seller's bank details panel (account number, bank name, reference to use)
   - Countdown timer — buyer's payment window
   - Upload proof of payment (drag and drop or file picker)
   - "I have paid" button → calls `confirmPayment()` on the escrow contract
2. Seller's side of the trade screen:
   - See the uploaded proof of payment image
   - "Release Funds" button → calls `releaseFunds()` on the escrow
3. Transaction states — pending spinner, success confirmation, error handling
4. Trade complete screen — summary, prompt to rate the other party
5. Star rating form — stored in DB, tied to the completed trade

**What to focus on learning:** UX for blockchain transactions. Transactions take time — you need to show pending states and handle failures gracefully. This is where most web3 UIs fall short.

---

## Iteration 6 — Disputes + Arbiter Portal

**Order to build:** Contracts → Backend → Frontend.

**Contract tasks:**
1. Refactor `ArbiterPool.sol` — instead of referencing an `adId`, disputes are now referenced by the escrow contract address
2. Each `SingleEscrow.openDispute()` passes its own address to the pool
3. Update tests

**Backend tasks:**
1. Arbiter registration API (owner-only: add/remove arbiter wallets)
2. Dispute API:
   - `GET /disputes` — arbiters see their assigned disputes
   - `GET /disputes/:id` — full dispute detail including trade chat and proof of payment
3. Separate auth middleware for the arbiter portal — checks if the wallet is a registered arbiter

**Frontend tasks:**
1. "Open Dispute" button in the trade screen (visible after payment is confirmed, only to buyer or seller)
2. `/arbiter` route — completely separate section of the app with its own layout/nav
3. Arbiter login — same SIWE flow but after login, server checks if they're a registered arbiter
4. Arbiter dispute list — assigned disputes with status
5. Dispute detail page — shows proof of payment image, trade chat history, vote buttons (Release to Buyer / Release to Seller)
6. Arbiter dashboard — their stats (disputes handled, pending)

**What to focus on learning:** Role-based access. How one app can have completely different portals for different user types, all using the same auth system but with different permissions.

---

## Iteration 7 — Dynamic NFT: Trader Reputation

**Order to build:** Contracts → Backend → Frontend.

**Contract tasks:**
1. Write `TraderNFT.sol` — ERC721:
   - One NFT per trader wallet, minted after their first completed trade
   - Stores the trader's level on-chain (0=Bronze, 1=Silver, 2=Gold, 3=Platinum)
   - `mint(to)` and `updateLevel(wallet, newLevel)` — only callable by the platform (owner)
   - `tokenURI()` returns on-chain SVG that changes based on the level — no IPFS dependency
2. Write tests

**Backend tasks:**
1. After a trade completes (FundsReleased event): check if trader has an NFT — if not, mint one
2. Check if they've hit a milestone (10, 50, 100 completed trades) — if yes, call `updateLevel()`
3. Leaderboard query: rank traders by completed trades, total volume, average rating

**Frontend tasks:**
1. Profile page — fetch the trader's NFT, display the SVG, show their level badge and trade stats
2. Trader leaderboard page — ranked list with level badges, volume, trade count
3. "Top Trader" badge shown on listing cards and trade screens

**What to focus on learning:** How on-chain SVG works for dynamic NFTs — generating the image in Solidity so it updates without a server or IPFS. Also how to fetch and display NFT data from the frontend.

---

## Iteration 8 — Arbiter NFT + Rankings

**Order to build:** Contracts → Backend → Frontend. Mirrors Iteration 7 but for arbiters.

**Contract tasks:**
1. `ArbiterNFT.sol` — same pattern as TraderNFT but levels based on disputes resolved, not trades
2. Levels: 1 dispute (Novice), 10 (Established), 50 (Trusted), 100 (Elite)

**Backend tasks:**
1. Track arbiter stats: disputes resolved, how they voted on winning side (accuracy), average time to vote
2. Milestone checks after each dispute resolution — update NFT level
3. Arbiter leaderboard query

**Frontend tasks:**
1. Arbiter profile page inside the arbiter portal — NFT display, stats
2. Arbiter leaderboard — visible to traders too, so they can see who resolves disputes well
3. Arbiter level badge shown in dispute screens so traders know they have experienced arbiters

---

## Iteration 9 — KYC + Trading Limits

**Order to build:** Backend → Frontend.

**Backend tasks:**
1. Integrate Smile ID — use their hosted widget to handle the ID capture, you just get a webhook callback with pass/fail
2. Add `kyc_verifications` table — wallet_address, level, provider, provider_reference, status, verified_at
3. Trading limits middleware — before a buyer can request a trade, check their KYC level against the trade's ZAR amount
4. Verification badge data on user profiles

**Frontend tasks:**
1. KYC prompt — shown on dashboard if user hasn't verified, with a "Get Verified" CTA
2. Smile ID widget embedded — launches their verification flow
3. Verification status badges on profiles (Email ✓, Phone ✓, ID ✓)
4. Limit warning — if buyer tries to request a trade above their limit, show what level they need

**What to focus on learning:** Integrating a third-party API. Handling webhooks. Most real-world backend work involves wiring together external services like this.

---

## Iteration 10 — Testnet Deployment + Polish

**Order:** Contracts → Backend → Frontend.

**Tasks:**
1. Deploy all contracts to Base Sepolia or Polygon Amoy
2. Update all `.env` files with testnet contract addresses and RPC URLs
3. Set up email notifications with Resend — send emails on trade request, acceptance, payment confirmed, dispute opened
4. Security pass: review all API endpoints for missing auth checks, review encrypted fields
5. UX polish: loading states, empty states, error messages, mobile responsiveness
6. Share with testers — anyone with a testnet wallet can use it

**What to focus on learning:** The gap between local development and production. Environment variables, network configuration, and why things that work locally sometimes break on testnet.
