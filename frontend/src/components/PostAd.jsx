import { useState } from "react";
import { ethers } from "ethers";

export default function PostAd({ contract, onAdPosted, onClose }) {
  const [amount,  setAmount]  = useState("");
  const [rate,    setRate]    = useState("");
  const [posting, setPosting] = useState(false);
  const [error,   setError]   = useState(null);

  const zarTotal =
    amount && rate && !isNaN(amount) && !isNaN(rate)
      ? (parseFloat(amount) * parseFloat(rate)).toLocaleString("en-ZA", { maximumFractionDigits: 0 })
      : null;

  async function handlePost() {
    if (!amount || !rate) {
      setError("Please fill in both fields.");
      return;
    }
    const usdcAmt = parseFloat(amount);
    const zarRate = parseFloat(rate);
    if (usdcAmt <= 0 || zarRate <= 0) {
      setError("Values must be greater than zero.");
      return;
    }
    setError(null);

    try {
      setPosting(true);
      const tokenAmount = ethers.parseUnits(amount, 6);
      const zarRateBN   = BigInt(Math.round(zarRate));
      const zarAmountBN = BigInt(Math.round(usdcAmt * zarRate));

      const tx = await contract.createAd(zarRateBN, zarAmountBN, tokenAmount);
      await tx.wait();
      onAdPosted();
    } catch (err) {
      setError(err.code === "ACTION_REJECTED" ? "Transaction rejected." : err.message);
      setPosting(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget && !posting) onClose(); }}
    >
      <div className="modal">
        <div className="modal-header">
          <h2>Post a Sell Ad</h2>
          <button className="modal-close" onClick={onClose} disabled={posting}>✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-info-banner">
            Post your USDC sell ad. When a buyer initiates a trade you will have 5 minutes
            to receive ZAR payment off-chain. Once the buyer confirms payment, approve your
            USDC and release funds on-chain.
          </div>

          <div className="form-group">
            <label className="form-label">USDC Amount</label>
            <div className="input-wrapper">
              <input
                className="form-input"
                type="number"
                min="0"
                placeholder="e.g. 500"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                disabled={posting}
              />
              <span className="input-suffix">USDC</span>
            </div>
            <span className="form-hint">How many USDC you are selling</span>
          </div>

          <div className="form-group">
            <label className="form-label">ZAR Rate per USDC</label>
            <div className="input-wrapper">
              <input
                className="form-input"
                type="number"
                min="0"
                placeholder="e.g. 18500"
                value={rate}
                onChange={e => setRate(e.target.value)}
                disabled={posting}
              />
              <span className="input-suffix">ZAR</span>
            </div>
            <span className="form-hint">ZAR the buyer pays per 1 USDC</span>
          </div>

          {zarTotal && (
            <div className="form-derived">
              Buyer pays: <strong>R {zarTotal}</strong> total
            </div>
          )}

          {error && <p className="msg-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose} disabled={posting}>
            Cancel
          </button>
          <button className="btn btn-sell" onClick={handlePost} disabled={posting}>
            {posting ? "Posting ad…" : "Post Ad"}
          </button>
        </div>
      </div>
    </div>
  );
}
