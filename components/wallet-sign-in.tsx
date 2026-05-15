'use client'

import { useState } from 'react'
import { useWeb3 } from '@/lib/web3-context'
import { signMessage, createSignInMessage, generateNonce } from '@/lib/web3-utils'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function WalletSignIn() {
  const { account, isConnected, signer } = useWeb3()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSignIn = async () => {
    if (!account || !signer) {
      setError('Wallet not connected')
      return
    }

    setIsSigningIn(true)
    setError(null)

    try {
      // Generate nonce for this sign-in attempt
      const nonce = generateNonce()
      const message = createSignInMessage(nonce)

      // Sign the message
      const signature = await signMessage(signer, message)

      // Verify signature on backend
      const response = await fetch('/api/auth/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: account,
          message,
          signature,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed')
      }

      // Store auth info and redirect
      localStorage.setItem('walletAuth', JSON.stringify({
        address: data.user.address,
        userId: data.user.id,
        timestamp: Date.now(),
      }))

      router.push('/dashboard')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed'
      setError(message)
      console.error('Sign-in error:', err)
    } finally {
      setIsSigningIn(false)
    }
  }

  if (!isConnected) {
    return null
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          Connected with: <span className="font-mono font-semibold">{account}</span>
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleSignIn}
        disabled={isSigningIn}
        size="lg"
        className="w-full"
      >
        {isSigningIn ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Signing in...
          </>
        ) : (
          'Sign In with Wallet'
        )}
      </Button>
    </div>
  )
}
