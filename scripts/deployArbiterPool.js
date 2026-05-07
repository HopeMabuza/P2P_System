const { ethers } = require("hardhat");

async function main() {
    const signers = await ethers.getSigners();
    const escrowAddress = process.env.ESCROW_ADDRESS;

    // Fall back to local signer addresses if env vars are not set
    const arbiterAddresses = [
        process.env.ARBITER_1 ?? signers[1].address,
        process.env.ARBITER_2 ?? signers[2].address,
        process.env.ARBITER_3 ?? signers[3].address,
    ];

    console.log("Deployer:        ", signers[0].address);
    console.log("Escrow address:  ", escrowAddress);

    // 1. Deploy ArbiterPool
    const ArbiterPool = await ethers.getContractFactory("ArbiterPool");
    const pool = await ArbiterPool.deploy(escrowAddress);
    await pool.waitForDeployment();
    const poolAddress = await pool.getAddress();
    console.log("ArbiterPool deployed:", poolAddress);

    // 2. Register the 3 arbiters
    for (const addr of arbiterAddresses) {
        const tx = await pool.addArbiter(addr);
        await tx.wait();
        console.log("Arbiter added:   ", addr);
    }

    console.log("\nArbiter pool size:", (await pool.arbiterCount()).toString());
    console.log("\nNext step — point the Escrow at this pool:");
    console.log("  Call escrow.setArbiterPool(\"" + poolAddress + "\")");
    console.log("\nUpdate frontend/.env:");
    console.log("  VITE_ARBITER_POOL_ADDRESS=" + poolAddress);
}

main().catch(console.error);
