import { useState } from "react";
import { ethers } from "ethers";

const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS;
const ERC20_ABI    = ["function approve(address spender, uint256 amount) returns (bool)"];

export default function PostAd({ contract, signer, onAdPosted, onClose }) {
  const [amount, setAmount] = useState("");
  const [price,  setPrice]  = useState("");
  const [step,   setStep]   = useState(0); // 0=idle 1=approving 2=posting
  const [error,  setError]  = useState(null);

  async function handlePost() {
    if (!amount || !price) {
      setError("Please fill in both fields.");
      return;
    }
    setError(null);

    try {
      const tokenAmount  = ethers.parseUnits(amount, 6);
      const ethPrice     = ethers.parseEther(price);
      const proxyAddress = await contract.getAddress();

      setStep(1);
      const usdc      = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
      const approveTx = await usdc.approve(proxyAddress, tokenAmount);
      await approveTx.wait();

      setStep(2);
      const postTx = await contract.postAd(USDC_ADDRESS, tokenAmount, ethPrice);
      await postTx.wait();

      onAdPosted();
    } catch (err) {
      setError(err.code === "ACTION_REJECTED" ? "Transaction rejected." : err.message);
      setStep(0);
    }
  }

  const busy      = step > 0;
  const stepLabel =
    step === 1 ? "Step 1/2 — Approving USDC…" :
    step === 2 ? "Step 2/2 — Posting ad…"      : null;

  return (
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="modal">
        <div className="modal-header">
          <h2>Post a Sell Ad</h2>
          <button className="modal-close" onClick={onClose} disabled={busy}>✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-info-banner">
            Your USDC will be locked in escrow. Once a buyer sends ETH and both parties
            confirm, the trade settles automatically on-chain.
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
                disabled={busy}
              />
              <span className="input-suffix">USDC</span>
            </div>
            <span className="form-hint">How many USDC you are selling</span>
          </div>

          <div className="form-group">
            <label className="form-label">Price in ETH</label>
            <div className="input-wrapper">
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.0001"
                placeholder="e.g. 0.25"
                value={price}
                onChange={e => setPrice(e.target.value)}
                disabled={busy}
              />
              <span className="input-suffix">ETH</span>
            </div>
            <span className="form-hint">Exact ETH the buyer must send to lock the trade</span>
          </div>

          {stepLabel && <p className="step-indicator">{stepLabel}</p>}
          {error     && <p className="msg-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-sell" onClick={handlePost} disabled={busy}>
            {busy ? "Processing…" : "Approve & Post Ad"}
          </button>
        </div>
      </div>
    </div>
  );
}
