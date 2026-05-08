import { useState, useEffect } from "react";
import { ethers } from "ethers";

// Status enum: Active(0) InTrade(1) Paid(2) Completed(3) Cancelled(4) Disputed(5)
const STATUS = {
  0: { label: "Active",    cls: "status-active"     },
  1: { label: "In Trade",  cls: "status-pending"    },
  2: { label: "Paid",      cls: "status-confirming" },
  3: { label: "Completed", cls: "status-completed"  },
  4: { label: "Cancelled", cls: "status-refunded"   },
  5: { label: "Disputed",  cls: "status-disputed"   },
};

const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS;
const ERC20_ABI    = ["function approve(address spender, uint256 amount) returns (bool)"];

function short(addr) {
  if (!addr || addr === ethers.ZeroAddress) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmt(bigint) {
  return Number(bigint).toLocaleString("en-ZA");
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

function Countdown({ deadlineSeconds }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    function tick() {
      const secs = Math.max(0, Math.floor(Number(deadlineSeconds) - Date.now() / 1000));
      setRemaining(secs);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadlineSeconds]);

  if (remaining === 0) return <span className="deadline expired">Payment window expired</span>;
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return (
    <span className="deadline">
      Payment window: {m}:{String(s).padStart(2, "0")} remaining
    </span>
  );
}

export default function AdCard({ ad, account, contract, onAction }) {
  const [loading, setLoading] = useState(false);
  const [step,    setStep]    = useState(null);
  const [error,   setError]   = useState(null);

  const status   = Number(ad.status);
  const isSeller = account?.toLowerCase() === ad.seller?.toLowerCase();
  const isBuyer  = account?.toLowerCase() === ad.buyer?.toLowerCase();

  const deadlineExpired =
    Number(ad.paymentDeadline) > 0 &&
    Date.now() / 1000 > Number(ad.paymentDeadline);

  async function call(fn, stepLabel) {
    setError(null);
    setLoading(true);
    setStep(stepLabel ?? null);
    try {
      const tx = await fn();
      await tx.wait();
      onAction();
    } catch (err) {
      setError(err.code === "ACTION_REJECTED" ? "Transaction rejected." : err.message);
    } finally {
      setLoading(false);
      setStep(null);
    }
  }

  const initiateTrade   = () => call(() => contract.initiateTrade(ad.id));
  const confirmPayment  = () => call(() => contract.confirmPayment(ad.id));
  const cancelAd        = () => call(() => contract.cancelAd(ad.id));
  const claimExpired    = () => call(() => contract.claimExpiredTrade(ad.id));
  const openDispute     = () => call(() => contract.openDispute(ad.id));

  async function releaseFunds() {
    setError(null);
    setLoading(true);
    try {
      const proxyAddress = await contract.getAddress();
      const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, contract.runner);

      setStep("Step 1/2 — Approving USDC…");
      const approveTx = await usdc.approve(proxyAddress, ad.tokenAmount);
      await approveTx.wait();

      setStep("Step 2/2 — Releasing funds…");
      const releaseTx = await contract.releaseFunds(ad.id);
      await releaseTx.wait();

      onAction();
    } catch (err) {
      setError(err.code === "ACTION_REJECTED" ? "Transaction rejected." : err.message);
    } finally {
      setLoading(false);
      setStep(null);
    }
  }

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

      {/* USDC amount */}
      <div className="ad-amount">
        {ethers.formatUnits(ad.tokenAmount, 6)}<span>USDC</span>
      </div>

      {/* ZAR pricing row */}
      <div className="ad-price-row">
        <span className="ad-price">R {fmt(ad.zarAmount)}</span>
        <span className="ad-price-label">@ R {fmt(ad.zarRate)}/USDC</span>
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

      {/* Payment deadline countdown (InTrade only) */}
      {status === 1 && Number(ad.paymentDeadline) > 0 && (
        <div className="deadline-row">
          <Countdown deadlineSeconds={ad.paymentDeadline} />
        </div>
      )}

      {/* Actions */}
      <div className="ad-actions">
        {step  && <p className="step-indicator">{step}</p>}
        {error && <p className="msg-error">{error}</p>}

        {/* ── Active ── */}
        {status === 0 && !isSeller && !!account && (
          <button className="btn-buy" onClick={initiateTrade} disabled={loading}>
            {loading ? "Initiating…" : "Initiate Trade"}
          </button>
        )}
        {status === 0 && isSeller && (
          <div className="action-group">
            <p className="action-note">Your listing is live. Waiting for a buyer.</p>
            <button className="btn-dispute" onClick={cancelAd} disabled={loading}>
              {loading ? "Cancelling…" : "Cancel Ad"}
            </button>
          </div>
        )}

        {/* ── InTrade ── */}
        {status === 1 && isBuyer && !deadlineExpired && (
          <div className="action-group">
            <p className="action-note">
              Send <strong>R {fmt(ad.zarAmount)}</strong> to the seller via your preferred
              payment method, then confirm below.
            </p>
            <button className="btn-confirm" onClick={confirmPayment} disabled={loading}>
              {loading ? "Confirming…" : "I've Paid — Confirm Payment"}
            </button>
          </div>
        )}
        {status === 1 && isBuyer && deadlineExpired && (
          <p className="action-note">Payment window expired. The seller can reclaim the trade.</p>
        )}
        {status === 1 && isSeller && !deadlineExpired && (
          <p className="action-note">Waiting for the buyer to confirm payment.</p>
        )}
        {status === 1 && isSeller && deadlineExpired && (
          <button className="btn-confirm" onClick={claimExpired} disabled={loading}>
            {loading ? "Claiming…" : "Claim Expired Trade"}
          </button>
        )}

        {/* ── Paid ── */}
        {status === 2 && isSeller && (
          <div className="action-group">
            <p className="action-note">
              Buyer has confirmed payment. Approve your USDC and release funds.
            </p>
            <button className="btn-confirm" onClick={releaseFunds} disabled={loading}>
              {loading ? (step ?? "Processing…") : "Approve & Release Funds"}
            </button>
            <button className="btn-dispute" onClick={openDispute} disabled={loading}>
              {loading ? "…" : "Open Dispute"}
            </button>
          </div>
        )}
        {status === 2 && isBuyer && (
          <div className="action-group">
            <p className="action-note">Payment confirmed. Waiting for the seller to release funds.</p>
            <button className="btn-dispute" onClick={openDispute} disabled={loading}>
              {loading ? "…" : "Open Dispute"}
            </button>
          </div>
        )}

        {/* ── Completed ── */}
        {status === 3 && (
          <p className="action-note success">Trade complete — USDC sent to buyer.</p>
        )}

        {/* ── Cancelled ── */}
        {status === 4 && (
          <p className="action-note">Ad cancelled by the seller.</p>
        )}

        {/* ── Disputed ── */}
        {status === 5 && (
          <p className="action-note">Dispute opened. Awaiting arbiter pool resolution.</p>
        )}
      </div>
    </div>
  );
}
