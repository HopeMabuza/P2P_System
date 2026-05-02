import { useState } from "react";
import { ethers } from "ethers";

// Matches contract enum: Active(0) Locked(1) Confirming(2) Completed(3) Disputed(4) Refunded(5)
const STATUS = {
  0: { label: "Active",     cls: "status-active"     },
  1: { label: "Locked",     cls: "status-pending"    },
  2: { label: "Confirming", cls: "status-confirming" },
  3: { label: "Completed",  cls: "status-completed"  },
  4: { label: "Disputed",   cls: "status-disputed"   },
  5: { label: "Refunded",   cls: "status-refunded"   },
};

function short(addr) {
  if (!addr || addr === ethers.ZeroAddress) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function UsdcIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        d="M20.022 18.124c0-2.124-1.28-2.852-3.84-3.156-1.828-.232-2.194-.696-2.194-1.508
           0-.812.598-1.336 1.788-1.336 1.07 0 1.668.356 1.962 1.232a.365.365 0 00.348.232h.796
           a.353.353 0 00.354-.354v-.044a3.09 3.09 0 00-2.766-2.552V9.826a.353.353 0 00-.354-.354h-.754
           a.353.353 0 00-.354.354v1.784c-1.736.232-2.836 1.348-2.836 2.78 0 2.006 1.232 2.778 3.792 3.082
           1.696.29 2.242.696 2.242 1.626s-.742 1.568-1.932 1.568c-1.508 0-2.006-.638-2.182-1.508
           a.376.376 0 00-.362-.29h-.826a.353.353 0 00-.354.354v.044c.232 1.68 1.348 2.852 3.016 3.142v1.8
           c0 .196.16.354.354.354h.754c.196 0 .354-.158.354-.354v-1.8c1.758-.262 2.942-1.45 2.942-3.08z"
        fill="white"
      />
      <path
        d="M13.318 23.576C9.35 22.192 7.246 17.808 8.63 13.84a7.32 7.32 0 014.688-4.688
           .364.364 0 00.248-.348V8.06a.353.353 0 00-.354-.354c-.044 0-.09.008-.132.026
           -4.936 1.552-7.68 6.84-6.128 11.776a9.975 9.975 0 006.128 6.128.352.352 0 00.46-.338v-.748
           a.37.37 0 00-.222-.374zM19.126 7.732a.352.352 0 00-.46.338v.748c0 .16.094.306.238.37
           3.968 1.384 6.072 5.768 4.688 9.736a7.32 7.32 0 01-4.688 4.688.364.364 0 00-.248.348v.744
           c0 .196.16.354.354.354.044 0 .09-.008.132-.026 4.936-1.552 7.68-6.84 6.128-11.776
           a9.99 9.99 0 00-6.144-6.124z"
        fill="white"
      />
    </svg>
  );
}

