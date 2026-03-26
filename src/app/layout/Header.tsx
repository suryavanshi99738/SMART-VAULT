import React, { useCallback, useEffect, useRef, useState } from "react";
import type { VaultMeta } from "../../features/vault/services/multiVaultService";

interface HeaderProps {
	userName: string;
	onLock: () => void;
	sidebarCollapsed: boolean;
	onToggleSidebar: () => void;
	/** Current vault display name */
	vaultName?: string;
	/** All available vaults */
	vaults?: VaultMeta[];
	/** Currently active vault ID */
	currentVaultId?: string | null;
	/** Called when user wants to switch vaults */
	onSwitchVault?: () => void;
	/** Quick-switch: select a specific vault directly */
	onQuickSwitchVault?: (vaultId: string, vaultName: string) => void;
}

const Header: React.FC<HeaderProps> = ({
	userName,
	onLock,
	sidebarCollapsed,
	onToggleSidebar,
	vaultName,
	vaults,
	currentVaultId,
	onSwitchVault,
	onQuickSwitchVault,
}) => {
	const initial = userName.charAt(0).toUpperCase();
	const [showVaultDropdown, setShowVaultDropdown] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Close dropdown on outside click
	const handleClickOutside = useCallback((e: MouseEvent) => {
		if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
			setShowVaultDropdown(false);
		}
	}, []);

	useEffect(() => {
		if (showVaultDropdown) {
			document.addEventListener("mousedown", handleClickOutside);
		}
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [showVaultDropdown, handleClickOutside]);

	return (
		<header className="app-header">
			<div className="app-header-left">
				{sidebarCollapsed && (
					<button
						type="button"
						className="header-menu-btn"
						onClick={onToggleSidebar}
						aria-label="Open sidebar"
						title="Open sidebar"
					>
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<line x1="3" y1="12" x2="21" y2="12" />
							<line x1="3" y1="6" x2="21" y2="6" />
							<line x1="3" y1="18" x2="21" y2="18" />
						</svg>
					</button>
				)}
				<h1 className="app-title">Smart Vault</h1>

				{/* Vault name indicator + dropdown */}
				{vaultName && (
					<div className="header-vault-info" ref={dropdownRef}>
						<button
							type="button"
							className="header-vault-btn"
							onClick={() => setShowVaultDropdown((prev) => !prev)}
							title="Switch vault"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<rect x="2" y="6" width="20" height="14" rx="2" />
								<path d="M12 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" />
								<circle cx="12" cy="14" r="2" />
								<path d="M12 16v2" />
							</svg>
							<span className="header-vault-name">{vaultName}</span>
							<svg className={`header-vault-chevron${showVaultDropdown ? " header-vault-chevron--open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
								<polyline points="6 9 12 15 18 9" />
							</svg>
						</button>

						{showVaultDropdown && vaults && vaults.length > 0 && (
							<div className="header-vault-dropdown glass">
								{vaults.map((v) => (
									<button
										key={v.id}
										type="button"
										className={`header-vault-dropdown-item${v.id === currentVaultId ? " is-active" : ""}`}
										onClick={() => {
											if (v.id !== currentVaultId) {
												setShowVaultDropdown(false);
												onQuickSwitchVault?.(v.id, v.name);
											} else {
												setShowVaultDropdown(false);
											}
										}}
									>
										<span className="header-vault-dropdown-name">{v.name}</span>
										{v.id === currentVaultId && (
											<span className="header-vault-dropdown-badge">Active</span>
										)}
									</button>
								))}
								<div className="header-vault-dropdown-divider" />
								<button
									type="button"
									className="header-vault-dropdown-switch"
									onClick={() => {
										setShowVaultDropdown(false);
										onSwitchVault?.();
									}}
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
			</div>
			<div className="app-header-right">
				<button
					type="button"
					className="header-lock-btn"
					onClick={onLock}
					aria-label="Lock vault"
					title="Lock vault"
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
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
						<path d="M7 11V7a5 5 0 0 1 10 0v4" />
					</svg>
					Lock
				</button>
				<div className="header-user" aria-label={`Signed in as ${userName}`}>
					<span className="header-user-name">{userName}</span>
					<div className="header-avatar" aria-hidden="true">
						{initial}
					</div>
				</div>
			</div>
		</header>
	);
};

export default Header;
