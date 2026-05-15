import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyMessage, toChecksumAddress } from '@/lib/web3-utils'

export async function POST(request: NextRequest) {
  try {
    const { address, message, signature } = await request.json()

    if (!address || !message || !signature) {
      return NextResponse.json(
        { error: 'Missing required fields: address, message, signature' },
        { status: 400 }
      )
    }

    // Verify the signature
    const recoveredAddress = await verifyMessage(message, signature)
    const checksumAddress = toChecksumAddress(address)
    const recoveredChecksumAddress = toChecksumAddress(recoveredAddress)

    if (checksumAddress !== recoveredChecksumAddress) {
      return NextResponse.json(
        { error: 'Signature verification failed' },
        { status: 401 }
      )
    }

    // Get or create user in Supabase using wallet address
    const supabase = await createClient()

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('id, email')
      .eq('wallet_address', checksumAddress)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      return NextResponse.json(
        { error: 'Database error: ' + fetchError.message },
        { status: 500 }
      )
    }

    let userId: string
    let userEmail: string

    if (existingUser) {
      userId = existingUser.id
      userEmail = existingUser.email
    } else {
      // Create new user with wallet address
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([
          {
            wallet_address: checksumAddress,
            email: `wallet-${checksumAddress.toLowerCase()}@team-management.local`,
            role: 'user',
            status: 'pending',
          },
        ])
        .select('id, email')
        .single()

      if (insertError) {
        return NextResponse.json(
          { error: 'Failed to create user: ' + insertError.message },
          { status: 500 }
        )
      }

      userId = newUser.id
      userEmail = newUser.email
    }

    // Create a session token (you can use Supabase auth or JWT)
    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        address: checksumAddress,
        email: userEmail,
      },
    })
  } catch (error) {
    console.error('Wallet authentication error:', error)
    return NextResponse.json(
      { error: 'Authentication failed: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
}
