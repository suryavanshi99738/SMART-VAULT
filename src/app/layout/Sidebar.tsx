import React from "react";

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
}

const Sidebar: React.FC<SidebarProps> = ({
	activeSection,
	onNavigate,
	collapsed,
	onCollapse,
}) => {
	return (
		<aside
			className={`sidebar${collapsed ? " sidebar-collapsed" : ""}`}
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

