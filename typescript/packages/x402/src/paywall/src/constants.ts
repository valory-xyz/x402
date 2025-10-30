import { base, gnosis } from "viem/chains";

export const SUPPORTED_NETWORKS = {
  gnosis: {
    chain: gnosis,
    name: "Gnosis",
  },
  base: {
    chain: base,
    name: "Base",
  },
} as const;
