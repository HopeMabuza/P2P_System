import { useState, useEffect } from "react";

// Props come from App.jsx — this component does NOT call useContract itself.
// It only needs `contract` to read from the blockchain.

export default function ContractReader({ contract }) {
  const [value, setValue] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  async function fetchValue() {
    if (!contract) return;

    try {
      setIsLoading(true);
      setError(null);

      // Replace "getValue" with your actual Solidity function name
      const result = await contract.getValue();

      // Solidity uint256 comes back as BigInt in ethers v6 — convert for display
      setValue(result.toString());
    } catch (err) {
      setError(err.message);
      console.error("Read error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  // Fetch data whenever the contract instance becomes available
  useEffect(() => {
    fetchValue();
  }, [contract]);

  return (
    <div>
      <h2>Contract Data</h2>
      {isLoading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {value !== null && <p>Current Value: {value}</p>}
      <button onClick={fetchValue}>Refresh</button>
    </div>
  );
}