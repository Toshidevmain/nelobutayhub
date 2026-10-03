import { Clerk } from '@clerk/clerk-js'

const appearance = {
  layout: {
    logoImageUrl: `${window.location.origin}/favicon.svg`,
    logoLinkUrl: `${window.location.origin}/`,
  },
  variables: {
    colorPrimary: '#6366f1',
    colorForeground: '#f4f4f5',
    colorMutedForeground: '#a1a1aa',
    colorDanger: '#fb7185',
    colorBackground: '#18181b',
    colorInput: '#09090b',
    colorInputForeground: '#f4f4f5',
    colorNeutral: '#3f3f46',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    card: '!border !border-white/10 !bg-zinc-900 !shadow-2xl',
    headerTitle: '!text-zinc-100',
    headerSubtitle: '!text-zinc-400',
    formFieldLabel: '!text-zinc-300',
    formFieldInput: '!border-white/10 !bg-zinc-950 !text-zinc-100',
    formButtonPrimary: '!bg-indigo-500 hover:!bg-indigo-400',
    footerActionLink: '!text-indigo-300',
    footerActionText: '!text-zinc-400',
    dividerLine: '!bg-white/10',
    dividerText: '!text-zinc-500',
  },
}

function currentLocation() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function requestedReturnPath() {
  const value = new URLSearchParams(window.location.search).get('redirect')
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.startsWith('/sign-in') || value.startsWith('/sign-up')) return '/'
  return value
}

function makeLink(label, destination, primary = false) {
  const link = document.createElement('a')
  link.href = destination
  link.textContent = label
  link.className = primary
    ? 'inline-flex min-h-9 items-center justify-center rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-400 sm:px-3.5 sm:text-sm'
    : 'inline-flex min-h-9 items-center justify-center rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white sm:px-3 sm:text-sm'
  return link
}

function renderAccountControls(clerk) {
  const container = document.getElementById('account-controls')
  if (!container) return
  container.replaceChildren()
  container.className = 'flex items-center gap-1 sm:gap-2'

  if (!clerk?.user) {
    const redirect = encodeURIComponent(currentLocation())
    container.append(
      makeLink('Sign in', `/sign-in?redirect=${redirect}`),
      makeLink('Create account', `/sign-up?redirect=${redirect}`, true),
    )
    return
  }

  const profile = document.createElement('button')
  profile.type = 'button'
  profile.className = 'hidden max-w-36 truncate rounded-lg px-2 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white sm:inline-flex sm:text-sm'
  profile.textContent = clerk.user.fullName || clerk.user.username || 'Account'
  profile.setAttribute('aria-label', 'Open account profile')
  profile.addEventListener('click', () => clerk.openUserProfile())

  const signOut = document.createElement('button')
  signOut.type = 'button'
  signOut.className = 'inline-flex min-h-9 items-center justify-center rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-2 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:bg-zinc-800 hover:text-white sm:px-3 sm:text-sm'
  signOut.textContent = 'Sign out'
  signOut.addEventListener('click', () => clerk.signOut({ redirectUrl: currentLocation() }))
  container.append(profile, signOut)
}

function setAuthError(message) {
  const target = document.getElementById('auth-error')
  if (!target) return
  target.textContent = message
  target.classList.remove('hidden')
}

function mountAuthPage(clerk) {
  const root = document.getElementById('auth-widget')
  if (!root) return

  const redirectUrl = requestedReturnPath()
  const path = window.location.pathname
  if (path.startsWith('/sign-up')) {
    document.title = 'Create an account — Nelo Butay'
    clerk.mountSignUp(root, {
      routing: 'path',
      path: '/sign-up',
      signInUrl: '/sign-in',
      forceRedirectUrl: redirectUrl,
    })
  } else {
    clerk.mountSignIn(root, {
      routing: 'path',
      path: '/sign-in',
      signUpUrl: '/sign-up',
      forceRedirectUrl: redirectUrl,
    })
  }
}

function setStatus(message, tone = 'muted') {
  const status = document.getElementById('watch-status')
  if (!status) return
  status.textContent = message
  status.classList.remove('hidden')
  status.classList.toggle('text-amber-200', tone === 'warning')
  status.classList.toggle('text-rose-200', tone === 'error')
  status.classList.toggle('text-zinc-400', tone === 'muted')
}

function setCommentCount(count) {
  const target = document.getElementById('comment-count')
  if (target) target.textContent = `${count} ${count === 1 ? 'comment' : 'comments'}`
}

