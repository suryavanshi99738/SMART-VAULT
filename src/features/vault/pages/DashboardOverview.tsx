import React, { useEffect } from "react";
import { useVault } from "../hooks/useVault";
import styles from "./DashboardOverview.module.css";

const DashboardOverview: React.FC = () => {
  const { state, fetchEntries } = useVault();

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = state.entries.length;

  // Count unique services
  const uniqueServices = new Set(
    state.entries.map((e) => e.service_name.toLowerCase())
  ).size;

  // Count categories
  const categoryMap = new Map<string, number>();
  state.entries.forEach((e) => {
    const cat = e.category || "General";
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
  });
  const categoryCount = categoryMap.size;

  // Most recently added (up to 5)
  const recent = [...state.entries]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 5);

  // Format timestamp to readable date
  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>Dashboard</h2>
      <p className={styles.subtitle}>
        Overview of your stored credentials.
      </p>

      {/* ── Stat Cards ─────────────────────────────────── */}
      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{total}</span>
          <span className={styles.statLabel}>Total Entries</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{uniqueServices}</span>
          <span className={styles.statLabel}>Unique Services</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{categoryCount}</span>
          <span className={styles.statLabel}>Categories</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>
            {recent.length > 0 ? formatDate(recent[0].created_at) : "—"}
          </span>
          <span className={styles.statLabel}>Last Added</span>
        </div>
      </div>

      {/* ── Recent Entries Table ────────────────────────── */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Recently Added</h3>

        {state.loading && total === 0 && (
          <p className={styles.emptyText}>Loading…</p>
        )}

        {!state.loading && total === 0 && (
          <p className={styles.emptyText}>
            No passwords stored yet. Head to the <strong>Vault</strong> section
            to add your first entry.
          </p>
        )}

        {recent.length > 0 && (
          <div className={styles.table}>
            <div className={`${styles.tableRow} ${styles.tableHeader}`}>
              <span className={styles.cellService}>Service</span>
              <span className={styles.cellUser}>Username</span>
              <span className={styles.cellUser}>Email</span>
              <span className={styles.cellUser}>Category</span>
              <span className={styles.cellDate}>Date Added</span>
            </div>
            {recent.map((entry) => (
              <div key={entry.id} className={styles.tableRow}>
                <span className={styles.cellService}>
                  <span className={styles.serviceDot} aria-hidden="true" />
                  {entry.service_name}
                </span>
                <span className={styles.cellUser}>{entry.username}</span>
                <span className={styles.cellUser}>{entry.email}</span>
                <span className={styles.cellUser}>{entry.category || "General"}</span>
                <span className={styles.cellDate}>
                  {formatDate(entry.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── All Stored Services ──────────────────────────── */}
      {total > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            All Stored Services ({total})
          </h3>
          <div className={styles.chips}>
            {state.entries.map((entry) => (
              <div key={entry.id} className={styles.chip}>
                <span className={styles.chipInitial}>
                  {entry.service_name.charAt(0).toUpperCase()}
                </span>
                <div className={styles.chipInfo}>
                  <span className={styles.chipName}>
                    {entry.service_name}
                  </span>
                  <span className={styles.chipUser}>{entry.username}</span>
                  {entry.email && (
                    <span className={styles.chipUser}>{entry.email}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardOverview;
