// Vault entry as returned by the backend (password is never exposed here)
export interface VaultEntry {
  id: string;
  service_name: string;
  username: string;
  email: string;
  category: string;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

// Payload sent to add / edit commands
export interface VaultEntryPayload {
  service_name: string;
  username: string;
  email: string;
  password: string;
  category: string;
  notes: string | null;
}

// Password generator options
export interface GeneratorOptions {
  length: number;
  include_lowercase: boolean;
  include_uppercase: boolean;
  include_numbers: boolean;
  include_symbols: boolean;
}

// Auth result from brute-force protected login / unlock
export interface AuthResult {
  success: boolean;
  remaining_attempts: number;
  lockout_seconds: number;
}

// Alias — matches the Rust UnlockResult struct returned by unlock_vault
export type UnlockResult = AuthResult;

// Password strength estimation result
export interface StrengthResult {
  entropy_bits: number;
  score: number; // 0-4
  label: string;
}

// Vault context state shape
export interface VaultState {
  entries: VaultEntry[];
  loading: boolean;
  error: string | null;
  isLocked: boolean;
}
