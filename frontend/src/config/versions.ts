/**
 * B-APP Baccarat Engine — Version Registry (LOCKED, Milestone 0).
 *
 * Every subsystem carries an immutable version tag. These values are part of
 * the locked architecture and MUST NOT be changed silently. Bumping any value
 * requires an explicit, documented milestone decision (see AGENTS.md).
 */
export const VERSION_REGISTRY = Object.freeze({
  /** Application semantic version. */
  app: '0.1.0',
  /** Prediction engine version. */
  engine: 'ENGINE-001',
  /** Prediction configuration version (immutable during a test batch). */
  config: 'CFG-001',
  /** Local database schema version. */
  databaseSchema: 'DB-002',
  /** Roadmap reconstruction version. */
  roadmap: 'ROADMAP-001',
  /** Feature extraction version. */
  feature: 'FEATURE-001',
  /** Voting aggregation version. */
  voting: 'VOTE-001',
  /** Confidence calibration version. */
  confidence: 'CONF-001',
  /** Risk model version. */
  risk: 'RISK-001',
} as const);

export type VersionRegistry = typeof VERSION_REGISTRY;
