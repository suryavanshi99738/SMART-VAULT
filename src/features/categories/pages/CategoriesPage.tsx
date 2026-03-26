import React, { useEffect, useState } from "react";
import { useVault } from "../../vault/hooks/useVault";
import type { VaultEntry } from "../../vault/types/vault.types";
import styles from "./CategoriesPage.module.css";

const CategoriesPage: React.FC = () => {
  const { state, fetchEntries } = useVault();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build category → entries map
  const categoryMap = new Map<string, VaultEntry[]>();
  state.entries.forEach((e) => {
    const cat = e.category || "General";
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, []);
    }
    categoryMap.get(cat)!.push(e);
  });

  const categories = Array.from(categoryMap.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  if (selectedCategory && categoryMap.has(selectedCategory)) {
    const entries = categoryMap.get(selectedCategory)!;
    return (
      <div className={styles.page}>
        <h2 className={styles.heading}>Categories</h2>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => setSelectedCategory(null)}
        >
          ← All Categories
        </button>

        <div className={styles.entrySection}>
          <h3 className={styles.entrySectionTitle}>
            {selectedCategory} ({entries.length})
          </h3>
          <div className={styles.entryList}>
            {entries.map((entry) => (
              <div key={entry.id} className={styles.entryRow}>
                <div className={styles.entryAvatar}>
                  {entry.service_name.charAt(0).toUpperCase()}
                </div>
                <div className={styles.entryInfo}>
                  <span className={styles.entryService}>
                    {entry.service_name}
                  </span>
                  <span className={styles.entryUser}>
                    {entry.username}
                    {entry.email ? ` · ${entry.email}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>Categories</h2>
      <p className={styles.subtitle}>
        Browse your vault entries organized by category.
      </p>

      {categories.length === 0 && (
        <p className={styles.emptyText}>
          No entries yet. Add passwords in the Vault section to see them here.
        </p>
      )}

      <div className={styles.grid}>
        {categories.map(([category, entries]) => (
          <div
            key={category}
            className={`${styles.card} glass`}
            onClick={() => setSelectedCategory(category)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                setSelectedCategory(category);
            }}
          >
            <div className={styles.cardHeader}>
              <div className={styles.cardIcon}>
                {category.charAt(0).toUpperCase()}
              </div>
              <span className={styles.cardName}>{category}</span>
            </div>
            <span className={styles.cardCount}>
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CategoriesPage;
