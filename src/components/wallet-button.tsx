import { useWallet, shortAddress, isWalletOnBaseSepolia } from './wallet-provider'
import { Button } from '~/components/ui/button'

export function WalletButton() {
  const wallet = useWallet()

  if (!wallet.hasWallet) {
    return (
      <Button variant="outline" size="sm" disabled>
        Install wallet
      </Button>
    )
  }

  if (!wallet.account) {
    return (
      <Button variant="secondary" size="sm" onClick={() => void wallet.connect()}>
        {wallet.isConnecting ? 'Connecting...' : 'Connect wallet'}
      </Button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void wallet.connect()}
      title={wallet.account}
      className="flex h-8 items-center border-2 border-foreground bg-background px-3 font-mono text-xs text-foreground transition-all hover:translate-x-px hover:translate-y-px active:translate-x-0.5 active:translate-y-0.5"
    >
      {shortAddress(wallet.account)}
      {isWalletOnBaseSepolia(wallet.chainId) ? '' : ' · switch network'}
    </button>
  )
}
