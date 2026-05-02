import { useState } from "react";

// Props come from App.jsx — this component does NOT call useContract itself.
// It needs `contract` to send transactions and `isConnected` to guard the button.

export default function ContractWriter({ contract, isConnected }) {
  const [inputValue, setInputValue] = useState("");
  const [txHash, setTxHash] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleWrite() {
    if (!contract || !isConnected) {
      setError("Please connect your wallet first.");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setTxHash(null);

      // Replace "setValue" with your actual Solidity function name
      const tx = await contract.setValue(inputValue);

      // Show the hash immediately so the user knows the tx was sent
      setTxHash(tx.hash);

      // Wait for the transaction to be mined (confirmed on-chain)
      await tx.wait();

      alert("Transaction confirmed!");
    } catch (err) {
      // Translate common MetaMask error codes into readable messages
      if (err.code === "ACTION_REJECTED") {
        setError("You rejected the transaction in MetaMask.");
      } else if (err.code === "INSUFFICIENT_FUNDS") {
        setError("Not enough ETH to cover gas fees.");
      } else {
        setError(err.message);
      }
      console.error("Write error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <h2>Update Contract</h2>

      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Enter new value"
      />

      <button onClick={handleWrite} disabled={isLoading || !isConnected}>
        {isLoading ? "Processing..." : "Send Transaction"}
      </button>

      {txHash && (
        <p>
          Transaction sent:{" "}
          <a
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            View on Etherscan
          </a>
        </p>
      )}

      {error && <p style={{ color: "red" }}>Error: {error}</p>}
    </div>
  );
}