function renderComments(items, clerk, title) {
  const list = document.getElementById('comments-list')
  if (!list) return
  list.replaceChildren()

  if (!items.length) {
    const empty = document.createElement('p')
    empty.className = 'py-6 text-sm text-zinc-500'
    empty.textContent = 'No comments yet. Start the conversation.'
    list.append(empty)
    return
  }

  items.forEach(comment => {
    const article = document.createElement('article')
    article.className = 'flex gap-3 py-5 first:pt-1'

    const avatar = document.createElement('span')
    avatar.className = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-xs font-semibold text-indigo-200'
    avatar.textContent = (comment.displayName || 'M').slice(-1).toUpperCase()

    const content = document.createElement('div')
    content.className = 'min-w-0 flex-1'
    const header = document.createElement('div')
    header.className = 'flex flex-wrap items-center gap-x-2 gap-y-1'
    const name = document.createElement('span')
    name.className = 'text-sm font-medium text-zinc-200'
    name.textContent = comment.displayName || 'Member'
    const date = document.createElement('time')
    date.className = 'text-xs text-zinc-600'
    const created = new Date(comment.createdAt)
    date.dateTime = Number.isNaN(created.getTime()) ? '' : created.toISOString()
    date.textContent = Number.isNaN(created.getTime()) ? '' : created.toLocaleString()
    header.append(name, date)

    const body = document.createElement('p')
    body.className = 'mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-400'
    body.textContent = comment.text
    content.append(header, body)

    if (clerk?.user?.id === comment.userId) {
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'mt-2 rounded px-1 py-1 text-xs text-zinc-600 transition hover:text-rose-300'
      remove.textContent = 'Delete'
      remove.addEventListener('click', async () => {
        remove.disabled = true
        try {
          const response = await fetch(`/api/comments/${encodeURIComponent(comment.id)}`, { method: 'DELETE' })
          if (!response.ok) throw new Error('Comment could not be deleted.')
          await loadWatchActivity(clerk, title)
        } catch (error) {
          remove.disabled = false
          setStatus(error.message, 'error')
        }
      })
      content.append(remove)
    }

    article.append(avatar, content)
    list.append(article)
  })
}

function redirectToSignIn() {
  const redirect = encodeURIComponent(`${currentLocation()}#discussion`)
  window.location.href = `/sign-in?redirect=${redirect}`
}

async function loadWatchActivity(clerk, title) {
  const query = `?title=${encodeURIComponent(title)}`
  const [commentsResponse, engagementResponse] = await Promise.all([
    fetch(`/api/comments${query}`),
    fetch(`/api/engagement${query}`),
  ])

  if (commentsResponse.status === 403 || engagementResponse.status === 403) {
    setStatus('Confirm you are 18 or older on the home page to view video discussions.', 'warning')
    return
  }
  if (!commentsResponse.ok || !engagementResponse.ok) {
    setStatus('Video activity could not be loaded right now.', 'error')
    return
  }

  const [comments, engagement] = await Promise.all([
    commentsResponse.json(),
    engagementResponse.json(),
  ])
  const likeCount = document.getElementById('like-count')
  const likeLabel = document.getElementById('like-label')
  const likeButton = document.getElementById('like-button')
  if (likeCount) likeCount.textContent = String(engagement.likes)
  if (likeLabel) likeLabel.textContent = engagement.liked ? 'Liked' : 'Like'
  if (likeButton) {
    likeButton.setAttribute('aria-pressed', String(engagement.liked))
    likeButton.classList.toggle('border-indigo-400/40', engagement.liked)
    likeButton.classList.toggle('bg-indigo-500/10', engagement.liked)
    likeButton.classList.toggle('text-indigo-200', engagement.liked)
  }
  setCommentCount(engagement.comments)
  renderComments(comments.comments, clerk, title)
}

