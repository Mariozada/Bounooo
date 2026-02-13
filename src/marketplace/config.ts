/**
 * Marketplace Configuration
 *
 * Treasury wallet and fee settings for the Bouno skill marketplace.
 */

/** Bouno treasury wallet — receives commission on all skill sales */
export const TREASURY_PUBLIC_KEY = '718iSH6uuCg8WNhwPZqTRNiJ9zLw4EmHErAL4n9uHnJr'

/**
 * Commission rate as basis points (100 = 1%, 500 = 5%, 1000 = 10%)
 * Applied to every paid skill purchase. Split: seller gets (1 - fee), treasury gets fee.
 */
export const COMMISSION_BPS = 500 // 5%

/** Minimum commission in lamports (to cover tx fees on tiny purchases) */
export const MIN_COMMISSION_LAMPORTS = 10_000 // 0.00001 SOL

/** Network to use */
export const DEFAULT_NETWORK = 'devnet' as const

/** Supabase — skill registry */
export const SUPABASE_URL = 'https://wqhfsymqhavwhriasfkm.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxaGZzeW1xaGF2d2hyaWFzZmttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODg0NTgsImV4cCI6MjA4NjU2NDQ1OH0.b0HyX2C5bwZ9d7FarEjtDMGrtP1URbrlBT_zQXxYPOk'
