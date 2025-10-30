import { base, gnosis, optimism } from "viem/chains";

export const SUPPORTED_NETWORKS = {
  gnosis: {
    chain: gnosis,
    name: "Gnosis",
  },
  base: {
    chain: base,
    name: "Base",
  },
  optimism: {
    chain: optimism,
    name: "OP Mainnet",
  },
} as const;
