// src-tauri/src/security.rs
// ─────────────────────────────────────────────────────────────────────────────
// Security utility commands: clipboard management, password strength.
//
// • Clipboard auto-clear via OS-native write (empty string) with no
//   external dependencies — uses Tauri's IPC to trigger frontend clearing.
// • Password strength estimation using Shannon entropy + rule scoring.
// ─────────────────────────────────────────────────────────────────────────────

use serde::Serialize;

// ── Password strength estimation ───────────────────────────────────────────────

/// Strength result returned to the frontend.
#[derive(Debug, Serialize)]
pub struct StrengthResult {
    /// Shannon entropy in bits
    pub entropy_bits: f64,
    /// 0-4 score: 0=very weak, 1=weak, 2=fair, 3=strong, 4=very strong
    pub score: u8,
    /// Human-readable label
    pub label: String,
}

/// Calculate password strength based on entropy and composition rules.
///
/// Entropy = length × log2(charset_size)
/// Score is boosted or penalised by composition heuristics:
/// - Presence of lowercase, uppercase, digits, symbols
/// - Length thresholds
/// - Repetition penalty
#[tauri::command]
pub fn estimate_password_strength(password: String) -> Result<StrengthResult, String> {
    if password.is_empty() {
        return Ok(StrengthResult {
            entropy_bits: 0.0,
            score: 0,
            label: "Empty".into(),
        });
    }

    let len = password.len() as f64;

    // Determine effective charset size
    let has_lower = password.chars().any(|c| c.is_ascii_lowercase());
    let has_upper = password.chars().any(|c| c.is_ascii_uppercase());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());
    let has_symbol = password.chars().any(|c| !c.is_alphanumeric() && c.is_ascii());

    let mut charset_size: u32 = 0;
    if has_lower {
        charset_size += 26;
    }
    if has_upper {
        charset_size += 26;
    }
    if has_digit {
        charset_size += 10;
    }
    if has_symbol {
        charset_size += 32;
    }
    if charset_size == 0 {
        charset_size = 26; // fallback for unicode etc.
    }

    let entropy_bits = len * (charset_size as f64).log2();

    // Check for excessive repetition (penalty)
    let unique_chars = {
        let mut chars: Vec<char> = password.chars().collect();
        chars.sort();
        chars.dedup();
        chars.len()
    };
    let repetition_ratio = unique_chars as f64 / len;

    // Score calculation
    let mut score: u8 = match entropy_bits as u64 {
        0..=27 => 0,
        28..=35 => 1,
        36..=59 => 2,
        60..=79 => 3,
        _ => 4,
    };

    // Bonus for using all character classes
    let class_count = [has_lower, has_upper, has_digit, has_symbol]
        .iter()
        .filter(|&&v| v)
        .count();
    if class_count >= 4 && password.len() >= 12 {
        score = score.saturating_add(1).min(4);
    }

    // Penalty for high repetition
    if repetition_ratio < 0.4 && score > 0 {
        score = score.saturating_sub(1);
    }

    let label = match score {
        0 => "Very Weak",
        1 => "Weak",
        2 => "Fair",
        3 => "Strong",
        _ => "Very Strong",
    }
    .to_string();

    Ok(StrengthResult {
        entropy_bits: (entropy_bits * 100.0).round() / 100.0,
        score,
        label,
    })
}

/// Write an empty string to the OS clipboard to clear sensitive data.
/// Called by the frontend after a configurable delay.
#[tauri::command]
pub fn clear_clipboard() -> Result<bool, String> {
    // Use the Windows clipboard API via a small inline routine.
    // This avoids adding a clipboard crate dependency.
    #[cfg(target_os = "windows")]
    {
        use std::ptr;

        unsafe {
            if open_clipboard(ptr::null_mut()) == 0 {
                return Err("Failed to open clipboard.".into());
            }
            empty_clipboard();
            close_clipboard();
        }

        return Ok(true);

        // Windows API bindings (minimal)
        extern "system" {
            fn OpenClipboard(h_wnd_new_owner: *mut std::ffi::c_void) -> i32;
            fn EmptyClipboard() -> i32;
            fn CloseClipboard() -> i32;
        }

        unsafe fn open_clipboard(hwnd: *mut std::ffi::c_void) -> i32 {
            OpenClipboard(hwnd)
        }
        unsafe fn empty_clipboard() -> i32 {
            EmptyClipboard()
        }
        unsafe fn close_clipboard() -> i32 {
            CloseClipboard()
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Fallback: the frontend handles clipboard clearing via the Clipboard API
        Ok(true)
    }
}
