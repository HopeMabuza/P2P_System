const { ethers } = require("hardhat");

async function main() {
    const escrowAddress      = process.env.ESCROW_ADDRESS;
    const arbiterPoolAddress = process.env.ARBITERPOOL_ADDRESS;

    const [owner] = await ethers.getSigners();
    console.log("Owner:", owner.address);

    const escrow = await ethers.getContractAt("Escrow", escrowAddress);
    const tx = await escrow.setArbiterPool(arbiterPoolAddress);
    await tx.wait();

    console.log("setArbiterPool done:", tx.hash);
    console.log("ArbiterPool set to:", arbiterPoolAddress);
}

main().catch(console.error);
