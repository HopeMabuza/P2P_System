export default function Navbar({
  account,
  isConnected,
  connectWallet,
  disconnectWallet,
  error,
  onOpenPostAd,
}) {
  const short = account ? `${account.slice(0, 6)}...${account.slice(-4)}` : null;

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="brand-abc">Stablecoin</span>
        <span className="brand-sep"> </span>
        <span className="brand-p2p">Marketplace</span>
      </div>

      <div className="navbar-right">
        {error && <span className="msg-error">{error}</span>}

        {isConnected ? (
          <>
            <button className="btn btn-sell btn-sm" onClick={onOpenPostAd}>
              + Post Sell Ad
            </button>
            <div className="wallet-pill">
              <span className="wallet-dot" />
              <span className="wallet-address">{short}</span>
            </div>
            <button className="btn btn-outline btn-sm" onClick={disconnectWallet}>
              Disconnect
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={connectWallet}>
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  );
}
