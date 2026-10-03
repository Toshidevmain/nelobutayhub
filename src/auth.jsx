import React from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider, SignIn, SignUp } from '@clerk/react'
import { publishableKeyFromHost } from '@clerk/react/internal'
import { shadcn } from '@clerk/themes'

const appearance = {
  theme: shadcn,
  options: {
    logoPlacement: 'inside',
    logoLinkUrl: '/',
    logoImageUrl: `${window.location.origin}/logo.svg`,
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
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-zinc-900 rounded-2xl w-[440px] max-w-full overflow-hidden border border-white/10',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: { color: '#f4f4f5' },
    headerSubtitle: { color: '#a1a1aa' },
    socialButtonsBlockButtonText: { color: '#e4e4e7' },
    formFieldLabel: { color: '#d4d4d8' },
    formFieldInput: { backgroundColor: '#09090b', borderColor: 'rgba(255,255,255,.14)', color: '#f4f4f5' },
    footerActionLink: { color: '#a5b4fc' },
    footerActionText: { color: '#a1a1aa' },
    dividerText: { color: '#a1a1aa' },
    identityPreviewEditButton: '!text-indigo-300',
    formFieldSuccessText: '!text-emerald-300',
    alertText: '!text-rose-200',
    logoBox: 'mb-2',
    logoImage: 'h-10 w-auto',
    socialButtonsBlockButton: { backgroundColor: '#09090b', borderColor: 'rgba(255,255,255,.14)' },
    formButtonPrimary: { backgroundColor: '#6366f1', color: '#ffffff' },
    formFieldRow: 'gap-2',
    main: 'gap-4',
  },
}

function validRedirect() {
  const target = new URLSearchParams(window.location.search).get('redirect')
  if (!target || !target.startsWith('/') || target.startsWith('//')) return '/'
  if (target.startsWith('/sign-in') || target.startsWith('/sign-up')) return '/'
  return target
}

async function startAuth() {
  const message = document.getElementById('auth-error')
  try {
    const response = await fetch('/api/config')
    if (!response.ok) throw new Error('Account services could not be reached.')
    const config = await response.json()
    const publishableKey = publishableKeyFromHost(window.location.hostname, config.publishableKey)
    if (!publishableKey) throw new Error('Sign-in is not configured yet.')

    const signup = window.location.pathname.startsWith('/sign-up')
    const redirectUrl = validRedirect()
    document.title = signup ? 'Create an account — Nelo Butay' : 'Sign in — Nelo Butay'

    const form = signup
      ? <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl={redirectUrl} />
      : <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl={redirectUrl} />

    createRoot(document.getElementById('auth-widget')).render(
      <ClerkProvider
        publishableKey={publishableKey}
        proxyUrl={config.proxyUrl}
        appearance={appearance}
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
        signInFallbackRedirectUrl={redirectUrl}
        signUpFallbackRedirectUrl={redirectUrl}
        localization={{
          signIn: {
            start: {
              title: 'Welcome back',
              subtitle: 'Sign in to continue watching.',
            },
          },
          signUp: {
            start: {
              title: 'Join Nelo Butay',
              subtitle: 'Create an account to join the conversation.',
            },
          },
        }}
      >
        {form}
      </ClerkProvider>,
    )
  } catch (error) {
    message.textContent = error.message || 'Sign-in is not available right now.'
    message.classList.remove('hidden')
  }
}

startAuth()