async function initializeWatchPage(clerk) {
  if (!document.getElementById('qpills')) return
  const title = new URLSearchParams(window.location.search).get('title')
  if (!title) return window.location.replace('/')

  let response
  try {
    response = await fetch('/api/videos')
  } catch {
    setStatus('The video library could not be reached. Please try again.', 'error')
    return
  }
  if (response.status === 403) {
    setStatus('Confirm you are 18 or older on the home page before watching.', 'warning')
    return
  }
  if (!response.ok) {
    setStatus('The video library could not be loaded right now.', 'error')
    return
  }

  const videos = await response.json()
  const item = videos.find(video => video.title === title)
  if (!item) return window.location.replace('/')

  document.getElementById('title').textContent = item.title
  const video = document.getElementById('vid')
  const pills = document.getElementById('qpills')
  const saved = localStorage.getItem('qPreferred')
  const initial = item.variants.find(variant => variant.quality === saved) || item.variants[0]

  function setSource(id) {
    const currentTime = video.currentTime
    video.src = `/api/stream/${encodeURIComponent(id)}`
    document.getElementById('dl').href = `/api/download/${encodeURIComponent(id)}`
    video.onloadedmetadata = () => { video.currentTime = currentTime }
  }

  item.variants.forEach(variant => {
    const button = document.createElement('button')
    const active = variant.id === initial.id
    button.type = 'button'
    button.className = 'rounded-lg border px-3 py-2 text-sm font-medium transition ' +
      (active
        ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-200'
        : 'border-white/10 bg-zinc-900 text-zinc-400 hover:border-white/20 hover:text-white')
    button.textContent = variant.quality
    button.setAttribute('aria-pressed', String(active))
    button.addEventListener('click', () => {
      setSource(variant.id)
      localStorage.setItem('qPreferred', variant.quality)
      pills.querySelectorAll('button').forEach(pill => {
        pill.className = 'rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-400 transition hover:border-white/20 hover:text-white'
        pill.setAttribute('aria-pressed', 'false')
      })
      button.className = 'rounded-lg border border-indigo-400/50 bg-indigo-500/15 px-3 py-2 text-sm font-medium text-indigo-200 transition'
      button.setAttribute('aria-pressed', 'true')
    })
    pills.append(button)
  })
  setSource(initial.id)

  const form = document.getElementById('comment-form')
  const signInPrompt = document.getElementById('comment-signin')
  const input = document.getElementById('comment-input')
  const submit = document.getElementById('comment-submit')
  const commentStatus = document.getElementById('comment-status')
  const likeButton = document.getElementById('like-button')
  let activity = null

  function updateCommentAccess(user) {
    const signedIn = Boolean(user)
    form.classList.toggle('hidden', !signedIn)
    signInPrompt.classList.toggle('hidden', signedIn)
    const signInLink = signInPrompt.querySelector('a')
    if (signInLink) signInLink.href = `/sign-in?redirect=${encodeURIComponent(currentLocation())}`
  }

  updateCommentAccess(clerk?.user)
  window.addEventListener('nelo:auth-change', event => {
    updateCommentAccess(event.detail.user)
    loadWatchActivity(clerk, title).catch(() => setStatus('Video activity could not be loaded right now.', 'error'))
  })

  likeButton.addEventListener('click', async () => {
    if (!clerk?.user) return redirectToSignIn()
    likeButton.disabled = true
    try {
      const liked = likeButton.getAttribute('aria-pressed') !== 'true'
      const result = await fetch('/api/reaction', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, liked }),
      })
      if (result.status === 401) return redirectToSignIn()
      if (!result.ok) throw new Error((await result.json()).error || 'Your reaction could not be saved.')
      const updated = await result.json()
      document.getElementById('like-count').textContent = String(updated.likes)
      document.getElementById('like-label').textContent = updated.liked ? 'Liked' : 'Like'
      likeButton.setAttribute('aria-pressed', String(updated.liked))
      likeButton.classList.toggle('border-indigo-400/40', updated.liked)
      likeButton.classList.toggle('bg-indigo-500/10', updated.liked)
      likeButton.classList.toggle('text-indigo-200', updated.liked)
    } catch (error) {
      setStatus(error.message, 'error')
    } finally {
      likeButton.disabled = false
    }
  })

  form.addEventListener('submit', async event => {
    event.preventDefault()
    const text = input.value.trim()
    if (!text || text.length > 1000 || !clerk?.user) return
    submit.disabled = true
    commentStatus.textContent = 'Posting…'
    try {
      const result = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, text }),
      })
      if (result.status === 401) return redirectToSignIn()
      const body = await result.json()
      if (!result.ok) throw new Error(body.error || 'Your comment could not be posted.')
      input.value = ''
      commentStatus.textContent = 'Your comment was posted.'
      await loadWatchActivity(clerk, title)
    } catch (error) {
      commentStatus.textContent = error.message
    } finally {
      submit.disabled = false
    }
  })

  await loadWatchActivity(clerk, title).catch(() => setStatus('Video activity could not be loaded right now.', 'error'))
}

async function startSite() {
  const authPage = document.getElementById('auth-widget')
  let clerk = null
  try {
    const response = await fetch('/api/config')
    if (!response.ok) throw new Error('Account services could not be reached.')
    const config = await response.json()
    if (!config.publishableKey) throw new Error('Sign-in is not configured yet.')

    clerk = new Clerk(config.publishableKey, { proxyUrl: config.proxyUrl })
    await clerk.load({
      appearance,
      localization: {
        signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to continue watching.' } },
        signUp: { start: { title: 'Join Nelo Butay', subtitle: 'Create an account to join the conversation.' } },
      },
    })
    window.neloClerk = clerk
    renderAccountControls(clerk)
    clerk.addListener(({ user }) => {
      renderAccountControls(clerk)
      window.dispatchEvent(new CustomEvent('nelo:auth-change', { detail: { user } }))
    })
    if (authPage) mountAuthPage(clerk)
  } catch (error) {
    if (authPage) setAuthError(error.message || 'Sign-in is not available right now.')
    renderAccountControls(null)
  }

  await initializeWatchPage(clerk).catch(() => setStatus('The video could not be loaded right now.', 'error'))
}

startSite()