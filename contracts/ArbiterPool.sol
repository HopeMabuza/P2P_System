// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

interface IEscrow {
    function resolveDispute(uint256 adId, bool releaseToBuyer) external;
}

contract ArbiterPool is UUPSUpgradeable, OwnableUpgradeable {

    IEscrow public escrow;

    address[] public arbiters;
    mapping(address => bool) public isArbiter;

    uint256 private _nextDisputeId;

    struct Dispute {
        uint256 adId;
        address[3] assigned;
        uint8   votesForBuyer;
        uint8   votesForSeller;
        bool    resolved;
        uint256 deadline;
    }

    mapping(uint256 => Dispute) public disputes;
    mapping(uint256 => bool) public adDisputed;
    mapping(uint256 => mapping(address => bool)) private _voted;

    uint256 public constant VOTING_WINDOW = 5 minutes;

    event ArbiterAdded(address indexed arbiter);
    event ArbiterRemoved(address indexed arbiter);
    event DisputeRegistered(uint256 indexed disputeId, uint256 indexed adId, address[3] assigned);
    event VoteCast(uint256 indexed disputeId, address indexed arbiter, bool releaseToBuyer);
    event DisputeResolved(uint256 indexed disputeId, bool releaseToBuyer);

    modifier onlyArbiter() {
        require(isArbiter[msg.sender], "Not an approved arbiter");
        _;
    }

    modifier onlyEscrow() {
        require(msg.sender == address(escrow), "Only escrow");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _escrow) external initializer {
        __Ownable_init(msg.sender);
        escrow = IEscrow(_escrow);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function addArbiter(address _arbiter) external onlyOwner {
        require(_arbiter != address(0), "Invalid address");
        require(!isArbiter[_arbiter], "Already an arbiter");
        isArbiter[_arbiter] = true;
        arbiters.push(_arbiter);
        emit ArbiterAdded(_arbiter);
    }

    function removeArbiter(address _arbiter) external onlyOwner {
        require(isArbiter[_arbiter], "Not an arbiter");
        isArbiter[_arbiter] = false;
        for (uint256 i = 0; i < arbiters.length; i++) {
            if (arbiters[i] == _arbiter) {
                arbiters[i] = arbiters[arbiters.length - 1];
                arbiters.pop();
                break;
            }
        }
        emit ArbiterRemoved(_arbiter);
    }

    function arbiterCount() external view returns (uint256) {
        return arbiters.length;
    }

    function registerDispute(uint256 adId) external onlyEscrow returns (uint256 disputeId) {
        require(arbiters.length >= 3, "Need at least 3 arbiters in the pool");
        require(!adDisputed[adId], "Dispute already registered for this ad");

        address[3] memory assigned = _pickThreeArbiters(adId);

        disputeId = _nextDisputeId++;
        adDisputed[adId] = true;

        disputes[disputeId] = Dispute({
            adId:           adId,
            assigned:       assigned,
            votesForBuyer:  0,
            votesForSeller: 0,
            resolved:       false,
            deadline:       block.timestamp + VOTING_WINDOW
        });

        emit DisputeRegistered(disputeId, adId, assigned);
    }

    function vote(uint256 disputeId, bool releaseToBuyer) external onlyArbiter {
        require(disputeId < _nextDisputeId,         "Dispute not registered");
        Dispute storage d = disputes[disputeId];
        require(!d.resolved,                        "Dispute already resolved");
        require(block.timestamp <= d.deadline,      "Voting window closed");
        require(_isAssigned(d, msg.sender),         "Not assigned to this dispute");
        require(!_voted[disputeId][msg.sender],     "Already voted");

        _voted[disputeId][msg.sender] = true;

        if (releaseToBuyer) {
            d.votesForBuyer++;
        } else {
            d.votesForSeller++;
        }

        emit VoteCast(disputeId, msg.sender, releaseToBuyer);

        if (d.votesForBuyer >= 2) {
            _resolve(disputeId, true);
        } else if (d.votesForSeller >= 2) {
            _resolve(disputeId, false);
        }
    }

    function finaliseExpiredDispute(uint256 disputeId) external {
        require(disputeId < _nextDisputeId,    "Dispute not registered");
        Dispute storage d = disputes[disputeId];
        require(!d.resolved,                   "Already resolved");
        require(block.timestamp > d.deadline,  "Voting window still open");

        _resolve(disputeId, d.votesForBuyer > d.votesForSeller);
    }

    function getAssignedArbiters(uint256 disputeId) external view returns (address[3] memory) {
        return disputes[disputeId].assigned;
    }

    // replace with proper random selection like Chainlink VRF
    function _pickThreeArbiters(uint256) internal view returns (address[3] memory picked) {
        picked = [arbiters[0], arbiters[1], arbiters[2]];
    }

    function _isAssigned(Dispute storage d, address arbiter) internal view returns (bool) {
        return arbiter == d.assigned[0] || arbiter == d.assigned[1] || arbiter == d.assigned[2];
    }

    function _resolve(uint256 disputeId, bool releaseToBuyer) internal {
        Dispute storage d = disputes[disputeId];
        d.resolved = true;
        escrow.resolveDispute(d.adId, releaseToBuyer);
        emit DisputeResolved(disputeId, releaseToBuyer);
       
    }
}
