const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer, seller, buyer, arbiter] = await ethers.getSigners();

    const arbiterAddress = await arbiter.getAddress();
    const sellerAddress  = await seller.getAddress();
    const buyerAddress   = await buyer.getAddress();

    const usdcAddress = process.env.USDC_ADDRESS;
    const usdc = await ethers.getContractAt("IERC20", usdcAddress);

    const Escrow = await ethers.getContractFactory("Escrow");
    const proxy = await upgrades.deployProxy(
        Escrow, [usdcAddress],
        { initializer: "initialize", kind: "uups" }
    );

    await proxy.waitForDeployment();

    const proxyAddress      = await proxy.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("Proxy address:          ", proxyAddress);
    console.log("Implementation address: ", implementationAddress);

    const tokenAmount = ethers.parseUnits("100", 6); 
    const ethPrice    = ethers.parseEther("0.01");   

    console.log("Seller approves escrow to take usdc from their wallet.....");
    await usdc.connect(seller).approve(proxyAddress, tokenAmount);
    console.log("Seller approved escrow to spend 100 USDC");

    console.log("Seller posts ad.....");
    const postTx = await proxy.connect(seller).postAd(
        usdcAddress,
        tokenAmount,
        ethPrice,
        arbiterAddress
    );
    await postTx.wait();
    console.log("Post added...")

    console.log("Buyer locks the trade.....");
    await proxy.connect(buyer).lockTrade(0, { value: ethPrice });
    console.log("Buyer locked trade, sent 0.01 ETH");


    console.log("Seller confirms....");
    await proxy.connect(seller).confirmTransaction(0);
    console.log("Seller confirmed");

    console.log("Buyer confirms....");
    await proxy.connect(buyer).confirmTransaction(0);
    console.log("Buyer confirmed");

    console.log("Trade complete!!");

    const buyerUsdc  = await usdc.balanceOf(buyerAddress);
    console.log("Buyer USDC balance:  ", ethers.formatUnits(buyerUsdc, 6));
}

main().catch(console.error);
