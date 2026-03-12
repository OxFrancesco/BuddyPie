export default function (pi: any) {
  pi.on('agent_start', async (_event: any, ctx: any) => {
    ctx.ui?.setWidget?.('buddypie-docs', [
      'Docs mode',
      'Prefer concise, accurate technical writing.',
    ])
  })
}
