import { FundButton, getOnrampBuyUrl } from "@coinbase/onchainkit/fund";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, formatUnits, http, publicActions } from "viem";
import { base, optimism, gnosis } from "viem/chains";
import { useAccount, useSwitchChain, useWalletClient, useConnect, useDisconnect, useConnectors } from "wagmi";

import type { PaymentRequirements } from "../../types/verify";
import { exact } from "../../schemes";
import { getUSDCBalance } from "../../shared/evm";
import type { Network } from "../../types/shared";

import { Spinner } from "./Spinner";
import { useOnrampSessionToken } from "./useOnrampSessionToken";
import { ensureValidAmount } from "./utils";
import { getNetworkDisplayName, isTestnetNetwork } from "./paywallUtils";

type EvmPaywallProps = {
  paymentRequirement: PaymentRequirements;
  onSuccessfulResponse: (response: Response) => Promise<void>;
};

/**
 * Paywall experience for EVM networks.
 *
 * @param props - Component props.
 * @param props.paymentRequirement - Payment requirement evaluated for the protected resource.
 * @param props.onSuccessfulResponse - Callback fired once the 402 fetch succeeds.
 * @returns JSX element.
 */
export function EvmPaywall({ paymentRequirement, onSuccessfulResponse }: EvmPaywallProps) {
  const { address, isConnected, chainId: connectedChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: wagmiWalletClient } = useWalletClient();
  const { connectAsync, status: connectStatus } = useConnect();
  const { disconnect } = useDisconnect();
  const connectors = useConnectors();
  const sortedConnectors = useMemo(() => {
    const isMetaMaskConnector = (connectorName: string): boolean =>
      connectorName.toLowerCase().includes("metamask");
    const isGenericInjectedConnector = (connectorName: string, connectorId: string): boolean => {
      const lower = connectorName.toLowerCase();
      return connectorId === "injected" || lower.includes("injected") || lower.includes("browser");
    };
    const getConnectorPriority = (name: string, id: string): number => {
      if (isMetaMaskConnector(name)) return 0;
      if (isGenericInjectedConnector(name, id)) return 2;
      return 1;
    };

    return [...connectors].sort((a, b) => {
      const priorityA = getConnectorPriority(a.name, a.id);
      const priorityB = getConnectorPriority(b.name, b.id);
      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.name.localeCompare(b.name);
    });
  }, [connectors]);
  const { sessionToken } = useOnrampSessionToken(address);

  const [status, setStatus] = useState<string>("");
  const [isCorrectChain, setIsCorrectChain] = useState<boolean | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [formattedUsdcBalance, setFormattedUsdcBalance] = useState<string>("");
  const [hideBalance, setHideBalance] = useState(true);

  const x402 = window.x402;
  const amount =
    typeof x402.amount === "number"
      ? x402.amount
      : Number(paymentRequirement.maxAmountRequired ?? 0) / 1_000_000;
  const network = paymentRequirement.network as Network;
  const paymentChain = (() => {
    switch (network) {
      case "base":
        return base;
      case "optimism":
        return optimism;
      case "gnosis":
        return gnosis;
      default:
        return gnosis;
    }
  })();
  const chainId = paymentChain.id;
  const chainName = getNetworkDisplayName(network);
  const testnet = isTestnetNetwork(network);
  const showOnramp = Boolean(!testnet && isConnected && x402.sessionTokenEndpoint);

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: paymentChain,
        transport: http(),
      }).extend(publicActions),
    [paymentChain],
  );

  const checkUSDCBalance = useCallback(async () => {
    if (!address) {
      return;
    }
    const balance = await getUSDCBalance(publicClient, address);
    const formattedBalance = formatUnits(balance, 6);
    setFormattedUsdcBalance(formattedBalance);
  }, [address, publicClient]);

  const handleSwitchChain = useCallback(async () => {
    if (isCorrectChain) {
      return;
    }

    try {
      setStatus("");
      await switchChainAsync({ chainId });
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to switch network");
    }
  }, [switchChainAsync, chainId, isCorrectChain]);

  useEffect(() => {
    if (!address) {
      return;
    }

    void handleSwitchChain();
    void checkUSDCBalance();
  }, [address, handleSwitchChain, checkUSDCBalance]);

  useEffect(() => {
    if (isConnected && chainId === connectedChainId) {
      setIsCorrectChain(true);
      setStatus("");
    } else if (isConnected && chainId !== connectedChainId) {
      setIsCorrectChain(false);
      setStatus(`On the wrong network. Please switch to ${chainName}.`);
    } else {
      setIsCorrectChain(null);
      setStatus("");
    }
  }, [chainId, connectedChainId, isConnected, chainName]);

  const onrampBuyUrl = useMemo(() => {
    if (!sessionToken) {
      return undefined;
    }
    return getOnrampBuyUrl({
      presetFiatAmount: 2,
      fiatCurrency: "USD",
      sessionToken,
    });
  }, [sessionToken]);

  const handlePayment = useCallback(async () => {
    if (!address || !x402) {
      return;
    }

    await handleSwitchChain();

    if (!wagmiWalletClient) {
      setStatus("Wallet client not available. Please reconnect your wallet.");
      return;
    }
    const walletClient = wagmiWalletClient.extend(publicActions);

    setIsPaying(true);

    try {
      setStatus("Checking USDC balance...");
      const balance = await getUSDCBalance(publicClient, address);

      if (balance === 0n) {
        throw new Error(`Insufficient balance. Make sure you have USDC on ${chainName}`);
      }

      setStatus("Creating payment signature...");
      const validPaymentRequirements = ensureValidAmount(paymentRequirement);
      const initialPayment = await exact.evm.createPayment(
        walletClient,
        1,
        validPaymentRequirements,
      );

      const paymentHeader: string = exact.evm.encodePayment(initialPayment);

      setStatus("Requesting content with payment...");
      const response = await fetch(x402.currentUrl, {
        headers: {
          "X-PAYMENT": paymentHeader,
          "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
        },
      });

      if (response.ok) {
        await onSuccessfulResponse(response);
      } else if (response.status === 402) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData && typeof errorData.x402Version === "number") {
          const retryPayment = await exact.evm.createPayment(
            walletClient,
            errorData.x402Version,
            validPaymentRequirements,
          );

          retryPayment.x402Version = errorData.x402Version;
          const retryHeader = exact.evm.encodePayment(retryPayment);
          const retryResponse = await fetch(x402.currentUrl, {
            headers: {
              "X-PAYMENT": retryHeader,
              "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
            },
          });
          if (retryResponse.ok) {
            await onSuccessfulResponse(retryResponse);
            return;
          } else {
            throw new Error(`Payment retry failed: ${retryResponse.statusText}`);
          }
        } else {
          throw new Error(`Payment failed: ${response.statusText}`);
        }
      } else {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setIsPaying(false);
    }
  }, [
    address,
    x402,
    paymentRequirement,
    handleSwitchChain,
    wagmiWalletClient,
    publicClient,
    chainName,
    onSuccessfulResponse,
  ]);

  if (!x402) {
    return null;
  }

  return (
    <div className="container gap-8">
      <div className="header">
        <h1 className="title">Payment Required</h1>
        <p>
          {paymentRequirement.description && `${paymentRequirement.description}.`} To access this
          content, please pay ${amount} {chainName} USDC.
        </p>
        {testnet && (
          <p className="instructions">
            Need {chainName} USDC?{" "}
            <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">
              Get some <u>here</u>.
            </a>
          </p>
        )}
      </div>

      <div className="content w-full">
        {!isConnected ? (
          <div className="payment-details">
            <div className="payment-row">
              <span className="payment-label">Select wallet:</span>
              <span className="payment-value">
                <select
                  id="connector-select"
                  className="w-full py-2 border rounded px-3"
                  onChange={e => {
                    (window as any)._x402_selected_connector_id = e.target.value;
                  }}
                  defaultValue={sortedConnectors[0]?.uid || ""}
                  aria-label="Select wallet connector"
                >
                  {sortedConnectors.map(connector => (
                    <option key={connector.uid} value={connector.uid}>
                      {connector.name}
                    </option>
                  ))}
                </select>
              </span>
            </div>
            <div className="cta-container">
              <button
                className="button button-primary"
                onClick={async () => {
                  const id = (window as any)._x402_selected_connector_id || sortedConnectors[0]?.uid;
                  const connector = sortedConnectors.find(connector => connector.uid === id) || sortedConnectors[0];
                  if (connector) {
                    await connectAsync({ connector });
                  }
                }}
                disabled={connectStatus === "pending"}
              >
                {connectStatus === "pending" ? "Connecting..." : "Connect wallet"}
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full flex justify-between items-center py-3">
            <div className="opacity-80 text-sm">
              {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ""}
            </div>
            <button className="button" style={{width: 'max-content'}} onClick={() => disconnect()}>Disconnect</button>
          </div>
        )}
        {isConnected && (
          <div id="payment-section">
            <div className="payment-details">
              <div className="payment-row">
                <span className="payment-label">Wallet:</span>
                <span className="payment-value">
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Loading..."}
                </span>
              </div>
              <div className="payment-row">
                <span className="payment-label">Available balance:</span>
                <span className="payment-value">
                  <button className="balance-button" onClick={() => setHideBalance(prev => !prev)}>
                    {formattedUsdcBalance && !hideBalance
                      ? `$${formattedUsdcBalance} USDC`
                      : "••••• USDC"}
                  </button>
                </span>
              </div>
              <div className="payment-row">
                <span className="payment-label">Amount:</span>
                <span className="payment-value">${amount} USDC</span>
              </div>
              <div className="payment-row">
                <span className="payment-label">Network:</span>
                <span className="payment-value">{chainName}</span>
              </div>
            </div>

            {isCorrectChain ? (
              <div className="cta-container">
                {showOnramp && (
                  <FundButton
                    fundingUrl={onrampBuyUrl}
                    text="Get more USDC"
                    hideIcon
                    className="button button-positive"
                  />
                )}
                <button
                  className="button button-primary"
                  onClick={handlePayment}
                  disabled={isPaying}
                >
                  {isPaying ? <Spinner /> : "Pay now"}
                </button>
              </div>
            ) : (
              <button className="button button-primary" onClick={handleSwitchChain}>
                Switch to {chainName}
              </button>
            )}
          </div>
        )}
        {status && <div className="status">{status}</div>}
      </div>
    </div>
  );
}
