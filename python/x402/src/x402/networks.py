from typing import Literal


SupportedNetworks = Literal["base", "base-sepolia", "avalanche-fuji", "avalanche", "optimism", "gnosis", "polygon"]

EVM_NETWORK_TO_CHAIN_ID = {
    "base-sepolia": 84532,
    "base": 8453,
    "avalanche-fuji": 43113,
    "avalanche": 43114,
    "optimism": 10,
    "gnosis": 100,
    "polygon": 137,
}
