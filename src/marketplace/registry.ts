/**
 * Supabase Skill Registry
 *
 * CRUD operations for the marketplace skill catalog.
 * Supabase handles browse, search, and listing persistence.
 * Solana handles payments. IPFS handles file storage.
 */

import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/** Row shape matching the Supabase `skills` table */
export interface SkillRow {
  id: string
  name: string
  description: string
  category: string
  version: string
  price_lamports: number
  seller: string
  ipfs_cid: string
  metadata_cid: string | null
  image_url: string | null
  mint_address: string | null
  tx_signature: string | null
  downloads: number
  raw_content: string | null
  created_at: string
  updated_at: string
}

export interface ListSkillsOptions {
  category?: string
  search?: string
  seller?: string
  limit?: number
  offset?: number
  orderBy?: 'downloads' | 'created_at' | 'price_lamports'
  ascending?: boolean
}

/**
 * Browse skills with optional filters
 */
export async function listSkills(options: ListSkillsOptions = {}): Promise<SkillRow[]> {
  const {
    category,
    search,
    seller,
    limit = 50,
    offset = 0,
    orderBy = 'created_at',
    ascending = false,
  } = options

  let query = supabase
    .from('skills')
    .select('*')
    .order(orderBy, { ascending })
    .range(offset, offset + limit - 1)

  if (category && category !== 'all') {
    query = query.eq('category', category)
  }

  if (seller) {
    query = query.eq('seller', seller)
  }

  if (search) {
    query = query.textSearch('fts', search, { type: 'websearch' })
  }

  const { data, error } = await query

  if (error) {
    console.error('[Registry] listSkills error:', error)
    throw new Error(error.message)
  }

  return data || []
}

/**
 * Search skills by query (full-text search)
 */
export async function searchSkills(query: string, limit = 20): Promise<SkillRow[]> {
  return listSkills({ search: query, limit })
}

/**
 * Get a single skill by ID
 */
export async function getSkillById(id: string): Promise<SkillRow | null> {
  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // not found
    throw new Error(error.message)
  }

  return data
}

/**
 * Publish a skill listing to the registry
 */
export async function publishSkillListing(skill: {
  name: string
  description: string
  category: string
  version: string
  price_lamports: number
  seller: string
  ipfs_cid: string
  metadata_cid?: string
  image_url?: string
  mint_address?: string
  tx_signature?: string
}): Promise<SkillRow> {
  const { data, error } = await supabase
    .from('skills')
    .insert({
      name: skill.name,
      description: skill.description,
      category: skill.category,
      version: skill.version,
      price_lamports: skill.price_lamports,
      seller: skill.seller,
      ipfs_cid: skill.ipfs_cid,
      metadata_cid: skill.metadata_cid || null,
      image_url: skill.image_url || null,
      mint_address: skill.mint_address || null,
      tx_signature: skill.tx_signature || null,
    })
    .select()
    .single()

  if (error) {
    console.error('[Registry] publishSkillListing error:', error)
    throw new Error(error.message)
  }

  return data
}

/**
 * Increment download count for a skill
 */
export async function incrementDownloads(skillId: string): Promise<void> {
  const { error } = await supabase.rpc('increment_downloads', { skill_id: skillId })
  if (error) {
    console.error('[Registry] incrementDownloads error:', error)
  }
}

/**
 * Get skills published by a specific seller
 */
export async function getSkillsBySeller(seller: string): Promise<SkillRow[]> {
  return listSkills({ seller })
}

/**
 * Get available categories (from existing skills)
 */
export async function getCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from('skills')
    .select('category')

  if (error) {
    console.error('[Registry] getCategories error:', error)
    return []
  }

  const unique = [...new Set((data || []).map(r => r.category))]
  return unique.sort()
}