export default function AdCard({ ad, account, arbiter, contract, onAction }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const status    = Number(ad.status);
  const isSeller  = account?.toLowerCase() === ad.seller?.toLowerCase();
  const isBuyer   = account?.toLowerCase() === ad.buyer?.toLowerCase();
  const isArbiter = account?.toLowerCase() === arbiter?.toLowerCase();
  const inTrade   = isSeller || isBuyer;

  const tradeIsLive    = status === 1 || status === 2;
  const myConfirmed    = isSeller ? ad.sellerConfirmed : isBuyer ? ad.buyerConfirmed  : false;
  const otherConfirmed = isSeller ? ad.buyerConfirmed  : isBuyer ? ad.sellerConfirmed : false;
  const otherLabel     = isSeller ? "buyer" : "seller";

  const canLock    = status === 0 && !isSeller && !isArbiter && !!account;
  const canConfirm = inTrade && tradeIsLive && !myConfirmed;
  const canDispute = inTrade && tradeIsLive;
  const canResolve = status === 4 && isArbiter;

  async function call(fn) {
    setError(null);
    setLoading(true);
    try {
      const tx = await fn();
      await tx.wait();
      onAction();
    } catch (err) {
      setError(err.code === "ACTION_REJECTED" ? "Transaction rejected." : err.message);
    } finally {
      setLoading(false);
    }
  }

  const lockTrade     = () => call(() => contract.lockTrade(ad.id, { value: ad.ethPrice }));
  const confirmTrade  = () => call(() => contract.confirmTransaction(ad.id));
  const openDispute   = () => call(() => contract.openDispute(ad.id));
  // resolveDispute(adId, releaseToBuyer):
  //   false → complete: USDC→buyer, ETH→seller
  //   true  → cancel: USDC→seller, ETH→buyer
  const completeTrade = () => call(() => contract.resolveDispute(ad.id, false));
  const cancelTrade   = () => call(() => contract.resolveDispute(ad.id, true));

  const st = STATUS[status] ?? STATUS[0];

  return (
    <div className={`ad-card ${st.cls}`}>

      {/* Token badge + status pill */}
      <div className="ad-card-top">
        <div className="token-badge">
          <UsdcIcon />
          USDC
        </div>
        <span className={`status-pill ${st.cls}`}>{st.label}</span>
      </div>

      {/* Amount */}
      <div className="ad-amount">
        {ethers.formatUnits(ad.tokenAmount, 6)}<span>USDC</span>
      </div>

      {/* ETH price */}
      <div className="ad-price-row">
        <span className="ad-price">{ethers.formatEther(ad.ethPrice)} ETH</span>
        <span className="ad-price-label">required to lock</span>
      </div>

      {/* Seller / buyer */}
      <div className="ad-meta">
        <div className="ad-meta-row">
          <span className="meta-label">Seller</span>
          <span className="meta-value">
            {short(ad.seller)}
            {isSeller && <span className="you-tag">you</span>}
          </span>
        </div>
        {ad.buyer && ad.buyer !== ethers.ZeroAddress && (
          <div className="ad-meta-row">
            <span className="meta-label">Buyer</span>
            <span className="meta-value">
              {short(ad.buyer)}
              {isBuyer && <span className="you-tag">you</span>}
            </span>
          </div>
        )}
      </div>

      {/* Confirmation progress (Locked / Confirming) */}
      {tradeIsLive && (
        <div className="confirm-progress">
          <div className={`confirm-step ${ad.sellerConfirmed ? "done" : ""}`}>
            <span className="confirm-check">{ad.sellerConfirmed ? "✓" : "○"}</span>
            Seller
          </div>
          <div className="confirm-line" />
          <div className={`confirm-step ${ad.buyerConfirmed ? "done" : ""}`}>
            <span className="confirm-check">{ad.buyerConfirmed ? "✓" : "○"}</span>
            Buyer
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="ad-actions">
        {error && <p className="msg-error">{error}</p>}

        {/* Active — any connected non-seller can buy */}
        {canLock && (
          <button className="btn-buy" onClick={lockTrade} disabled={loading}>
            {loading ? "Sending ETH…" : `Buy — ${ethers.formatEther(ad.ethPrice)} ETH`}
          </button>
        )}

        {/* Active — seller sees a waiting message */}
        {status === 0 && isSeller && (
          <p className="action-note">Your listing is live. Waiting for a buyer.</p>
        )}

        {/* Locked / Confirming — trade parties act */}
        {inTrade && tradeIsLive && (
          <div className="action-group">
            {canConfirm && (
              <button className="btn-confirm" onClick={confirmTrade} disabled={loading}>
                {loading ? "Confirming…" : "Confirm Payment"}
              </button>
            )}
            {myConfirmed && !otherConfirmed && (
              <p className="action-note">Waiting for the {otherLabel} to confirm.</p>
            )}
            {canDispute && (
              <button className="btn-dispute" onClick={openDispute} disabled={loading}>
                {loading ? "…" : "Open Dispute"}
              </button>
            )}
          </div>
        )}

        {/* Disputed — arbiter resolves */}
        {canResolve && (
          <div className="action-group">
            <button className="btn-confirm" onClick={completeTrade} disabled={loading}>
              {loading ? "…" : "Complete Trade"}
            </button>
            <button className="btn-dispute" onClick={cancelTrade} disabled={loading}>
              {loading ? "…" : "Cancel & Refund"}
            </button>
          </div>
        )}

        {/* Disputed — party waits */}
        {status === 4 && inTrade && (
          <p className="action-note">Dispute opened. Waiting for the arbiter to resolve.</p>
        )}

        {/* Terminal states */}
        {status === 3 && (
          <p className="action-note success">Trade complete — USDC sent to buyer, ETH sent to seller.</p>
        )}
        {status === 5 && (
          <p className="action-note">Trade cancelled — funds returned to both parties.</p>
        )}
      </div>
    </div>
  );
}
