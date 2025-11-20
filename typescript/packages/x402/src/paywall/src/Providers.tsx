import type { ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected, coinbaseWallet } from "@wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { base, optimism, gnosis } from "viem/chains";

import { choosePaymentRequirement, isEvmNetwork } from "./paywallUtils";
import "./window.d.ts";

type ProvidersProps = {
  children: ReactNode;
};

/**
 * Providers component for the paywall
 *
 * @param props - The component props
 * @param props.children - The children of the Providers component
 * @returns The Providers component
 */
export function Providers({ children }: ProvidersProps) {
  const { testnet = true, paymentRequirements, appName } = window.x402;
  const selectedRequirement = choosePaymentRequirement(paymentRequirements, testnet);

  if (!isEvmNetwork(selectedRequirement.network)) {
    return <>{children}</>;
  }

  if (selectedRequirement.network !== "base" && selectedRequirement.network !== "optimism" && selectedRequirement.network !== "gnosis") {
    return <>{children}</>;
  }

  const connectorList = [injected(), coinbaseWallet({ appName: appName || "x402 Paywall" })];

  const config = createConfig({
    chains: [base, optimism, gnosis] as const,
    connectors: connectorList,
    transports: {
      [base.id]: http(),
      [optimism.id]: http(),
      [gnosis.id]: http(),
    },
    ssr: false,
  });

  const queryClient = new QueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>{children}</WagmiProvider>
    </QueryClientProvider>
  );
}
