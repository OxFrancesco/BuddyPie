export default function (pi: any) {
  pi.on('tool_call', async (event: any) => {
    if (event.toolName !== 'bash') {
      return undefined
    }

    const command = String(event.input?.command ?? '')
    const blockedPatterns = [
      'git reset --hard',
      'git checkout --',
      'rm -rf .',
      'rm -rf /',
    ]

    if (blockedPatterns.some((pattern) => command.includes(pattern))) {
      return {
        block: true,
        reason:
          'BuddyPie blocked a destructive command. Ask the user explicitly before retrying.',
      }
    }

    return undefined
  })
}
