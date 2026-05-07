const { ethers, upgrades } = require("hardhat");

const MINT_AMOUNT = ethers.parseUnits("10000", 6); // 10,000 USDC (6 decimals)

async function main() {
    const [deployer] = await ethers.getSigners();
    const arbiterPoolAddress = process.env.ARBITER_ADDRESS;

    console.log("Deployer / seller:", deployer.address);

    // 1. Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();
    const usdcAddress = await mockUSDC.getAddress();
    console.log("MockUSDC deployed:      ", usdcAddress);

    // 2. Mint 10,000 USDC to the seller (deployer)
    await mockUSDC.mint(deployer.address, MINT_AMOUNT);
    console.log("Minted 10,000 USDC to:  ", deployer.address);

    // 3. Deploy Escrow proxy
    const Escrow = await ethers.getContractFactory("Escrow");
    const proxy  = await upgrades.deployProxy(
        Escrow, [usdcAddress, arbiterPoolAddress],
        { initializer: "initialize", kind: "uups" }
    );
    await proxy.waitForDeployment();

    const proxyAddress = await proxy.getAddress();
    const implAddress  = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("Proxy address:          ", proxyAddress);
    console.log("Implementation address: ", implAddress);
    console.log("\nUpdate frontend/.env:");
    console.log("  VITE_CONTRACT_ADDRESS=" + proxyAddress);
    console.log("  VITE_USDC_ADDRESS=" + usdcAddress);
}

main().catch(console.error);
