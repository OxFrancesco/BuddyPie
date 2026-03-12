const PREVIEW_REGEX = /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})\b/i

export default function (pi: any) {
  pi.on('tool_result', async (event: any, ctx: any) => {
    const serialized = JSON.stringify(event)
    const match = serialized.match(PREVIEW_REGEX)

    if (!match?.[1]) {
      return undefined
    }

    ctx.ui?.setStatus?.('preview', `Preview candidate on port ${match[1]}`)
    ctx.ui?.notify?.(
      `BuddyPie detected a possible preview on port ${match[1]}`,
      'info',
    )

    return undefined
  })
}
