declare module 'viem' {
  export type Hex = `0x${string}` | string;
  export type PublicClient = any;
  export type WalletClient = any;

  export const createPublicClient: any;
  export const createWalletClient: any;
  export const http: any;
  export const fallback: any;
  export const parseUnits: any;
  export const formatUnits: any;
  export const defineChain: any;
  export const parseAbiItem: any;
}

declare module 'viem/chains' {
  export const arbitrum: any;
  export const base: any;
  export const celo: any;
  export const optimism: any;
  export const polygon: any;
}

declare module 'viem/accounts' {
  export const privateKeyToAccount: any;
  export const generatePrivateKey: any;
}
