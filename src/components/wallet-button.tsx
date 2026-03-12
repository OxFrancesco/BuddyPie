import { useWallet, shortAddress, isWalletOnBaseSepolia } from './wallet-provider'

export function WalletButton() {
  const wallet = useWallet()

  if (!wallet.hasWallet) {
    return (
      <button className="button button-muted" type="button" disabled>
        Install wallet
      </button>
    )
  }

  if (!wallet.account) {
    return (
      <button className="button button-secondary" type="button" onClick={() => void wallet.connect()}>
        {wallet.isConnecting ? 'Connecting...' : 'Connect Base wallet'}
      </button>
    )
  }

  return (
    <button
      className={`button ${isWalletOnBaseSepolia(wallet.chainId) ? 'button-muted' : 'button-danger'}`}
      type="button"
      onClick={() => void wallet.connect()}
      title={wallet.account}
    >
      {shortAddress(wallet.account)}
      {isWalletOnBaseSepolia(wallet.chainId) ? ' on Base Sepolia' : ' switch network'}
    </button>
  )
}
