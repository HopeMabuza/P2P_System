const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("ArbiterPool", function () {
    let arbiterPool, escrow, usdc;
    let owner, arbiter1, arbiter2, arbiter3, arbiter4, seller, buyer, other;

    const TOKEN_AMOUNT  = ethers.parseUnits("100", 6);
    const ZAR_RATE      = 18n;
    const ZAR_AMOUNT    = 1800n;
    const SELLER_MINT   = ethers.parseUnits("10000", 6);
    const VOTING_WINDOW = 5 * 60;

    beforeEach(async function () {
        [owner, arbiter1, arbiter2, arbiter3, arbiter4, seller, buyer, other] = await ethers.getSigners();

        const USDCFactory = await ethers.getContractFactory("MockUSDC");
        usdc = await USDCFactory.deploy();
        await usdc.mint(seller.address, SELLER_MINT);

        const EscrowFactory = await ethers.getContractFactory("Escrow", owner);
        escrow = await upgrades.deployProxy(
            EscrowFactory,
            [await usdc.getAddress(), ethers.ZeroAddress],
            { initializer: "initialize", kind: "uups" }
        );

        const ArbiterPoolFactory = await ethers.getContractFactory("ArbiterPool");
        arbiterPool = await ArbiterPoolFactory.deploy(await escrow.getAddress());

        await escrow.connect(owner).setArbiterPool(await arbiterPool.getAddress());
        await usdc.connect(seller).approve(await escrow.getAddress(), SELLER_MINT);
    });

    async function addThreeArbiters() {
        await arbiterPool.connect(owner).addArbiter(arbiter1.address);
        await arbiterPool.connect(owner).addArbiter(arbiter2.address);
        await arbiterPool.connect(owner).addArbiter(arbiter3.address);
    }

    async function timeTravel() {
        await ethers.provider.send("evm_increaseTime", [VOTING_WINDOW + 1]);
        await ethers.provider.send("evm_mine");
    }

    async function setupDisputedAd() {
        await addThreeArbiters();
        await escrow.connect(seller).createAd(ZAR_RATE, ZAR_AMOUNT, TOKEN_AMOUNT);
        await escrow.connect(buyer).initiateTrade(0);
        await escrow.connect(buyer).confirmPayment(0);
        await escrow.connect(buyer).openDispute(0);
        await arbiterPool.connect(other).registerDispute(0);
    }

    describe("addArbiter", function () {
        it("Should let the owner add an arbiter", async function () {
            await arbiterPool.connect(owner).addArbiter(arbiter1.address);
            expect(await arbiterPool.isArbiter(arbiter1.address)).to.be.true;
            expect(await arbiterPool.arbiterCount()).to.equal(1n);
        });

        it("Should emit ArbiterAdded", async function () {
            await expect(arbiterPool.connect(owner).addArbiter(arbiter1.address))
                .to.emit(arbiterPool, "ArbiterAdded")
                .withArgs(arbiter1.address);
        });

        it("Should reject the zero address", async function () {
            await expect(
                arbiterPool.connect(owner).addArbiter(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");
        });

        it("Should reject an existing arbiter", async function () {
            await arbiterPool.connect(owner).addArbiter(arbiter1.address);
            await expect(
                arbiterPool.connect(owner).addArbiter(arbiter1.address)
            ).to.be.revertedWith("Already an arbiter");
        });

        it("Should reject if caller is not owner", async function () {
            await expect(
                arbiterPool.connect(other).addArbiter(arbiter1.address)
            ).to.be.revertedWith("Only owner");
        });
    });

    describe("removeArbiter", function () {
        beforeEach(async function () {
            await addThreeArbiters();
        });

        it("Should let the owner remove an arbiter", async function () {
            await arbiterPool.connect(owner).removeArbiter(arbiter1.address);
            expect(await arbiterPool.isArbiter(arbiter1.address)).to.be.false;
            expect(await arbiterPool.arbiterCount()).to.equal(2n);
        });

        it("Should emit ArbiterRemoved", async function () {
            await expect(arbiterPool.connect(owner).removeArbiter(arbiter1.address))
                .to.emit(arbiterPool, "ArbiterRemoved")
                .withArgs(arbiter1.address);
        });

        it("Should reject a non-arbiter address", async function () {
            await expect(
                arbiterPool.connect(owner).removeArbiter(other.address)
            ).to.be.revertedWith("Not an arbiter");
        });

        it("Should reject if caller is not owner", async function () {
            await expect(
                arbiterPool.connect(other).removeArbiter(arbiter1.address)
            ).to.be.revertedWith("Only owner");
        });
    });

    describe("registerDispute", function () {
        it("Should register a dispute and assign 3 arbiters", async function () {
            await addThreeArbiters();
            await arbiterPool.connect(other).registerDispute(0);

            expect(await arbiterPool.adDisputed(0)).to.be.true;
            expect(await arbiterPool.getAssignedArbitures(0)).to.deep.equal(
                [arbiter1.address, arbiter2.address, arbiter3.address]
            );
        });

        it("Should emit DisputeRegistered", async function () {
            await addThreeArbiters();
            await expect(arbiterPool.connect(other).registerDispute(0))
                .to.emit(arbiterPool, "DisputeRegistered")
                .withArgs(0, 0, [arbiter1.address, arbiter2.address, arbiter3.address]);
        });

        it("Should increment disputeId for each new dispute", async function () {
            await addThreeArbiters();
            await arbiterPool.connect(other).registerDispute(0);
            await arbiterPool.connect(other).registerDispute(1);

            expect((await arbiterPool.disputes(0)).adId).to.equal(0n);
            expect((await arbiterPool.disputes(1)).adId).to.equal(1n);
        });

        it("Should reject if fewer than 3 arbiters in the pool", async function () {
            await arbiterPool.connect(owner).addArbiter(arbiter1.address);
            await arbiterPool.connect(owner).addArbiter(arbiter2.address);
            await expect(
                arbiterPool.connect(other).registerDispute(0)
            ).to.be.revertedWith("Need at least 3 arbiters in the pool");
        });

        it("Should reject a duplicate dispute for the same adId", async function () {
            await addThreeArbiters();
            await arbiterPool.connect(other).registerDispute(0);
            await expect(
                arbiterPool.connect(other).registerDispute(0)
            ).to.be.revertedWith("Dispute already registered for this ad");
        });
    });

    describe("vote", function () {
        beforeEach(async function () {
            await setupDisputedAd();
        });

        it("Should record a vote for the buyer", async function () {
            await arbiterPool.connect(arbiter1).vote(0, true);
            const d = await arbiterPool.disputes(0);
            expect(d.votesForBuyer).to.equal(1n);
            expect(d.votesForSeller).to.equal(0n);
        });

        it("Should record a vote for the seller", async function () {
            await arbiterPool.connect(arbiter1).vote(0, false);
            expect((await arbiterPool.disputes(0)).votesForSeller).to.equal(1n);
        });

        it("Should emit VoteCast", async function () {
            await expect(arbiterPool.connect(arbiter1).vote(0, true))
                .to.emit(arbiterPool, "VoteCast")
                .withArgs(0, arbiter1.address, true);
        });

        it("Should reject a non-approved arbiter", async function () {
            await expect(
                arbiterPool.connect(other).vote(0, true)
            ).to.be.revertedWith("Not an approved arbiter");
        });

        it("Should reject vote on an unregistered dispute", async function () {
            await expect(
                arbiterPool.connect(arbiter1).vote(99, true)
            ).to.be.revertedWith("Dispute not registered");
        });

        it("Should reject an arbiter not assigned to this dispute", async function () {
            await arbiterPool.connect(owner).addArbiter(arbiter4.address);
            await expect(
                arbiterPool.connect(arbiter4).vote(0, true)
            ).to.be.revertedWith("Not assigned to this dispute");
        });

        it("Should reject a double vote", async function () {
            await arbiterPool.connect(arbiter1).vote(0, true);
            await expect(
                arbiterPool.connect(arbiter1).vote(0, true)
            ).to.be.revertedWith("Already voted");
        });

        it("Should reject if voting window has closed", async function () {
            await timeTravel();
            await expect(
                arbiterPool.connect(arbiter1).vote(0, true)
            ).to.be.revertedWith("Voting window closed");
        });
    });

    describe("auto-resolution on 2-of-3 majority", function () {
        beforeEach(async function () {
            await setupDisputedAd();
        });

        it("Should resolve in buyer's favour on 2 buyer votes", async function () {
            await arbiterPool.connect(arbiter1).vote(0, true);
            await arbiterPool.connect(arbiter2).vote(0, true);

            expect((await arbiterPool.disputes(0)).resolved).to.be.true;
            expect((await escrow.ads(0)).status).to.equal(3n);
            expect(await usdc.balanceOf(buyer.address)).to.equal(TOKEN_AMOUNT);
        });

        it("Should resolve in seller's favour on 2 seller votes", async function () {
            const sellerBefore = await usdc.balanceOf(seller.address);
            await arbiterPool.connect(arbiter1).vote(0, false);
            await arbiterPool.connect(arbiter2).vote(0, false);

            expect((await arbiterPool.disputes(0)).resolved).to.be.true;
            expect(await usdc.balanceOf(seller.address)).to.equal(sellerBefore + TOKEN_AMOUNT);
        });

        it("Should emit DisputeResolved on majority", async function () {
            await arbiterPool.connect(arbiter1).vote(0, true);
            await expect(arbiterPool.connect(arbiter2).vote(0, true))
                .to.emit(arbiterPool, "DisputeResolved")
                .withArgs(0, true);
        });

        it("Should not resolve after only one vote", async function () {
            await arbiterPool.connect(arbiter1).vote(0, true);
            expect((await arbiterPool.disputes(0)).resolved).to.be.false;
        });

        it("Should reject votes after resolution", async function () {
            await arbiterPool.connect(arbiter1).vote(0, true);
            await arbiterPool.connect(arbiter2).vote(0, true);
            await expect(
                arbiterPool.connect(arbiter3).vote(0, true)
            ).to.be.revertedWith("Dispute already resolved");
        });
    });

    describe("finaliseExpiredDispute", function () {
        beforeEach(async function () {
            await setupDisputedAd();
        });

        it("Should finalise in buyer's favour when buyer leads after deadline", async function () {
            await arbiterPool.connect(arbiter1).vote(0, true);
            await timeTravel();
            await arbiterPool.connect(other).finaliseExpiredDispute(0);
            expect(await usdc.balanceOf(buyer.address)).to.equal(TOKEN_AMOUNT);
        });

        it("Should finalise in seller's favour when seller leads after deadline", async function () {
            const sellerBefore = await usdc.balanceOf(seller.address);
            await arbiterPool.connect(arbiter1).vote(0, false);
            await timeTravel();
            await arbiterPool.connect(other).finaliseExpiredDispute(0);
            expect(await usdc.balanceOf(seller.address)).to.equal(sellerBefore + TOKEN_AMOUNT);
        });

        it("Should default to seller on a tie", async function () {
            const sellerBefore = await usdc.balanceOf(seller.address);
            await timeTravel();
            await arbiterPool.connect(other).finaliseExpiredDispute(0);
            expect(await usdc.balanceOf(seller.address)).to.equal(sellerBefore + TOKEN_AMOUNT);
        });

        it("Should reject if voting window is still open", async function () {
            await expect(
                arbiterPool.connect(other).finaliseExpiredDispute(0)
            ).to.be.revertedWith("Voting window still open");
        });

        it("Should reject if already resolved", async function () {
            await arbiterPool.connect(arbiter1).vote(0, true);
            await arbiterPool.connect(arbiter2).vote(0, true);
            await timeTravel();
            await expect(
                arbiterPool.connect(other).finaliseExpiredDispute(0)
            ).to.be.revertedWith("Already resolved");
        });

        it("Should reject an unregistered dispute id", async function () {
            await expect(
                arbiterPool.connect(other).finaliseExpiredDispute(99)
            ).to.be.revertedWith("Dispute not registered");
        });
    });
});
