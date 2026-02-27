// src/features/documents/components/ImportDocumentModal.tsx
import React, { useCallback, useEffect, useState } from "react";
import { importDocument } from "../services/documentService";
import { formatFileSize } from "../types/document.types";
import {
  generatePassword as genPw,
  estimatePasswordStrength,
} from "../../vault/services/vaultService";
import { scheduleClipboardClear } from "../../clipboard/clipboardService";
import type { GeneratorOptions, StrengthResult } from "../../vault/types/vault.types";
import styles from "./ImportDocumentModal.module.css";

interface ImportDocumentModalProps {
  onClose: () => void;
  onImported: () => void;
  chunkSizeMb?: number;
}

const ImportDocumentModal: React.FC<ImportDocumentModalProps> = ({
  onClose,
  onImported,
  chunkSizeMb = 4,
}) => {
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    name: string;
    size: number;
    ext: string;
  } | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [docPassword, setDocPassword] = useState("");
  const [docPasswordConfirm, setDocPasswordConfirm] = useState("");
  const [showDocPw, setShowDocPw] = useState(false);
  const [showDocPwConfirm, setShowDocPwConfirm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Password strength ──────────────────────────────────────────────────
  const [strength, setStrength] = useState<StrengthResult | null>(null);

  useEffect(() => {
    if (!hasPassword || !docPassword) {
      setStrength(null);
      return;
    }
    // Debounce the strength call so it doesn't fire on every keystroke
    const timer = setTimeout(async () => {
      try {
        const s = await estimatePasswordStrength(docPassword);
        setStrength(s);
      } catch {
        setStrength(null);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [docPassword, hasPassword]);

  // ── Password generator ─────────────────────────────────────────────────
  const [showGenerator, setShowGenerator] = useState(false);
  const [genOptions, setGenOptions] = useState<GeneratorOptions>({
    length: 20,
    include_lowercase: true,
    include_uppercase: true,
    include_numbers: true,
    include_symbols: true,
  });
  const [generatedPw, setGeneratedPw] = useState("");
  const [genStrength, setGenStrength] = useState<StrengthResult | null>(null);
  const [genCopied, setGenCopied] = useState(false);

  const generate = useCallback(async () => {
    try {
      const pw = await genPw(genOptions);
      setGeneratedPw(pw);
      setGenCopied(false);
      try {
        const s = await estimatePasswordStrength(pw);
        setGenStrength(s);
      } catch {
        setGenStrength(null);
      }
    } catch {
      setGeneratedPw("");
      setGenStrength(null);
    }
  }, [genOptions]);

  // Auto-generate when generator opens or options change
  useEffect(() => {
    if (showGenerator) generate();
  }, [showGenerator, generate]);

  const handleUseGenerated = () => {
    if (!generatedPw) return;
    setDocPassword(generatedPw);
    setDocPasswordConfirm(generatedPw);
    setShowGenerator(false);
  };

  const handleCopyGenerated = async () => {
    if (!generatedPw) return;
    await navigator.clipboard.writeText(generatedPw);
    scheduleClipboardClear();
    setGenCopied(true);
    setTimeout(() => setGenCopied(false), 2000);
  };

  // ── File picker via Tauri dialog ───────────────────────────────────────

  const handlePickFile = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open({
        title: "Select a document to encrypt",
        multiple: false,
        directory: false,
      });
      if (typeof result !== "string" || !result) return;

      // Extract filename and extension from path
      const segments = result.replace(/\\/g, "/").split("/");
      const fileName = segments[segments.length - 1] || "document";
      const dotIdx = fileName.lastIndexOf(".");
      const ext = dotIdx >= 0 ? fileName.slice(dotIdx) : "";
      const nameWithoutExt =
        dotIdx >= 0 ? fileName.slice(0, dotIdx) : fileName;

      setSelectedFile({
        path: result,
        name: fileName,
        size: 0, // We don't have file size from the dialog; Rust handles validation
        ext,
      });

      // Default the document name to filename without extension
      if (!documentName) {
        setDocumentName(nameWithoutExt);
      }
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [documentName]);

  // ── Import ─────────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!selectedFile) return;
    const name = documentName.trim() || selectedFile.name;

    // Validate password fields if password protection is enabled
    if (hasPassword) {
      if (!docPassword) {
        setError("Please enter a document password.");
        return;
      }
      if (docPassword.length < 4) {
        setError("Document password must be at least 4 characters.");
        return;
      }
      if (docPassword !== docPasswordConfirm) {
        setError("Passwords do not match.");
        return;
      }
    }

    setImporting(true);
    setError(null);

    try {
      await importDocument(
        selectedFile.path,
        name,
        hasPassword,
        chunkSizeMb,
        hasPassword ? docPassword : undefined
      );
      onImported();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }, [selectedFile, documentName, hasPassword, docPassword, docPasswordConfirm, chunkSizeMb, onImported]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>Import Document</h3>

        {/* File selection */}
        {!selectedFile ? (
          <button
            type="button"
            className={styles.dropZone}
            onClick={handlePickFile}
          >
            <svg
              className={styles.dropIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className={styles.dropText}>Click to select a file</span>
            <span className={styles.dropHint}>
              Supports any file type · Max 2 GB
            </span>
          </button>
        ) : (
          <div className={styles.filePreview}>
            <div className={styles.filePreviewIcon}>
              {selectedFile.ext.replace(/^\./, "").toUpperCase().slice(0, 4) ||
                "FILE"}
            </div>
            <div className={styles.filePreviewInfo}>
              <div className={styles.filePreviewName}>{selectedFile.name}</div>
              {selectedFile.size > 0 && (
                <div className={styles.filePreviewSize}>
                  {formatFileSize(selectedFile.size)}
                </div>
              )}
            </div>
            <button
              type="button"
              className={styles.fileRemoveBtn}
              onClick={() => {
                setSelectedFile(null);
                setDocumentName("");
              }}
              aria-label="Remove selected file"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Document name */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="doc-name">
            Document name
          </label>
          <input
            id="doc-name"
            type="text"
            className={styles.input}
            placeholder="Enter a display name…"
            value={documentName}
            onChange={(e) => setDocumentName(e.target.value)}
          />
        </div>

        {/* Password-protected checkbox */}
        <div className={styles.checkRow}>
          <input
            id="doc-has-pw"
            type="checkbox"
            checked={hasPassword}
            onChange={(e) => {
              setHasPassword(e.target.checked);
              if (!e.target.checked) {
                setDocPassword("");
                setDocPasswordConfirm("");
              }
            }}
          />
          <label
            htmlFor="doc-has-pw"
            className={styles.checkLabel}
          >
            Add password protection to this document
          </label>
        </div>

        {/* Password fields — shown when checkbox is checked */}
        {hasPassword && (
          <div className={styles.passwordSection}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="doc-pw">
                Document password
              </label>
              <div className={styles.inputWrapper}>
                <input
                  id="doc-pw"
                  type={showDocPw ? "text" : "password"}
                  className={styles.input}
                  placeholder="Enter password…"
                  value={docPassword}
                  onChange={(e) => setDocPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowDocPw((v) => !v)}
                  tabIndex={-1}
                  aria-label={showDocPw ? "Hide password" : "Show password"}
                >
                  {showDocPw ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Password strength meter */}
            {strength && docPassword && (
              <div className={styles.strengthMeter}>
                <div className={styles.strengthBars}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={styles.strengthBar}
                      style={{
                        backgroundColor:
                          i <= strength.score
                            ? ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"][strength.score]
                            : "var(--bg-tertiary, #333)",
                      }}
                    />
                  ))}
                </div>
                <span
                  className={styles.strengthLabel}
                  style={{
                    color: ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"][strength.score],
                  }}
                >
                  {["Very Weak", "Weak", "Fair", "Strong", "Very Strong"][strength.score]}
                  {" "}({Math.round(strength.entropy_bits)} bits)
                </span>
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label} htmlFor="doc-pw-confirm">
                Confirm password
              </label>
              <div className={styles.inputWrapper}>
                <input
                  id="doc-pw-confirm"
                  type={showDocPwConfirm ? "text" : "password"}
                  className={styles.input}
                  placeholder="Re-enter password…"
                  value={docPasswordConfirm}
                  onChange={(e) => setDocPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowDocPwConfirm((v) => !v)}
                  tabIndex={-1}
                  aria-label={showDocPwConfirm ? "Hide password" : "Show password"}
                >
                  {showDocPwConfirm ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <p className={styles.pwHint}>
              This password adds a second layer of encryption. You will need both 
              your vault master password AND this document password to open this file.
            </p>

            {/* Suggest / Generate password button */}
            <button
              type="button"
              className={styles.suggestBtn}
              onClick={() => setShowGenerator((v) => !v)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M12 12h.01" />
                <path d="M17 12h.01" />
                <path d="M7 12h.01" />
              </svg>
              {showGenerator ? "Hide Generator" : "Suggest a Password"}
            </button>

            {/* Inline password generator panel */}
            {showGenerator && (
              <div className={styles.generatorPanel}>
                <label className={styles.genSectionLabel}>Password Generator</label>

                <div className={styles.genOutput}>
                  <span className={styles.genPasswordText}>
                    {generatedPw || "—"}
                  </span>
                  <div className={styles.genOutputActions}>
                    <button type="button" className={styles.genSmallBtn} onClick={handleCopyGenerated}>
                      {genCopied ? "✓" : "Copy"}
                    </button>
                    <button type="button" className={styles.genSmallBtn} onClick={handleUseGenerated}>
                      Use
                    </button>
                  </div>
                </div>

                {/* Generated password strength */}
                {genStrength && (
                  <div className={styles.strengthMeter}>
                    <div className={styles.strengthBars}>
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={styles.strengthBar}
                          style={{
                            backgroundColor:
                              i <= genStrength.score
                                ? ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"][genStrength.score]
                                : "var(--bg-tertiary, #333)",
                          }}
                        />
                      ))}
                    </div>
                    <span
                      className={styles.strengthLabel}
                      style={{
                        color: ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"][genStrength.score],
                      }}
                    >
                      {["Very Weak", "Weak", "Fair", "Strong", "Very Strong"][genStrength.score]}
                      {" "}({Math.round(genStrength.entropy_bits)} bits)
                    </span>
                  </div>
                )}

                {/* Length slider */}
                <div className={styles.genControl}>
                  <label className={styles.genControlLabel}>
                    Length: <strong>{genOptions.length}</strong>
                  </label>
                  <input
                    type="range"
                    min={8}
                    max={128}
                    value={genOptions.length}
                    onChange={(e) =>
                      setGenOptions((o) => ({ ...o, length: Number(e.target.value) }))
                    }
                    className={styles.genSlider}
                  />
                </div>

                {/* Character toggles */}
                <div className={styles.genToggles}>
                  <label className={styles.genToggle}>
                    <input
                      type="checkbox"
                      checked={genOptions.include_lowercase}
                      onChange={(e) =>
                        setGenOptions((o) => ({ ...o, include_lowercase: e.target.checked }))
                      }
                    />
                    <span>Lowercase</span>
                  </label>
                  <label className={styles.genToggle}>
                    <input
                      type="checkbox"
                      checked={genOptions.include_uppercase}
                      onChange={(e) =>
                        setGenOptions((o) => ({ ...o, include_uppercase: e.target.checked }))
                      }
                    />
                    <span>Uppercase</span>
                  </label>
                  <label className={styles.genToggle}>
                    <input
                      type="checkbox"
                      checked={genOptions.include_numbers}
                      onChange={(e) =>
                        setGenOptions((o) => ({ ...o, include_numbers: e.target.checked }))
                      }
                    />
                    <span>Numbers</span>
                  </label>
                  <label className={styles.genToggle}>
                    <input
                      type="checkbox"
                      checked={genOptions.include_symbols}
                      onChange={(e) =>
                        setGenOptions((o) => ({ ...o, include_symbols: e.target.checked }))
                      }
                    />
                    <span>Symbols</span>
                  </label>
                </div>

                <button type="button" className={styles.genRegenerateBtn} onClick={generate}>
                  Regenerate
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && <div className={styles.error}>{error}</div>}

        {/* Importing indicator */}
        {importing && (
          <div className={styles.progress}>Encrypting and storing…</div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={importing}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.submitBtn}
            disabled={!selectedFile || importing}
            onClick={handleImport}
          >
            {importing ? "Importing…" : "Import & Encrypt"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportDocumentModal;
