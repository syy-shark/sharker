/**
 * Memory 系统 PostgreSQL schema 与迁移。
 */
import type { PGlite } from '@electric-sql/pglite'

const MIGRATION_V1 = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  root_path TEXT NOT NULL UNIQUE,
  name TEXT,
  tech_stack JSONB NOT NULL DEFAULT '[]',
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  label TEXT,
  is_home BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '新对话',
  custom_title TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_session_meta (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  active_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tool_call_id TEXT,
  tool_name TEXT,
  meta JSONB,
  seq INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_messages_session ON session_messages(session_id, seq);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'writer',
  confidence REAL NOT NULL DEFAULT 0.8,
  importance REAL NOT NULL DEFAULT 0.5,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  superseded_by TEXT REFERENCES memories(id) ON DELETE SET NULL,
  embedding_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ,
  access_count INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope, project_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_memories_active ON memories(superseded_by) WHERE superseded_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(content_hash);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_id TEXT,
  kind TEXT NOT NULL,
  tool_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS code_snippets (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  source_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  language TEXT,
  symbol TEXT,
  content TEXT NOT NULL,
  line_start INT,
  line_end INT,
  summary TEXT,
  tags JSONB NOT NULL DEFAULT '[]',
  embedding_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snippets_project ON code_snippets(project_id);
`

export async function runMigrations(db: PGlite): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)
  const row = await db.query<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1'
  )
  const current = row.rows[0]?.version ?? 0
  if (current >= 1) return

  await db.exec(MIGRATION_V1)
  await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [1])
}
