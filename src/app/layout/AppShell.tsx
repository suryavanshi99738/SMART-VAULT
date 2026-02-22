import React from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import type { SectionId } from "./Sidebar";

export interface AppShellProps {
	children: React.ReactNode;
	userName: string;
	onLock: () => void;
	activeSection: SectionId;
	onNavigate: (section: SectionId) => void;
	sidebarCollapsed: boolean;
	onToggleSidebar: () => void;
}

const AppShell: React.FC<AppShellProps> = ({
	children,
	userName,
	onLock,
	activeSection,
	onNavigate,
	sidebarCollapsed,
	onToggleSidebar,
}) => {
	return (
		<div className="app-root">
			<Sidebar
				activeSection={activeSection}
				onNavigate={onNavigate}
				collapsed={sidebarCollapsed}
				onCollapse={onToggleSidebar}
			/>
			<div className="app-main">
				<Header
					userName={userName}
					onLock={onLock}
					sidebarCollapsed={sidebarCollapsed}
					onToggleSidebar={onToggleSidebar}
				/>
				<main className="app-content" role="main">
					{children}
				</main>
			</div>
		</div>
	);
};

export default AppShell;

