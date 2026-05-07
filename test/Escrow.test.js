const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Escrow", function () {
    let escrow, usdc;
    let owner, seller, buyer, arbiterPool, other;

    const TOKEN_AMOUNT = ethers.parseUnits("100", 6);
    const ZAR_RATE     = 18n;
    const ZAR_AMOUNT   = 1800n;
    const SELLER_MINT  = ethers.parseUnits("10000", 6);

    beforeEach(async function () {
        [owner, seller, buyer, arbiterPool, other] = await ethers.getSigners();

        const USDCFactory = await ethers.getContractFactory("MockUSDC");
        usdc = await USDCFactory.deploy();
        await usdc.mint(seller.address, SELLER_MINT);

        const EscrowFactory = await ethers.getContractFactory("Escrow", owner);
        escrow = await upgrades.deployProxy(
            EscrowFactory,
            [await usdc.getAddress(), arbiterPool.address],
            { initializer: "initialize", kind: "uups" }
        );

        await usdc.connect(seller).approve(await escrow.getAddress(), SELLER_MINT);
    });

    describe("Deployment", function () {
        it("Should set the correct token and arbiterPool", async function () {
            expect(await escrow.token()).to.equal(await usdc.getAddress());
            expect(await escrow.arbiterPool()).to.equal(arbiterPool.address);
        });
    });

    describe("createAd", function () {
        it("Should let the seller create an ad", async function () {
            await escrow.connect(seller).createAd(ZAR_RATE, ZAR_AMOUNT, TOKEN_AMOUNT);

            const ad = await escrow.ads(0);
            expect(ad.seller).to.equal(seller.address);
            expect(ad.zarRate).to.equal(ZAR_RATE);
            expect(ad.zarAmount).to.equal(ZAR_AMOUNT);
            expect(ad.tokenAmount).to.equal(TOKEN_AMOUNT);
            expect(ad.status).to.equal(0n); // Active
        });

        it("Should reject zero tokenAmount", async function () {
            await expect(
                escrow.connect(seller).createAd(ZAR_RATE, ZAR_AMOUNT, 0)
            ).to.be.revertedWith("Token amount must be > 0");
        });

        it("Should reject zero zarRate", async function () {
            await expect(
                escrow.connect(seller).createAd(0, ZAR_AMOUNT, TOKEN_AMOUNT)
            ).to.be.revertedWith("Rate must be > 0");
        });

        it("Should reject zero zarAmount", async function () {
            await expect(
                escrow.connect(seller).createAd(ZAR_RATE, 0, TOKEN_AMOUNT)
            ).to.be.revertedWith("ZAR amount must be > 0");
        });
    });

    describe("initiateTrade", function () {
        beforeEach(async function () {
            await escrow.connect(seller).createAd(ZAR_RATE, ZAR_AMOUNT, TOKEN_AMOUNT);
        });

        it("Should let the buyer initiate a trade and pull tokens from seller into escrow", async function () {
            const sellerBalanceBefore = await usdc.balanceOf(seller.address);

            await escrow.connect(buyer).initiateTrade(0);

            const ad = await escrow.ads(0);
            expect(ad.buyer).to.equal(buyer.address);
            expect(ad.status).to.equal(1n); // InTrade
            expect(ad.paymentDeadline).to.be.gt(0n);

            expect(await usdc.balanceOf(seller.address)).to.equal(sellerBalanceBefore - TOKEN_AMOUNT);
            expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(TOKEN_AMOUNT);
        });

        it("Should reject if ad is not active", async function () {
            await escrow.connect(buyer).initiateTrade(0);
            await expect(
                escrow.connect(other).initiateTrade(0)
            ).to.be.revertedWith("Ad not active");
        });

        it("Should prevent the seller from buying their own ad", async function () {
            await expect(
                escrow.connect(seller).initiateTrade(0)
            ).to.be.revertedWith("Seller cannot buy own ad");
        });
    });

    describe("confirmPayment", function () {
        beforeEach(async function () {
            await escrow.connect(seller).createAd(ZAR_RATE, ZAR_AMOUNT, TOKEN_AMOUNT);
            await escrow.connect(buyer).initiateTrade(0);
        });

        it("Should let the buyer confirm payment", async function () {
            await escrow.connect(buyer).confirmPayment(0);
            expect((await escrow.ads(0)).status).to.equal(2n); // Paid
        });

        it("Should reject if caller is not the buyer", async function () {
            await expect(
                escrow.connect(other).confirmPayment(0)
            ).to.be.revertedWith("Only buyer");
        });

        it("Should reject if payment window has expired", async function () {
            await ethers.provider.send("evm_increaseTime", [301]);
            await ethers.provider.send("evm_mine");

            await expect(
                escrow.connect(buyer).confirmPayment(0)
            ).to.be.revertedWith("Payment window expired");
        });
    });

    describe("releaseFunds", function () {
        beforeEach(async function () {
            await escrow.connect(seller).createAd(ZAR_RATE, ZAR_AMOUNT, TOKEN_AMOUNT);
            await escrow.connect(buyer).initiateTrade(0);
            await escrow.connect(buyer).confirmPayment(0);
        });

        it("Should release tokens to the buyer", async function () {
            const buyerBalanceBefore = await usdc.balanceOf(buyer.address);

            await escrow.connect(seller).releaseFunds(0);

            expect((await escrow.ads(0)).status).to.equal(3n); // Completed
            expect(await usdc.balanceOf(buyer.address)).to.equal(buyerBalanceBefore + TOKEN_AMOUNT);
        });

        it("Should reject if caller is not the seller", async function () {
            await expect(
                escrow.connect(buyer).releaseFunds(0)
            ).to.be.revertedWith("Only seller");
        });

        it("Should reject if payment not confirmed", async function () {
            await escrow.connect(seller).createAd(ZAR_RATE, ZAR_AMOUNT, TOKEN_AMOUNT);
            await escrow.connect(buyer).initiateTrade(1);

            await expect(
                escrow.connect(seller).releaseFunds(1)
            ).to.be.revertedWith("Payment not confirmed yet");
        });
    });

    describe("cancelAd", function () {
        beforeEach(async function () {
            await escrow.connect(seller).createAd(ZAR_RATE, ZAR_AMOUNT, TOKEN_AMOUNT);
        });

        it("Should let the seller cancel an active ad", async function () {
            await escrow.connect(seller).cancelAd(0);
            expect((await escrow.ads(0)).status).to.equal(4n); // Cancelled
        });

        it("Should reject if caller is not the seller", async function () {
            await expect(
                escrow.connect(buyer).cancelAd(0)
            ).to.be.revertedWith("Only seller");
        });

        it("Should reject if ad is not active", async function () {
            await escrow.connect(buyer).initiateTrade(0);
            await expect(
                escrow.connect(seller).cancelAd(0)
            ).to.be.revertedWith("Can only cancel an active ad");
        });
    });

    describe("claimExpiredTrade", function () {
        beforeEach(async function () {
            await escrow.connect(seller).createAd(ZAR_RATE, ZAR_AMOUNT, TOKEN_AMOUNT);
            await escrow.connect(buyer).initiateTrade(0);
        });

        it("Should let the seller reclaim tokens after deadline and reset ad to Active", async function () {
            const sellerBalanceBefore = await usdc.balanceOf(seller.address);

            await ethers.provider.send("evm_increaseTime", [301]);
            await ethers.provider.send("evm_mine");

            await escrow.connect(seller).claimExpiredTrade(0);

            const ad = await escrow.ads(0);
            expect(ad.status).to.equal(0n); // Active
            expect(ad.buyer).to.equal(ethers.ZeroAddress);
            expect(ad.paymentDeadline).to.equal(0n);
            expect(await usdc.balanceOf(seller.address)).to.equal(sellerBalanceBefore + TOKEN_AMOUNT);
        });

        it("Should reject if payment window is still open", async function () {
            await expect(
                escrow.connect(seller).claimExpiredTrade(0)
            ).to.be.revertedWith("Payment window still open");
        });

        it("Should reject if caller is not the seller", async function () {
            await ethers.provider.send("evm_increaseTime", [301]);
            await ethers.provider.send("evm_mine");

            await expect(
                escrow.connect(other).claimExpiredTrade(0)
            ).to.be.revertedWith("Only seller");
        });

        it("Should reject if trade is not in progress", async function () {
            await escrow.connect(buyer).confirmPayment(0);
            await ethers.provider.send("evm_increaseTime", [301]);
            await ethers.provider.send("evm_mine");

            await expect(
                escrow.connect(seller).claimExpiredTrade(0)
            ).to.be.revertedWith("Trade not in progress");
        });
    });

    describe("openDispute", function () {
        beforeEach(async function () {
            await escrow.connect(seller).createAd(ZAR_RATE, ZAR_AMOUNT, TOKEN_AMOUNT);
            await escrow.connect(buyer).initiateTrade(0);
            await escrow.connect(buyer).confirmPayment(0);
        });

        it("Should let the buyer open a dispute", async function () {
            await escrow.connect(buyer).openDispute(0);
            expect((await escrow.ads(0)).status).to.equal(5n); // Disputed
        });

        it("Should let the seller open a dispute", async function () {
            await escrow.connect(seller).openDispute(0);
            expect((await escrow.ads(0)).status).to.equal(5n); // Disputed
        });

        it("Should reject if payment not confirmed first", async function () {
            await escrow.connect(seller).createAd(ZAR_RATE, ZAR_AMOUNT, TOKEN_AMOUNT);
            await escrow.connect(buyer).initiateTrade(1);

            await expect(
                escrow.connect(buyer).openDispute(1)
            ).to.be.revertedWith("Payment must be confirmed first");
        });

        it("Should reject if caller is neither buyer nor seller", async function () {
            await expect(
                escrow.connect(other).openDispute(0)
            ).to.be.revertedWith("Only buyer or seller");
        });
    });

    describe("resolveDispute", function () {
        beforeEach(async function () {
            await escrow.connect(seller).createAd(ZAR_RATE, ZAR_AMOUNT, TOKEN_AMOUNT);
            await escrow.connect(buyer).initiateTrade(0);
            await escrow.connect(buyer).confirmPayment(0);
            await escrow.connect(buyer).openDispute(0);
        });

        it("Should release tokens to buyer when arbiter rules in buyer's favour", async function () {
            const buyerBalanceBefore = await usdc.balanceOf(buyer.address);

            await escrow.connect(arbiterPool).resolveDispute(0, true);

            expect((await escrow.ads(0)).status).to.equal(3n); // Completed
            expect(await usdc.balanceOf(buyer.address)).to.equal(buyerBalanceBefore + TOKEN_AMOUNT);
        });

        it("Should return tokens to seller when arbiter rules in seller's favour", async function () {
            const sellerBalanceBefore = await usdc.balanceOf(seller.address);

            await escrow.connect(arbiterPool).resolveDispute(0, false);

            expect((await escrow.ads(0)).status).to.equal(3n); // Completed
            expect(await usdc.balanceOf(seller.address)).to.equal(sellerBalanceBefore + TOKEN_AMOUNT);
        });

        it("Should reject if caller is not the arbiter pool", async function () {
            await expect(
                escrow.connect(other).resolveDispute(0, true)
            ).to.be.revertedWith("Only arbiter pool");
        });

        it("Should reject if ad is not disputed", async function () {
            await escrow.connect(seller).createAd(ZAR_RATE, ZAR_AMOUNT, TOKEN_AMOUNT);
            await escrow.connect(buyer).initiateTrade(1);
            await escrow.connect(buyer).confirmPayment(1);

            await expect(
                escrow.connect(arbiterPool).resolveDispute(1, true)
            ).to.be.revertedWith("Not disputed");
        });
    });

    describe("setArbiterPool", function () {
        it("Should let the owner update the arbiter pool", async function () {
            await escrow.connect(owner).setArbiterPool(other.address);
            expect(await escrow.arbiterPool()).to.equal(other.address);
        });

        it("Should reject if caller is not the owner", async function () {
            await expect(
                escrow.connect(other).setArbiterPool(other.address)
            ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
        });
    });
});
