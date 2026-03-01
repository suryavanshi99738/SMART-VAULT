import React from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import type { SectionId } from "./Sidebar";
import type { VaultMeta } from "../../features/vault/services/multiVaultService";

export interface AppShellProps {
	children: React.ReactNode;
	userName: string;
	onLock: () => void;
	activeSection: SectionId;
	onNavigate: (section: SectionId) => void;
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
	/** Quick-switch: select a specific vault and go to its login */
	onQuickSwitchVault?: (vaultId: string, vaultName: string) => void;
}

const AppShell: React.FC<AppShellProps> = ({
	children,
	userName,
	onLock,
	activeSection,
	onNavigate,
	sidebarCollapsed,
	onToggleSidebar,
	vaultName,
	vaults,
	currentVaultId,
	onSwitchVault,
	onQuickSwitchVault,
}) => {
	return (
		<div className="app-root">
			<Sidebar
				activeSection={activeSection}
				onNavigate={onNavigate}
				collapsed={sidebarCollapsed}
				onCollapse={onToggleSidebar}
				vaults={vaults}
				currentVaultId={currentVaultId}
				onSwitchVault={onSwitchVault}
				onQuickSwitchVault={onQuickSwitchVault}
			/>
			<div className="app-main">
				<Header
					userName={userName}
					onLock={onLock}
					sidebarCollapsed={sidebarCollapsed}
					onToggleSidebar={onToggleSidebar}
					vaultName={vaultName}
					vaults={vaults}
					currentVaultId={currentVaultId}
					onSwitchVault={onSwitchVault}
					onQuickSwitchVault={onQuickSwitchVault}
				/>
				<main className="app-content" role="main">
					{children}
				</main>
			</div>
		</div>
	);
};

export default AppShell;
