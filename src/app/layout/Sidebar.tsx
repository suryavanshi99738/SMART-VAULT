import React, { useState } from "react";
import type { VaultMeta } from "../../features/vault/services/multiVaultService";

export type SectionId = "dashboard" | "vault" | "documents" | "categories" | "settings";

interface SidebarItem {
	id: SectionId;
	label: string;
	icon: React.ReactNode;
}

const navItems: SidebarItem[] = [
	{
		id: "dashboard",
		label: "Dashboard",
		icon: (
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
		),
	},
	{
		id: "vault",
		label: "Vault",
		icon: (
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
		),
	},
	{
		id: "documents",
		label: "Documents",
		icon: (
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
		),
	},
	{
		id: "categories",
		label: "Categories",
		icon: (
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
		),
	},
	{
		id: "settings",
		label: "Settings",
		icon: (
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
		),
	},
];

interface SidebarProps {
	activeSection: SectionId;
	onNavigate: (section: SectionId) => void;
	collapsed: boolean;
	onCollapse: () => void;
	/** All available vaults (for the vault list section). */
	vaults?: VaultMeta[];
	/** Currently active vault ID. */
	currentVaultId?: string | null;
	/** Called when user clicks "Switch Vault". */
	onSwitchVault?: () => void;
	/** Quick-switch: select a specific vault directly */
	onQuickSwitchVault?: (vaultId: string, vaultName: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
	activeSection,
	onNavigate,
	collapsed,
	onCollapse,
	vaults,
	currentVaultId,
	onSwitchVault,
	onQuickSwitchVault,
}) => {
	const showVaultsDropdown = vaults && vaults.length > 0 && !collapsed;
	const [vaultsOpen, setVaultsOpen] = useState(false);

	return (
		<aside
			className={`sidebar glass${collapsed ? " sidebar-collapsed" : ""}`}
			aria-label="Main navigation"
		>
			<div className="sidebar-header">
				<span className="sidebar-title">{collapsed ? "" : "Navigation"}</span>
				<button
					type="button"
					className="sidebar-collapse-btn"
					onClick={onCollapse}
					aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className={`sidebar-collapse-icon${collapsed ? " sidebar-collapse-icon-flipped" : ""}`}
					>
						<polyline points="11 17 6 12 11 7" />
						<polyline points="18 17 13 12 18 7" />
					</svg>
				</button>
			</div>

			{/* ── Vault dropdown section ─────────────────── */}
			{showVaultsDropdown && (
				<div className="sidebar-vaults-section">
					<button
						type="button"
						className="sidebar-vaults-trigger"
						onClick={() => setVaultsOpen((o) => !o)}
						aria-expanded={vaultsOpen}
					>
						<svg className="sidebar-vaults-trigger-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<rect x="2" y="6" width="20" height="14" rx="2" />
							<path d="M12 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" />
							<circle cx="12" cy="14" r="2" />
							<path d="M12 16v2" />
						</svg>
						<span className="sidebar-vaults-trigger-name">
						My Vaults
						</span>
						<svg className={`sidebar-vaults-chevron${vaultsOpen ? " sidebar-vaults-chevron--open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
							<polyline points="6 9 12 15 18 9" />
						</svg>
					</button>

					{vaultsOpen && (
						<div className="sidebar-vaults-list">
							{vaults.map((v) => (
								<button
									key={v.id}
									type="button"
									className={`sidebar-vault-item${v.id === currentVaultId ? " sidebar-vault-item--active" : ""}`}
									onClick={() => {
										if (v.id !== currentVaultId) {
											setVaultsOpen(false);
											onQuickSwitchVault?.(v.id, v.name);
										} else {
											setVaultsOpen(false);
										}
									}}
									title={v.id === currentVaultId ? `${v.name} (active)` : `Switch to ${v.name}`}
								>
									<svg className="sidebar-vault-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<rect x="2" y="6" width="20" height="14" rx="2" />
										<path d="M12 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" />
										<circle cx="12" cy="14" r="2" />
										<path d="M12 16v2" />
									</svg>
									<span className="sidebar-vault-name">{v.name}</span>
									{v.id === currentVaultId && (
										<span className="sidebar-vault-badge" />
									)}
								</button>
							))}
							<div className="sidebar-vaults-divider" />
							<button
								type="button"
								className="sidebar-switch-btn"
								onClick={() => {
									setVaultsOpen(false);
									onSwitchVault?.();
								}}
							>
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<polyline points="1 4 1 10 7 10" />
									<polyline points="23 20 23 14 17 14" />
									<path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
								</svg>
								Manage Vaults
							</button>
						</div>
					)}
				</div>
			)}

			<nav className="sidebar-nav">
				{navItems.map((item) => (
					<button
						key={item.id}
						type="button"
						className={`sidebar-nav-item${item.id === activeSection ? " is-active" : ""}`}
						onClick={() => onNavigate(item.id)}
						title={collapsed ? item.label : undefined}
					>
						<span className="sidebar-nav-icon">{item.icon}</span>
						<span className="sidebar-nav-label">{item.label}</span>
					</button>
				))}
			</nav>
		</aside>
	);
};

export default Sidebar;
