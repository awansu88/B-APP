/**
 * Milestone 4 — Decision Pipeline types (pure domain; no React/RN/Expo/IO).
 *
 * The pipeline is deterministic: Module Results -> Data Quality Gate ->
 * Weighted Voting -> Family Correlation Cap -> Conflict Detection ->
 * Confidence Engine -> Risk Filter -> Prediction Draft (+ Active/Shadow trace).
 * It performs NO persistence, NO prediction locking, and NO result evaluation
 * (those are Milestone 5+).
 */
import { PredictionCategory, PredictionDecision } from '../models/enums';

/** Module families (correlated-evidence grouping for the family cap). */
export enum ModuleFamily {
  TREND = 'TREND', // streak, run-length, distribution
  ALTERNATION = 'ALTERNATION', // chop
  CONTEXT = 'CONTEXT', // regime-transition (context modifier)
  STRUCTURE = 'STRUCTURE', // derived-road (SHADOW_ONLY)
  RISK = 'RISK', // volatility (SHADOW_ONLY)
  HISTORICAL = 'HISTORICAL', // historical-matcher (DISABLED)
  QUALITY = 'QUALITY', // data-quality-guard (non-directional)
}

/** A directional side (never Tie). */
export enum VoteSide {
  PLAYER = 'PLAYER',
  BANKER = 'BANKER',
}

/** Data Quality Gate outcome. */
export enum DataQualityLevel {
  PASS = 'PASS',
  LIMIT = 'LIMIT',
  BLOCK = 'BLOCK',
}

/** Overall risk level assigned by the Risk Filter. */
export enum RiskLevel {
  NONE = 'NONE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/** Risk flags surfaced by the Risk Filter. */
export enum DecisionRiskFlag {
  LOW_MODULE_COUNT = 'LOW_MODULE_COUNT',
  SINGLE_FAMILY_SUPPORT = 'SINGLE_FAMILY_SUPPORT',
  MODERATE_CONFLICT = 'MODERATE_CONFLICT',
  STRONG_OPPOSITION = 'STRONG_OPPOSITION',
  REGIME_TRANSITION = 'REGIME_TRANSITION',
  MEDIUM_DATA_QUALITY = 'MEDIUM_DATA_QUALITY',
  RECENT_PATTERN_BREAK = 'RECENT_PATTERN_BREAK',
  LOW_SAMPLE_RELIABILITY = 'LOW_SAMPLE_RELIABILITY',
  CONFIDENCE_NEAR_THRESHOLD = 'CONFIDENCE_NEAR_THRESHOLD',
}

/** Structured reason codes recorded in the decision trace. */
export enum DecisionReason {
  DIRECTIONAL_CONSENSUS = 'DIRECTIONAL_CONSENSUS',
  BELOW_MIN_AGREEMENT = 'BELOW_MIN_AGREEMENT',
  INSUFFICIENT_DIRECTIONAL_MODULES = 'INSUFFICIENT_DIRECTIONAL_MODULES',
  INSUFFICIENT_EVIDENCE = 'INSUFFICIENT_EVIDENCE',
  NO_DIRECTIONAL_SIGNAL = 'NO_DIRECTIONAL_SIGNAL',
  DATA_QUALITY_PASS = 'DATA_QUALITY_PASS',
  DATA_QUALITY_LIMIT = 'DATA_QUALITY_LIMIT',
  DATA_QUALITY_BLOCK = 'DATA_QUALITY_BLOCK',
  STRONG_OPPOSITION_SKIP = 'STRONG_OPPOSITION_SKIP',
  MULTIPLE_RISK_SKIP = 'MULTIPLE_RISK_SKIP',
  CATEGORY_DOWNGRADED = 'CATEGORY_DOWNGRADED',
  RISK_RETAINED = 'RISK_RETAINED',
  NO_RISK = 'NO_RISK',
  SHADOW_VOLATILITY_SKIP = 'SHADOW_VOLATILITY_SKIP',
  SHADOW_VOLATILITY_DOWNGRADE = 'SHADOW_VOLATILITY_DOWNGRADE',
  SHADOW_MATCHES_ACTIVE = 'SHADOW_MATCHES_ACTIVE',
}

/** Per-family capped contribution to each side. */
export interface FamilyContribution {
  readonly family: ModuleFamily;
  readonly player: number;
  readonly banker: number;
  readonly moduleIds: readonly string[];
}

/** Raw data-quality signals fed to the Data Quality Gate. */
export interface DataQualityInput {
  readonly warmupMet: boolean;
  readonly winnerCompleteness: number;
  readonly pairCompleteness: number;
  readonly revisions: number;
  readonly missingRounds: number;
}

/** Non-voting context (regime/volatility/sample) needed by risk + gate. */
export interface DecisionContext {
  readonly nonTieCount: number;
  readonly regimeTransitioning: boolean;
  /** Volatility (SHADOW) signal — only ever affects the shadow record. */
  readonly recentPatternBreaks: number;
  readonly dataQuality: DataQualityInput;
}

/** Result of weighted voting + family cap + conflict detection. */
export interface VotingResult {
  readonly familyContributions: readonly FamilyContribution[];
  readonly playerScore: number;
  readonly bankerScore: number;
  readonly winner: VoteSide | null;
  readonly weightedAgreement: number;
  readonly conflictScore: number;
  readonly directionalModuleCount: number;
  readonly supportingFamilyCount: number;
  readonly opposingFamilyCount: number;
}

/** A single decision record (active or shadow). */
export interface DecisionRecord {
  readonly decision: PredictionDecision;
  readonly side: VoteSide | null;
  readonly confidence: number;
  readonly category: PredictionCategory;
  readonly riskScore: number;
  readonly riskLevel: RiskLevel;
  readonly riskFlags: readonly DecisionRiskFlag[];
  readonly reasonCodes: readonly DecisionReason[];
}

/** In-memory prediction DRAFT (never locked, never persisted in M4). */
export interface PredictionDraft {
  readonly isDraft: true;
  readonly decision: PredictionDecision;
  readonly side: VoteSide | null;
  readonly confidence: number;
  readonly category: PredictionCategory;
}

/** Complete deterministic decision result + trace. */
export interface DecisionResult {
  readonly votingVersion: string;
  readonly confidenceVersion: string;
  readonly riskVersion: string;
  readonly engineVersion: string;
  readonly configVersion: string;
  readonly decisionConfigVersion: string;
  // Voting trace
  readonly playerScore: number;
  readonly bankerScore: number;
  readonly weightedAgreement: number;
  readonly conflictScore: number;
  readonly familyContributions: readonly FamilyContribution[];
  readonly directionalModuleCount: number;
  readonly supportingFamilyCount: number;
  readonly opposingFamilyCount: number;
  // Gate + confidence trace
  readonly dataQualityLevel: DataQualityLevel;
  readonly rawConfidence: number;
  readonly rawCategory: PredictionCategory;
  // Decisions
  readonly active: DecisionRecord;
  readonly shadow: DecisionRecord;
  readonly draft: PredictionDraft;
}
