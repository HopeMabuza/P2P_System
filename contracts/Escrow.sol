// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IArbiterPool {
    function registerDispute(uint256 adId) external returns (uint256 disputeId);
}

contract Escrow is UUPSUpgradeable, OwnableUpgradeable {
    //for adding token to my contract
    using SafeERC20 for IERC20;

    IERC20 public token;
    address public arbiterPool;
    uint256 private _nextAdId;

    uint256 public constant PAYMENT_TIMEOUT = 5 minutes;

    enum Status { Active, InTrade, Paid, Completed, Cancelled, Disputed }

    struct Ad {
        address seller;
        address buyer;
        uint256 zarRate;
        uint256 zarAmount;
        uint256 tokenAmount;
        uint256 paymentDeadline;
        Status  status;
    }

    mapping(uint256 => Ad) public ads;

    event AdCreated(uint256 indexed adId, address indexed seller, uint256 tokenAmount, uint256 zarRate);
    event TradeInitiated(uint256 indexed adId, address indexed buyer);
    event PaymentConfirmed(uint256 indexed adId);
    event FundsReleased(uint256 indexed adId);
    event AdCancelled(uint256 indexed adId);
    event TradeExpired(uint256 indexed adId, address indexed expiredBuyer);
    event DisputeOpened(uint256 indexed adId, address indexed opener);
    event DisputeResolved(uint256 indexed adId, bool releasedToBuyer);

    modifier onlyArbiterPool() {
        require(msg.sender == arbiterPool, "Only arbiter pool");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _token, address _arbiterPool) external initializer {
        __Ownable_init(msg.sender);
        token = IERC20(_token);
        arbiterPool = _arbiterPool;
    }


    //takes in rate, price and token amount. Populates the struct with seller, rate, price, token amount and zero address for buyer
    function createAd(uint256 zarRate, uint256 zarAmount, uint256 tokenAmount) external {
        require(tokenAmount > 0, "Token amount must be > 0");
        require(zarRate   > 0, "Rate must be > 0");
        require(zarAmount > 0, "ZAR amount must be > 0");

        uint256 adId = _nextAdId++;

        ads[adId] = Ad({
            seller:          msg.sender,
            buyer:           address(0),
            zarRate:         zarRate,
            zarAmount:       zarAmount,
            tokenAmount:     tokenAmount,
            paymentDeadline: 0,
            status:          Status.Active
        });

        emit AdCreated(adId, msg.sender, tokenAmount, zarRate);
    }


    //only buyer can call this function. Initiates the trade and sets struct status to InTrade
    function initiateTrade(uint256 adId) external {
        Ad storage ad = ads[adId];
        require(ad.status == Status.Active,    "Ad not active");
        require(ad.seller != msg.sender,       "Seller cannot buy own ad");

        ad.buyer           = msg.sender;
        ad.status          = Status.InTrade;
        ad.paymentDeadline = block.timestamp + PAYMENT_TIMEOUT;

        emit TradeInitiated(adId, msg.sender);
    }


    //Buyer confirm payment that is done off chain
    function confirmPayment(uint256 adId) external {
        Ad storage ad = ads[adId];
        require(ad.status == Status.InTrade,          "Trade not in progress");
        require(ad.buyer  == msg.sender,               "Only buyer");
        require(block.timestamp <= ad.paymentDeadline, "Payment window expired");

        ad.status = Status.Paid;

        emit PaymentConfirmed(adId);
    }

    //seller tokens are taken from their wallet
    function releaseFunds(uint256 adId) external {
        Ad storage ad = ads[adId];
        require(ad.status == Status.Paid,  "Payment not confirmed yet");
        require(ad.seller == msg.sender,   "Only seller");

        ad.status = Status.Completed;

        token.safeTransferFrom(ad.seller, address(this), ad.tokenAmount);
        token.safeTransfer(ad.buyer, ad.tokenAmount);

        emit FundsReleased(adId);
    }

    //seller can cancel trade if they want to
    function cancelAd(uint256 adId) external {
        Ad storage ad = ads[adId];
        require(ad.status == Status.Active, "Can only cancel an active ad");
        require(ad.seller == msg.sender,    "Only seller");

        ad.status = Status.Cancelled;

        emit AdCancelled(adId);
    }

    function claimExpiredTrade(uint256 adId) external {
        Ad storage ad = ads[adId];
        require(ad.status == Status.InTrade,           "Trade not in progress");
        require(block.timestamp > ad.paymentDeadline,  "Payment window still open");
        require(ad.seller == msg.sender,               "Only seller");

        address expiredBuyer  = ad.buyer;
        ad.buyer              = address(0);
        ad.paymentDeadline    = 0;
        ad.status             = Status.Active;

        token.safeTransfer(ad.seller, ad.tokenAmount);

        emit TradeExpired(adId, expiredBuyer);
    }

    function openDispute(uint256 adId) external {
        Ad storage ad = ads[adId];
        require(ad.status == Status.Paid, "Payment must be confirmed first");
        require(msg.sender == ad.buyer || msg.sender == ad.seller, "Only buyer or seller");

        ad.status = Status.Disputed;

        emit DisputeOpened(adId, msg.sender);

        IArbiterPool(arbiterPool).registerDispute(adId);
    }

    function resolveDispute(uint256 adId, bool releaseToBuyer) external onlyArbiterPool {
        Ad storage ad = ads[adId];
        require(ad.status == Status.Disputed, "Not disputed");

        ad.status = Status.Completed;

        if (releaseToBuyer) {
            token.safeTransfer(ad.buyer,  ad.tokenAmount);
        } else {
            token.safeTransfer(ad.seller, ad.tokenAmount);
        }

        emit DisputeResolved(adId, releaseToBuyer);
    }

    function setArbiterPool(address _arbiterPool) external onlyOwner {
        arbiterPool = _arbiterPool;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
