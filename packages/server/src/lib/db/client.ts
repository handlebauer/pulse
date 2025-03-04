import { createClient } from '@supabase/supabase-js'
import type { DatabaseConfig } from '../config/types'

/**
 * Create a Supabase client with admin privileges
 *
 * @param config Database configuration
 * @returns Supabase client
 */
export function createSupabaseClient(config: DatabaseConfig) {
    return createClient(config.url, config.serviceRoleKey)
}
