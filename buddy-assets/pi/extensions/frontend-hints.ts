export default function (pi: any) {
  pi.on('agent_start', async (_event: any, ctx: any) => {
    ctx.ui?.setWidget?.('buddypie-frontend', [
      'Frontend mode',
      'Prefer a working preview quickly.',
    ])
  })
}
