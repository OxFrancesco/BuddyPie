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
    <Button
      variant={isWalletOnBaseSepolia(wallet.chainId) ? 'outline' : 'destructive'}
      size="sm"
      onClick={() => void wallet.connect()}
      title={wallet.account}
    >
      {shortAddress(wallet.account)}
      {isWalletOnBaseSepolia(wallet.chainId) ? '' : ' · switch network'}
    </Button>
  )
}
