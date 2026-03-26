import React, { useCallback, useEffect, useState } from "react";
import {
  generatePassword as genPw,
  estimatePasswordStrength,
} from "../services/vaultService";
import { scheduleClipboardClear } from "../../clipboard/clipboardService";
import type { GeneratorOptions, StrengthResult } from "../types/vault.types";
import styles from "./PasswordGenerator.module.css";

interface PasswordGeneratorProps {
  onUse: (password: string) => void;
}

const defaults: GeneratorOptions = {
  length: 20,
  include_lowercase: true,
  include_uppercase: true,
  include_numbers: true,
  include_symbols: true,
};

const strengthColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"];
const strengthLabels = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];

const PasswordGenerator: React.FC<PasswordGeneratorProps> = ({ onUse }) => {
  const [options, setOptions] = useState<GeneratorOptions>(defaults);
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [strength, setStrength] = useState<StrengthResult | null>(null);

  const generate = useCallback(async () => {
    try {
      const pw = await genPw(options);
      setPassword(pw);
      setCopied(false);
      // Estimate strength
      try {
        const s = await estimatePasswordStrength(pw);
        setStrength(s);
      } catch {
        setStrength(null);
      }
    } catch {
      setPassword("");
      setStrength(null);
    }
  }, [options]);

  // Auto-generate on mount and when options change
  useEffect(() => {
    generate();
  }, [generate]);

  const handleCopy = async () => {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setCopied(true);
    scheduleClipboardClear();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`${styles.wrapper} glass`}>
      <label className={styles.sectionLabel}>Password Generator</label>

      <div className={styles.output}>
        <span className={styles.passwordText}>
          {password || "—"}
        </span>
        <div className={styles.outputActions}>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={handleCopy}
            title="Copy"
          >
            {copied ? "✓" : "Copy"}
          </button>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() => onUse(password)}
            title="Use this password"
          >
            Use
          </button>
        </div>
      </div>

      {/* Strength meter */}
      {strength && (
        <div className={styles.strengthMeter}>
          <div className={styles.strengthBars}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={styles.strengthBar}
                style={{
                  backgroundColor:
                    i <= strength.score
                      ? strengthColors[strength.score]
                      : "var(--color-surface-alt, #333)",
                }}
              />
            ))}
          </div>
          <span
            className={styles.strengthLabel}
            style={{ color: strengthColors[strength.score] }}
          >
            {strengthLabels[strength.score]} ({Math.round(strength.entropy_bits)} bits)
          </span>
        </div>
      )}

      {/* Length slider */}
      <div className={styles.control}>
        <label className={styles.controlLabel}>
          Length: <strong>{options.length}</strong>
        </label>
        <input
          type="range"
          min={8}
          max={128}
          value={options.length}
          onChange={(e) =>
            setOptions((o) => ({ ...o, length: Number(e.target.value) }))
          }
          className={styles.slider}
        />
      </div>

      {/* Toggles */}
      <div className={styles.toggles}>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={options.include_lowercase}
            onChange={(e) =>
              setOptions((o) => ({ ...o, include_lowercase: e.target.checked }))
            }
          />
          <span>Lowercase</span>
        </label>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={options.include_uppercase}
            onChange={(e) =>
              setOptions((o) => ({ ...o, include_uppercase: e.target.checked }))
            }
          />
          <span>Uppercase</span>
        </label>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={options.include_numbers}
            onChange={(e) =>
              setOptions((o) => ({ ...o, include_numbers: e.target.checked }))
            }
          />
          <span>Numbers</span>
        </label>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={options.include_symbols}
            onChange={(e) =>
              setOptions((o) => ({ ...o, include_symbols: e.target.checked }))
            }
          />
          <span>Symbols</span>
        </label>
      </div>

      <button
        type="button"
        className={styles.generateBtn}
        onClick={generate}
      >
        Regenerate
      </button>
    </div>
  );
};

export default PasswordGenerator;
