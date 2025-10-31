import { base, gnosis, optimism } from "viem/chains";

export const SUPPORTED_NETWORKS = {
  gnosis: {
    chain: gnosis,
  },
  base: {
    chain: base,
  },
  optimism: {
    chain: optimism,
  },
} as const;
