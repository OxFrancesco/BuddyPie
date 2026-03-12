import * as React from 'react'
import { createWalletClient, custom, publicActions } from 'viem'
import { wrapFetchWithPayment, x402Client } from '@x402/fetch'
import { ExactEvmScheme } from '@x402/evm/exact/client'
import { baseSepolia } from 'viem/chains'
import {
  BASE_SEPOLIA_CAIP2,
  BASE_SEPOLIA_CHAIN_HEX,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_EXPLORER_URL,
  BASE_SEPOLIA_RPC_URL,
} from '~/lib/buddypie-config'

type WalletContextValue = {
  account: string | null
  chainId: number | null
  isConnecting: boolean
  hasWallet: boolean
  connect: () => Promise<void>
  disconnect: () => void
  fetchWithPayment: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

const WalletContext = React.createContext<WalletContextValue | null>(null)

function getInjectedProvider() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return (window as Window & { ethereum?: any }).ethereum
}

async function ensureBaseSepolia(provider: any) {
  const targetChainId = BASE_SEPOLIA_CHAIN_HEX

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetChainId }],
    })
  } catch (error: any) {
    if (error?.code !== 4902) {
      throw error
    }

    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: targetChainId,
          chainName: 'Base Sepolia',
          nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18,
          },
          rpcUrls: [BASE_SEPOLIA_RPC_URL],
          blockExplorerUrls: [BASE_SEPOLIA_EXPLORER_URL],
        },
      ],
    })
  }
}

export function WalletProvider(props: { children: React.ReactNode }) {
  const provider = getInjectedProvider()
  const [account, setAccount] = React.useState<string | null>(null)
  const [chainId, setChainId] = React.useState<number | null>(null)
  const [isConnecting, setIsConnecting] = React.useState(false)

  React.useEffect(() => {
    if (!provider) {
      return
    }

    const syncWallet = async () => {
      const accounts = (await provider.request({
        method: 'eth_accounts',
      })) as string[]
      const nextChainHex = (await provider.request({
        method: 'eth_chainId',
      })) as string
      setAccount(accounts[0] ?? null)
      setChainId(Number.parseInt(nextChainHex, 16))
    }

    void syncWallet()

    const onAccountsChanged = (nextAccounts: string[]) => {
      setAccount(nextAccounts[0] ?? null)
    }

    const onChainChanged = (nextChainHex: string) => {
      setChainId(Number.parseInt(nextChainHex, 16))
    }

    provider.on?.('accountsChanged', onAccountsChanged)
    provider.on?.('chainChanged', onChainChanged)

    return () => {
      provider.removeListener?.('accountsChanged', onAccountsChanged)
      provider.removeListener?.('chainChanged', onChainChanged)
    }
  }, [provider])

  const connect = React.useCallback(async () => {
    if (!provider) {
      throw new Error('No injected wallet found. Install Coinbase Wallet or MetaMask.')
    }

    setIsConnecting(true)
    try {
      await ensureBaseSepolia(provider)
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[]
      const nextChainHex = (await provider.request({
        method: 'eth_chainId',
      })) as string
      setAccount(accounts[0] ?? null)
      setChainId(Number.parseInt(nextChainHex, 16))
    } finally {
      setIsConnecting(false)
    }
  }, [provider])

  const disconnect = React.useCallback(() => {
    setAccount(null)
    setChainId(null)
  }, [])

  const fetchWithPayment = React.useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!provider || !account) {
        throw new Error('Connect a Base Sepolia wallet before starting a paid agent run.')
      }

      await ensureBaseSepolia(provider)

      const walletClient = createWalletClient({
        account: account as `0x${string}`,
        chain: baseSepolia,
        transport: custom(provider),
      }).extend(publicActions)

      const signer = {
        address: account as `0x${string}`,
        signTypedData: (message: Record<string, unknown>) =>
          walletClient.signTypedData({
            account: account as `0x${string}`,
            ...(message as any),
          }),
        readContract: (args: Record<string, unknown>) => walletClient.readContract(args as any),
        signTransaction: (args: Record<string, unknown>) =>
          walletClient.signTransaction({
            account: account as `0x${string}`,
            ...(args as any),
          }),
        getTransactionCount: (args: { address: `0x${string}` }) =>
          walletClient.getTransactionCount(args),
        estimateFeesPerGas: () => walletClient.estimateFeesPerGas(),
      }

      const client = new x402Client().register(
        BASE_SEPOLIA_CAIP2,
        new ExactEvmScheme(signer),
      )

      const paidFetch = wrapFetchWithPayment(fetch, client)
      return paidFetch(input, {
        credentials: 'same-origin',
        ...init,
      })
    },
    [account, provider],
  )

  const value = React.useMemo<WalletContextValue>(
    () => ({
      account,
      chainId,
      isConnecting,
      hasWallet: Boolean(provider),
      connect,
      disconnect,
      fetchWithPayment,
    }),
    [account, chainId, connect, disconnect, fetchWithPayment, isConnecting, provider],
  )

  return <WalletContext.Provider value={value}>{props.children}</WalletContext.Provider>
}

export function useWallet() {
  const context = React.useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used inside WalletProvider')
  }

  return context
}

export function shortAddress(address: string | null) {
  if (!address) {
    return 'No wallet'
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function isWalletOnBaseSepolia(chainId: number | null) {
  return chainId === BASE_SEPOLIA_CHAIN_ID
}
