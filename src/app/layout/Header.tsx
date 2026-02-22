import React from "react";

interface HeaderProps {
	userName: string;
	onLock: () => void;
	sidebarCollapsed: boolean;
	onToggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({
	userName,
	onLock,
	sidebarCollapsed,
	onToggleSidebar,
}) => {
	const initial = userName.charAt(0).toUpperCase();

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

