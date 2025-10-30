import { OnchainKitProvider } from "@coinbase/onchainkit";
import type { ReactNode } from "react";
import { base, gnosis, baseSepolia } from "viem/chains";
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
  const { testnet, cdpClientKey, appName, appLogo, paymentRequirements } = window.x402;

  const paymentReq = Array.isArray(paymentRequirements)
    ? paymentRequirements[0]
    : paymentRequirements;
  const paymentReqNetwork = paymentReq?.network as "gnosis" | "base";

  return (
    <OnchainKitProvider
      apiKey={cdpClientKey || undefined}
      chain={testnet ? baseSepolia : (SUPPORTED_NETWORKS[paymentReqNetwork]?.chain ?? base)}
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
