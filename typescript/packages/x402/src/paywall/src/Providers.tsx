import { OnchainKitProvider } from "@coinbase/onchainkit";
import type { ReactNode } from "react";

import { choosePaymentRequirement, isEvmNetwork } from "./paywallUtils";
import "./window.d.ts";
import { SUPPORTED_NETWORKS } from "./constants.js";

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
  const { testnet = true, cdpClientKey, appName, appLogo, paymentRequirements } = window.x402;
  const selectedRequirement = choosePaymentRequirement(paymentRequirements, testnet);
  const paymentReqNetwork = selectedRequirement.network as keyof typeof SUPPORTED_NETWORKS;

  if (!isEvmNetwork(paymentReqNetwork)) {
    return <>{children}</>;
  }

  const chain = SUPPORTED_NETWORKS[paymentReqNetwork].chain;

  return (
    <OnchainKitProvider
      apiKey={cdpClientKey || undefined}
      chain={chain}
      config={{
        appearance: {
          mode: "light",
          theme: "base",
          name: appName || undefined,
          logo: appLogo || undefined,
        },
        wallet: {
          display: "modal",
          supportedWallets: {
            rabby: true,
            trust: true,
            frame: true,
          },
        },
      }}
    >
      {children}
    </OnchainKitProvider>
  );
}
