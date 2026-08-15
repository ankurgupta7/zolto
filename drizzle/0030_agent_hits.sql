-- Who is reading the machine-facing surfaces (server/agentHits.ts).
--
-- Zolto publishes /llms.txt, /llms-full.txt and an MCP endpoint on the bet that
-- an AI agent will discover a store and buy from it. `orders.channel = 'agent'`
-- already records the ones that bought; nothing recorded the reach that comes
-- first, and no client-side analytics ever could — an agent fetching /llms.txt
-- never loads the SPA and never runs JavaScript, so a page-view script reports
-- zero for exactly the traffic this table is about.
--
-- Pre-aggregated: one row per (store, day, surface, tool, agent), incremented in
-- place by an upsert. /mcp is a hot path an agent can loop on, so a per-request
-- log on it would be an unbounded write amplifier on the one endpoint we least
-- want to slow down.
--
-- Both DEFAULTs below are load-bearing sentinels, not conveniences. MySQL treats
-- NULLs as distinct in a UNIQUE index, so a nullable `tenant_id` or `mcp_tool`
-- would stop ON DUPLICATE KEY UPDATE from ever firing for the platform surface
-- or for a non-MCP request — every hit would insert a new row and the table
-- would quietly become the per-request log it exists not to be.
--   tenant_id = 0 → the platform surface (zolto.ch), not a store; no tenants row
--                   has id 0, so it cannot collide with a real one.
--   mcp_tool = '' → this hit was not an MCP tools/call.
CREATE TABLE `agent_hits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL DEFAULT 0,
	`day` varchar(10) NOT NULL,
	`surface` varchar(32) NOT NULL,
	`mcp_tool` varchar(64) NOT NULL DEFAULT '',
	`agent` varchar(64) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_hits_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_hits_bucket` UNIQUE(`tenant_id`,`day`,`surface`,`mcp_tool`,`agent`)
);
