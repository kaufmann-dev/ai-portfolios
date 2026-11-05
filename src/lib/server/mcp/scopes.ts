/** OAuth scopes guarding the tools. Tokens only see and call the tools their scopes allow. */
export const MCP_SCOPES = {
	'portfolios:read': 'View portfolios, holdings, performance, and prices',
	'portfolios:write': 'Create portfolios and submit rebalances',
	'strategies:read': 'Read hosted strategies',
	'strategies:write': 'Create and edit hosted strategies'
} as const;

export type McpScope = keyof typeof MCP_SCOPES;

export const TOOL_SCOPES: Record<string, McpScope> = {
	list_portfolios: 'portfolios:read',
	get_portfolio: 'portfolios:read',
	get_prices: 'portfolios:read',
	get_price_history: 'portfolios:read',
	screen_movers: 'portfolios:read',
	validate_tickers: 'portfolios:read',
	create_portfolio: 'portfolios:write',
	submit_portfolio: 'portfolios:write',
	list_strategies: 'strategies:read',
	get_strategy: 'strategies:read',
	create_strategy: 'strategies:write',
	update_strategy: 'strategies:write'
};
