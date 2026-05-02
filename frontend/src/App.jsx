import { useState, useEffect, useCallback } from "react";
import { useContract } from "./hooks/useContract";
import Navbar from "./components/Navbar";
import PostAd from "./components/PostAd";
import ListingsBoard from "./components/ListingsBoard";
import "./App.css";

const TABS = [
  { key: "active",    label: "Active"    },
  { key: "pending",   label: "Pending"   },
  { key: "completed", label: "Completed" },
];

// 0=Active 1=Locked 2=Confirming 3=Completed 4=Disputed 5=Refunded
function classify(status) {
  const s = Number(status);
  if (s === 0)                       return "active";
  if (s === 1 || s === 2 || s === 4) return "pending";
  return "completed";
}

export default function App() {
  const { contract, signer, account, isConnected, error, connectWallet, disconnectWallet } =
    useContract();

  const [listings,   setListings]   = useState([]);
  const [arbiter,    setArbiter]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [activeTab,  setActiveTab]  = useState("active");
  const [postAdOpen, setPostAdOpen] = useState(false);

  useEffect(() => {
    if (!contract) return;
    contract.arbiter().then(setArbiter).catch(() => {});
  }, [contract]);

  const fetchListings = useCallback(async () => {
    if (!contract || !isConnected) return;
    try {
      setLoading(true);
      const count = await contract.listingCount();
      const ads = [];
      for (let i = 0; i < Number(count); i++) {
        const ad = await contract.listings(i);
        ads.push({
          id:              i,
          seller:          ad.seller,
          buyer:           ad.buyer,
          token:           ad.token,
          tokenAmount:     ad.tokenAmount,
          ethPrice:        ad.ethPrice,
          status:          ad.status,
          sellerConfirmed: ad.sellerConfirmed,
          buyerConfirmed:  ad.buyerConfirmed,
        });
      }
      setListings(ads);
    } catch (err) {
      console.error("Failed to fetch listings:", err);
    } finally {
      setLoading(false);
    }
  }, [contract, isConnected]);

  useEffect(() => {
    fetchListings();
    const interval = setInterval(fetchListings, 15000);
    return () => clearInterval(interval);
  }, [fetchListings]);

  // Clear listings when wallet disconnects
  useEffect(() => {
    if (!isConnected) setListings([]);
  }, [isConnected]);

  const grouped = {
    active:    listings.filter(ad => classify(ad.status) === "active"),
    pending:   listings.filter(ad => classify(ad.status) === "pending"),
    completed: listings.filter(ad => classify(ad.status) === "completed"),
  };

  return (
    <div>
      <Navbar
        account={account}
        isConnected={isConnected}
        connectWallet={connectWallet}
        disconnectWallet={disconnectWallet}
        error={error}
        onOpenPostAd={() => setPostAdOpen(true)}
      />

      {isConnected ? (
        <main className="main">
          {postAdOpen && (
            <PostAd
              contract={contract}
              signer={signer}
              onAdPosted={() => { fetchListings(); setPostAdOpen(false); }}
              onClose={() => setPostAdOpen(false)}
            />
          )}

          <div className="tabs">
            {TABS.map(tab => (
              <button
                key={tab.key}
                className={`tab${activeTab === tab.key ? " active-tab" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
                <span className="tab-count">{grouped[tab.key].length}</span>
              </button>
            ))}
          </div>

          {loading && listings.length === 0 ? (
            <div className="loading-state">
              <div className="spinner" />
              <p>Loading listings…</p>
            </div>
          ) : (
            <ListingsBoard
              listings={grouped[activeTab]}
              account={account}
              arbiter={arbiter}
              contract={contract}
              onAction={fetchListings}
              activeTab={activeTab}
            />
          )}
        </main>
      ) : (
        <div className="hero">
          <div className="hero-content">
            <div className="hero-icon">
              <UsdcIcon size={52} />
            </div>
            <h1 className="hero-title">Stablecoin Marketplace</h1>
            <p className="hero-subtitle">
              Buy and sell USDC with ETH, secured by smart-contract escrow.
              Connect your wallet to view listings and post sell ads.
            </p>
            <button className="btn btn-primary btn-lg" onClick={connectWallet}>
              Connect Wallet
            </button>
            {error && <p className="hero-error">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function UsdcIcon({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
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
