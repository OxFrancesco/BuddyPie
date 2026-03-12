function required(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function getServerEnv() {
  const publicBaseUrl = process.env.BUDDYPIE_PUBLIC_URL
    ? process.env.BUDDYPIE_PUBLIC_URL
    : process.env.VERCEL_URL
      ? process.env.VERCEL_URL.startsWith('http')
        ? process.env.VERCEL_URL
        : `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'

  return {
    publicBaseUrl,
    convexUrl: process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL ?? '',
    daytonaApiKey: process.env.DAYTONA_API_KEY ?? '',
    daytonaApiUrl: process.env.DAYTONA_API_URL,
    daytonaTarget: process.env.DAYTONA_TARGET,
    daytonaSnapshot: process.env.DAYTONA_SNAPSHOT ?? 'buddypie-pi-base-v1',
    piProvider: process.env.PI_PROVIDER,
    piModel: process.env.PI_MODEL,
    piCommand: process.env.PI_COMMAND ?? 'pi',
    x402FacilitatorUrl:
      process.env.X402_FACILITATOR_URL ?? 'https://facilitator.x402.org',
    x402PayToAddress: process.env.BUDDYPIE_X402_PAY_TO ?? '',
    baseSepoliaRpcUrl: process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org',
    pinataJwt: process.env.PINATA_JWT,
    registrationPrivateKey: process.env.PRIVATE_KEY,
  }
}

export function requireConvexUrl() {
  const value = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL
  if (!value) {
    throw new Error('Missing VITE_CONVEX_URL or CONVEX_URL')
  }
  return value
}

export function requireDaytonaApiKey() {
  return required('DAYTONA_API_KEY')
}

export function requireX402PayToAddress() {
  return required('BUDDYPIE_X402_PAY_TO')
}
