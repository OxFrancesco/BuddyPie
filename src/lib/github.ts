export type GitHubRepoSummary = {
  id: number
  fullName: string
  owner: string
  name: string
  description: string | null
  defaultBranch: string
  private: boolean
  htmlUrl: string
  cloneUrl: string
  updatedAt: string
}

export type GitHubPullRequestSummary = {
  number: number
  url: string
  state: string
  draft: boolean
  title: string
  head: string
  base: string
}

function githubHeaders(accessToken?: string) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(accessToken
      ? {
          Authorization: `Bearer ${accessToken}`,
        }
      : {}),
  }
}

export function parseGitHubRepoInput(input: string) {
  const trimmed = input.trim()
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshMatch) {
    return {
      repoOwner: sshMatch[1]!,
      repoName: sshMatch[2]!,
    }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const url = new URL(trimmed)
    if (url.hostname !== 'github.com') {
      throw new Error('Only github.com repositories are supported in BuddyPie MVP')
    }

    const [repoOwner, repoNameRaw] = url.pathname.replace(/^\/+/, '').split('/')
    if (!repoOwner || !repoNameRaw) {
      throw new Error('Invalid GitHub repository URL')
    }

    return {
      repoOwner,
      repoName: repoNameRaw.replace(/\.git$/, ''),
    }
  }

  const [repoOwner, repoNameRaw] = trimmed.split('/')
  if (!repoOwner || !repoNameRaw) {
    throw new Error('Repository must be a GitHub URL or owner/repo string')
  }

  return {
    repoOwner,
    repoName: repoNameRaw.replace(/\.git$/, ''),
  }
}

export async function fetchGitHubRepo(
  repoFullName: string,
  accessToken?: string,
) {
  const response = await fetch(`https://api.github.com/repos/${repoFullName}`, {
    headers: githubHeaders(accessToken),
  })

  if (!response.ok) {
    throw new Error(`GitHub repo lookup failed with ${response.status}`)
  }

  const repo = await response.json()
  return {
    id: repo.id as number,
    fullName: repo.full_name as string,
    owner: repo.owner?.login as string,
    name: repo.name as string,
    description: (repo.description ?? null) as string | null,
    defaultBranch: repo.default_branch as string,
    private: repo.private as boolean,
    htmlUrl: repo.html_url as string,
    cloneUrl: repo.clone_url as string,
    updatedAt: repo.updated_at as string,
  } satisfies GitHubRepoSummary
}

export async function listGitHubRepos(accessToken: string) {
  const response = await fetch(
    'https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member',
    {
      headers: githubHeaders(accessToken),
    },
  )

  if (!response.ok) {
    throw new Error(`GitHub repo listing failed with ${response.status}`)
  }

  const repos = (await response.json()) as Array<any>
  return repos.map(
    (repo) =>
      ({
        id: repo.id,
        fullName: repo.full_name,
        owner: repo.owner?.login,
        name: repo.name,
        description: repo.description ?? null,
        defaultBranch: repo.default_branch,
        private: repo.private,
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        updatedAt: repo.updated_at,
      }) satisfies GitHubRepoSummary,
  )
}

async function parseGitHubError(response: Response) {
  try {
    const payload = await response.json()
    return typeof payload.message === 'string' ? payload.message : null
  } catch {
    return null
  }
}

export async function createGitHubPullRequest(options: {
  repoFullName: string
  accessToken: string
  title: string
  body?: string
  head: string
  base: string
  draft?: boolean
}) {
  const response = await fetch(`https://api.github.com/repos/${options.repoFullName}/pulls`, {
    method: 'POST',
    headers: {
      ...githubHeaders(options.accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: options.title,
      body: options.body,
      head: options.head,
      base: options.base,
      draft: options.draft ?? false,
    }),
  })

  if (!response.ok) {
    const message = await parseGitHubError(response)
    throw new Error(
      message
        ? `GitHub pull request creation failed: ${message}`
        : `GitHub pull request creation failed with ${response.status}`,
    )
  }

  const pullRequest = await response.json()
  return {
    number: pullRequest.number as number,
    url: pullRequest.html_url as string,
    state: pullRequest.state as string,
    draft: pullRequest.draft as boolean,
    title: pullRequest.title as string,
    head: pullRequest.head?.ref as string,
    base: pullRequest.base?.ref as string,
  } satisfies GitHubPullRequestSummary
}
