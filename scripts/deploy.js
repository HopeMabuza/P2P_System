const { ethers, upgrades } = require("hardhat");

async function main() {
    const usdcAddress    = process.env.USDC_ADDRESS;
    const arbiterAddress = process.env.ARBITER_ADDRESS;

    const Escrow = await ethers.getContractFactory("Escrow");
    const proxy  = await upgrades.deployProxy(
        Escrow, [usdcAddress, arbiterAddress],
        { initializer: "initialize", kind: "uups" }
    );

    await proxy.waitForDeployment();

    const proxyAddress = await proxy.getAddress();
    const implAddress  = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("Proxy address:          ", proxyAddress);
    console.log("Implementation address: ", implAddress);
    console.log("\nUpdate frontend/.env:");
    console.log("  VITE_CONTRACT_ADDRESS=" + proxyAddress);
}

main().catch(console.error);
