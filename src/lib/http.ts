export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init)
}

export function errorJson(
  status: number,
  message: string,
  extra?: Record<string, unknown>,
) {
  return Response.json(
    {
      error: message,
      ...extra,
    },
    { status },
  )
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  const contentLength = request.headers.get('content-length')
  if (contentLength === '0') {
    return {} as T
  }

  return (await request.json()) as T
}

export async function readMaybeJsonBody<T>(request: Request): Promise<T | null> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return null
  }

  const text = await request.text()
  if (!text.trim()) {
    return null
  }

  return JSON.parse(text) as T
}

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Unknown error'
}

export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}
