import React from "react";
import type { VaultEntry } from "../types/vault.types";
import PasswordItem from "./PasswordItem";
import styles from "./PasswordList.module.css";

interface PasswordListProps {
  entries: VaultEntry[];
  search: string;
  onEdit: (entry: VaultEntry) => void;
  onDelete: (id: string) => void;
}

const PasswordList: React.FC<PasswordListProps> = ({
  entries,
  search,
  onEdit,
  onDelete,
}) => {
  const query = search.toLowerCase().trim();

  const filtered = query
    ? entries.filter(
        (e) =>
          e.service_name.toLowerCase().includes(query) ||
          e.username.toLowerCase().includes(query) ||
          e.email.toLowerCase().includes(query)
      )
    : entries;

  if (filtered.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>
          {query
            ? "No entries match your search."
            : "Your vault is empty. Add your first password."}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {filtered.map((entry, i) => (
        <div key={entry.id} style={{ animationDelay: `${i * 40}ms` }}>
          <PasswordItem entry={entry} onEdit={onEdit} onDelete={onDelete} />
        </div>
      ))}
    </div>
  );
};

export default PasswordList;
