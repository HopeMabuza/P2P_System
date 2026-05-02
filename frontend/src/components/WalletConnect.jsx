// Props come from App.jsx — this component does NOT call useContract itself.
// It just displays wallet state and triggers connection.

export default function WalletConnect({ account, isConnected, error, connectWallet }) {
  // Shorten address for display: 0x1234...abcd
  const shortAddress = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : null;

  return (
    <div>
      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {!isConnected ? (
        <button onClick={connectWallet}>Connect Wallet</button>
      ) : (
        <p>Connected: {shortAddress}</p>
      )}
    </div>
  );
}