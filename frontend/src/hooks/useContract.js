import { useState, useEffect } from "react";
import { ethers } from "ethers";
import EscrowABI from "../abi/MyContract.json";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

export function useContract() {
  const [provider, setProvider]       = useState(null);
  const [signer, setSigner]           = useState(null);
  const [contract, setContract]       = useState(null);
  const [account, setAccount]         = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError]             = useState(null);

  // On mount: read-only contract so listings show before any wallet connects
  useEffect(() => {
    const ro = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);
    setProvider(ro);
    setContract(new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, ro));
  }, []);

  // When MetaMask switches accounts, rebuild signer + contract for the new account
  useEffect(() => {
    if (!window.ethereum) return;

    async function handleAccountChange(accounts) {
      if (accounts.length === 0) {
        _resetToReadOnly();
      } else {
        const web3Provider = new ethers.BrowserProvider(window.ethereum);
        const web3Signer   = await web3Provider.getSigner();
        setProvider(web3Provider);
        setSigner(web3Signer);
        setContract(new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, web3Signer));
        setAccount(accounts[0]);
        setIsConnected(true);
      }
    }

    window.ethereum.on("accountsChanged", handleAccountChange);
    return () => window.ethereum.removeListener("accountsChanged", handleAccountChange);
  }, []);

  async function connectWallet() {
    try {
      if (!window.ethereum) throw new Error("MetaMask is not installed.");

      const accounts     = await window.ethereum.request({ method: "eth_requestAccounts" });
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      const web3Signer   = await web3Provider.getSigner();

      setProvider(web3Provider);
      setSigner(web3Signer);
      setContract(new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, web3Signer));
      setAccount(accounts[0]);
      setIsConnected(true);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function disconnectWallet() {
    // Revoke MetaMask's permission so the NEXT connect forces the account picker
    // to open — without this MetaMask silently returns the last account and the
    // next user (e.g. the buyer) ends up connecting as the seller.
    try {
      await window.ethereum.request({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // wallet_revokePermissions is not available in all wallets — safe to ignore
    }

    _resetToReadOnly();
  }

  function _resetToReadOnly() {
    const ro = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);
    setProvider(ro);
    setSigner(null);
    setContract(new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, ro));
    setAccount(null);
    setIsConnected(false);
    setError(null);
  }

  return { provider, signer, contract, account, isConnected, error, connectWallet, disconnectWallet };
}
