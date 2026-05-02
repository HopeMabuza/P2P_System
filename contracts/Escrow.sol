// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Escrow is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    using SafeERC20 for IERC20;

    enum Status { Active, Locked, Confirming, Completed, Disputed, Refunded }

    struct Ad {
        address seller;
        address buyer;
        address token;
        uint256 tokenAmount;
        uint256 ethPrice;
        Status  status;
        bool    sellerConfirmed;
        bool    buyerConfirmed;
    }

    mapping(uint256 => Ad) public listings;
    uint256 public listingCount;

    address public allowedToken;
    address public arbiter;

    event AdPosted(uint256 indexed adId, address indexed seller, address token, uint256 tokenAmount, uint256 ethPrice);
    event TradeLocked(uint256 indexed adId, address indexed buyer);
    event Confirmed(uint256 indexed adId, address indexed party);
    event Disputed(uint256 indexed adId, address indexed party);
    event Resolved(uint256 indexed adId, address indexed arbiter, bool releaseToBuyer);

    modifier onlyParties(uint256 adId) {
        require(
            msg.sender == listings[adId].buyer || msg.sender == listings[adId].seller,
            "Only buyer or seller"
        );
        _;
    }

    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Only the arbiter");
        _;
    }

    modifier inStatus(uint256 adId, Status expected) {
        require(listings[adId].status == expected, "Invalid status for this action");
        _;
    }


    function initialize(address _allowedToken, address _arbiter) public initializer {
        __Ownable_init(msg.sender);
        require(_arbiter != address(0), "Invalid arbiter address");
        allowedToken = _allowedToken;
        arbiter      = _arbiter;
    }


    function postAd(
        address _token,
        uint256 _tokenAmount,
        uint256 _ethPrice
    ) external returns (uint256 adId) {
        require(_token == allowedToken,   "Token not allowed");
        require(_tokenAmount > 0,         "Token amount must be greater than zero");
        require(_ethPrice > 0,            "ETH price must be greater than zero");
        require(msg.sender != arbiter,    "Arbiter cannot be the seller");

        adId = listingCount++;

        listings[adId] = Ad({
            seller:          msg.sender,
            buyer:           address(0),
            token:           _token,
            tokenAmount:     _tokenAmount,
            ethPrice:        _ethPrice,
            status:          Status.Active,
            sellerConfirmed: false,
            buyerConfirmed:  false
        });

        IERC20(_token).safeTransferFrom(msg.sender, address(this), _tokenAmount);

        emit AdPosted(adId, msg.sender, _token, _tokenAmount, _ethPrice);
    }

    
    function lockTrade(uint256 adId) external payable inStatus(adId, Status.Active) {
        Ad storage ad = listings[adId];
        require(msg.sender != ad.seller,  "Seller cannot be the buyer");
        require(msg.sender != arbiter,    "Arbiter cannot be the buyer");
        require(msg.value == ad.ethPrice, "Send exact ETH price to lock the trade");

        ad.buyer  = msg.sender;
        ad.status = Status.Locked;

        emit TradeLocked(adId, msg.sender);
    }

   
    function confirmTransaction(uint256 adId) external onlyParties(adId) {
        Ad storage ad = listings[adId];
        require(
            ad.status == Status.Locked || ad.status == Status.Confirming,
            "Trade must be locked before confirming"
        );

        if (msg.sender == ad.buyer) {
            ad.buyerConfirmed = true;
        } else {
            ad.sellerConfirmed = true;
        }

        if (ad.status == Status.Locked) {
            ad.status = Status.Confirming;
        }

        emit Confirmed(adId, msg.sender);

        if (ad.buyerConfirmed && ad.sellerConfirmed) {
            _releaseToBuyer(adId);
        }
    }


    function openDispute(uint256 adId) external onlyParties(adId) {
        Ad storage ad = listings[adId];
        require(
            ad.status == Status.Locked || ad.status == Status.Confirming,
            "No active trade to dispute"
        );
        ad.status = Status.Disputed;
        emit Disputed(adId, msg.sender);
    }

  
    function resolveDispute(uint256 adId, bool releaseToBuyer)
        external
        onlyArbiter
        inStatus(adId, Status.Disputed)
    {
        Ad storage ad = listings[adId];

        if (releaseToBuyer) {
            ad.status = Status.Refunded;
            IERC20(ad.token).safeTransfer(ad.seller, ad.tokenAmount);
            (bool ethRefunded, ) = ad.buyer.call{value: ad.ethPrice}("");
            require(ethRefunded, "ETH refund to buyer failed");
        } else {
            _releaseToBuyer(adId);
        }

        emit Resolved(adId, msg.sender, releaseToBuyer);
    }

    function _releaseToBuyer(uint256 adId) internal {
        Ad storage ad = listings[adId];
        ad.status = Status.Completed;
        IERC20(ad.token).safeTransfer(ad.buyer, ad.tokenAmount);
        (bool ethSent, ) = ad.seller.call{value: ad.ethPrice}("");
        require(ethSent, "ETH transfer to seller failed");
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
