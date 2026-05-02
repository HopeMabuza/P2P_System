import AdCard from "./AdCard";

const EMPTY = {
  active:    { icon: "📋", text: "No active listings yet. Be the first to post a sell ad." },
  pending:   { icon: "⏳", text: "No pending trades at the moment."                        },
  completed: { icon: "✅", text: "No completed trades yet."                                },
};

export default function ListingsBoard({ listings, account, arbiter, contract, onAction, activeTab }) {
  const empty = EMPTY[activeTab] ?? { icon: "📋", text: "No listings." };

  if (listings.length === 0) {
    return (
      <div className="listings-grid">
        <div className="empty-state">
          <span className="empty-icon">{empty.icon}</span>
          <p>{empty.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="listings-grid">
      {listings.map(ad => (
        <AdCard
          key={ad.id}
          ad={ad}
          account={account}
          arbiter={arbiter}
          contract={contract}
          onAction={onAction}
        />
      ))}
    </div>
  );
}
