const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Escrow", function () {
    let escrow, usdc;
    let owner, seller, buyer, arbiter, other;

    const TOKEN_AMOUNT = ethers.parseUnits("100", 6); // 100 USDC
    const ETH_PRICE    = ethers.parseEther("0.1");    // 0.1 ETH

    beforeEach(async function () {
        [owner, seller, buyer, arbiter, other] = await ethers.getSigners();

        // Deploy MockUSDC and give seller some tokens
        const USDCFactory = await ethers.getContractFactory("MockUSDC");
        usdc = await USDCFactory.deploy();
        await usdc.mint(seller.address, ethers.parseUnits("1000", 6));

        // Deploy Escrow proxy with allowed token and global arbiter
        const EscrowFactory = await ethers.getContractFactory("Escrow", owner);
        escrow = await upgrades.deployProxy(
            EscrowFactory,
            [await usdc.getAddress(), arbiter.address],
            { initializer: "initialize", kind: "uups" }
        );

        // Seller approves escrow to pull USDC
        await usdc.connect(seller).approve(await escrow.getAddress(), TOKEN_AMOUNT);
    });

    describe("Deployment", function () {
        it("Should set the correct allowedToken and arbiter", async function () {
            expect(await escrow.allowedToken()).to.equal(await usdc.getAddress());
            expect(await escrow.arbiter()).to.equal(arbiter.address);
        });
    });

    describe("Post Ad", function () {
        it("Should let the seller post an ad and pull USDC into escrow", async function () {
            await escrow.connect(seller).postAd(await usdc.getAddress(), TOKEN_AMOUNT, ETH_PRICE);

            const ad = await escrow.listings(0);
            expect(ad.seller).to.equal(seller.address);
            expect(ad.tokenAmount).to.equal(TOKEN_AMOUNT);
            expect(ad.ethPrice).to.equal(ETH_PRICE);
            expect(ad.status).to.equal(0n); // Active

            expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(TOKEN_AMOUNT);
        });

        it("Should reject a token not on the whitelist", async function () {
            const OtherFactory = await ethers.getContractFactory("MockUSDC");
            const otherToken   = await OtherFactory.deploy();
            await expect(
                escrow.connect(seller).postAd(await otherToken.getAddress(), TOKEN_AMOUNT, ETH_PRICE)
            ).to.be.revertedWith("Token not allowed");
        });

        it("Should prevent the arbiter from posting an ad", async function () {
            await usdc.mint(arbiter.address, TOKEN_AMOUNT);
            await usdc.connect(arbiter).approve(await escrow.getAddress(), TOKEN_AMOUNT);
            await expect(
                escrow.connect(arbiter).postAd(await usdc.getAddress(), TOKEN_AMOUNT, ETH_PRICE)
            ).to.be.revertedWith("Arbiter cannot be the seller");
        });
    });

    describe("Lock Trade", function () {
        beforeEach(async function () {
            await escrow.connect(seller).postAd(await usdc.getAddress(), TOKEN_AMOUNT, ETH_PRICE);
        });

        it("Should let the buyer lock the trade by sending exact ETH", async function () {
            await escrow.connect(buyer).lockTrade(0, { value: ETH_PRICE });

            const ad = await escrow.listings(0);
            expect(ad.buyer).to.equal(buyer.address);
            expect(ad.status).to.equal(1n); // Locked
        });

        it("Should reject the wrong ETH amount", async function () {
            await expect(
                escrow.connect(buyer).lockTrade(0, { value: ethers.parseEther("0.05") })
            ).to.be.revertedWith("Send exact ETH price to lock the trade");
        });

        it("Should prevent the seller from being the buyer", async function () {
            await expect(
                escrow.connect(seller).lockTrade(0, { value: ETH_PRICE })
            ).to.be.revertedWith("Seller cannot be the buyer");
        });

        it("Should prevent the arbiter from being the buyer", async function () {
            await expect(
                escrow.connect(arbiter).lockTrade(0, { value: ETH_PRICE })
            ).to.be.revertedWith("Arbiter cannot be the buyer");
        });
    });

    describe("Confirm Transaction", function () {
        beforeEach(async function () {
            await escrow.connect(seller).postAd(await usdc.getAddress(), TOKEN_AMOUNT, ETH_PRICE);
            await escrow.connect(buyer).lockTrade(0, { value: ETH_PRICE });
        });

        it("Should move to Confirming when one party confirms", async function () {
            await escrow.connect(seller).confirmTransaction(0);
            expect((await escrow.listings(0)).status).to.equal(2n); // Confirming
        });

        it("Should release funds to both parties when both confirm", async function () {
            const buyerUsdcBefore = await usdc.balanceOf(buyer.address);
            const sellerEthBefore = await ethers.provider.getBalance(seller.address);

            await escrow.connect(seller).confirmTransaction(0);
            await escrow.connect(buyer).confirmTransaction(0);

            expect((await escrow.listings(0)).status).to.equal(3n); // Completed
            expect(await usdc.balanceOf(buyer.address)).to.equal(buyerUsdcBefore + TOKEN_AMOUNT);
            expect(await ethers.provider.getBalance(seller.address)).to.be.gt(sellerEthBefore);
        });
    });

    describe("Dispute Resolution", function () {
        beforeEach(async function () {
            await escrow.connect(seller).postAd(await usdc.getAddress(), TOKEN_AMOUNT, ETH_PRICE);
            await escrow.connect(buyer).lockTrade(0, { value: ETH_PRICE });
        });

        it("Should allow either party to open a dispute", async function () {
            await escrow.connect(buyer).openDispute(0);
            expect((await escrow.listings(0)).status).to.equal(4n); // Disputed
        });

        it("Should complete the trade when arbiter rules in seller's favour", async function () {
            await escrow.connect(buyer).openDispute(0);
            const buyerUsdcBefore = await usdc.balanceOf(buyer.address);

            await escrow.connect(arbiter).resolveDispute(0, false); // seller wins

            expect((await escrow.listings(0)).status).to.equal(3n); // Completed
            expect(await usdc.balanceOf(buyer.address)).to.equal(buyerUsdcBefore + TOKEN_AMOUNT);
        });

        it("Should refund both parties when arbiter rules in buyer's favour", async function () {
            await escrow.connect(buyer).openDispute(0);
            const sellerUsdcBefore = await usdc.balanceOf(seller.address);

            await escrow.connect(arbiter).resolveDispute(0, true); // buyer wins

            expect((await escrow.listings(0)).status).to.equal(5n); // Refunded
            expect(await usdc.balanceOf(seller.address)).to.equal(sellerUsdcBefore + TOKEN_AMOUNT);
        });

        it("Should prevent a non-arbiter from resolving", async function () {
            await escrow.connect(buyer).openDispute(0);
            await expect(
                escrow.connect(other).resolveDispute(0, true)
            ).to.be.revertedWith("Only the arbiter");
        });
    });
});
