import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useBappData } from "@/src/workflows/backup/use-bapp-data";
import {
  buildExport,
  planMerge,
  serializeExport,
  validateExport,
  type BappExport,
  type ExportKind,
} from "@/src/domain/backup";
import type { MergePlan } from "@/src/domain/backup/merge";
import type { ValidationResult } from "@/src/domain/backup/validate";
import { ConfirmDialog } from "@/src/ui/history";
import { ActionButton, Banner, Card, Row, ScreenHeader, SectionLabel } from "@/src/ui/data/cards";
import { colors, radius, spacing } from "@/src/ui/theme";

/**
 * Export / Import-Merge / Restore (Milestone 6).
 * Web preview: Export + Validate + Merge-preview are enabled (zero writes);
 * destructive Merge/Restore APPLY is native-only (disabled + clearly labelled).
 */
export default function ExportScreen() {
  const { dataset, source, runtime, canWrite, loading, error, reload } = useBappData();

  const [exportDoc, setExportDoc] = useState<BappExport | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [importText, setImportText] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const jsonPreview = useMemo(() => (exportDoc ? serializeExport(exportDoc) : ""), [exportDoc]);

  const runExport = (kind: ExportKind) => {
    if (!dataset || !runtime) return;
    setMessage(null);
    setExportDoc(buildExport(dataset, { kind, source: runtime }));
    setShowJson(false);
  };

  const parseImport = (): unknown | null => {
    try {
      return JSON.parse(importText);
    } catch {
      return null;
    }
  };

  const parseError = (): ValidationResult => ({
    ok: false,
    errors: [{ code: "PARSE", message: "Import is not valid JSON." }],
    warnings: [],
    kind: null,
    counts: null,
  });

  const runValidate = () => {
    setPlan(null);
    setMessage(null);
    const parsed = parseImport();
    setValidation(parsed == null ? parseError() : validateExport(parsed));
  };

  const runMergePreview = () => {
    setMessage(null);
    const parsed = parseImport();
    if (parsed == null) {
      setValidation(parseError());
      setPlan(null);
      return;
    }
    const v = validateExport(parsed);
    setValidation(v);
    if (!v.ok || !dataset) {
      setPlan(null);
      return;
    }
    setPlan(planMerge(dataset, parsed as BappExport));
  };

  const applyMerge = async () => {
    if (!plan || !source) return;
    try {
      await source.applyMerge(plan);
      setMessage(
        `Merge applied: +${plan.report.shoesAdded} shoes, +${plan.report.roundsAdded} rounds, +${plan.report.predictionsAdded} predictions.`,
      );
      setPlan(null);
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const doRestore = async () => {
    setConfirmRestore(false);
    const parsed = parseImport();
    if (parsed == null || !source) return;
    const v = validateExport(parsed);
    setValidation(v);
    if (!v.ok) {
      setMessage("Restore aborted: import failed validation.");
      return;
    }
    try {
      const res = await source.restore(parsed as BappExport);
      setMessage(`Restore complete: ${res.shoes} shoes, ${res.rounds} rounds, ${res.lockedPredictions} predictions.`);
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={styles.screen} testID="screen-export">
      <ScreenHeader
        title="Export & Backup"
        subtitle="Versioned on-device export, import/merge and full backup / restore."
        icon="export-variant"
        testID="screen-export-title"
        right={<ActionButton label="Refresh" icon="refresh" onPress={reload} testID="export-refresh" />}
      />

      {runtime === "web-preview" ? (
        <View style={styles.bannerWrap}>
          <Banner
            tone="warn"
            testID="export-web-banner"
            text="Web preview: Export, Validate and Merge-preview are enabled. Merge / Restore writes are available on native SQLite runtime."
          />
        </View>
      ) : null}

      {loading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : error ? (
        <Text style={styles.error} testID="export-error">{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {message ? <Banner tone="info" text={message} testID="export-message" /> : null}

          <View style={styles.grid}>
            <Card title="Export" testID="export-actions" wide>
              <SectionLabel>Choose an export</SectionLabel>
              <View style={styles.actionRow}>
                <ActionButton label="Full Backup" icon="database-export" tone="primary" onPress={() => runExport("FULL_BACKUP")} testID="export-full" />
                <ActionButton label="History Export" icon="history" onPress={() => runExport("HISTORY")} testID="export-history" />
                <ActionButton label="Analysis Export" icon="chart-line" onPress={() => runExport("ANALYSIS")} testID="export-analysis" />
              </View>

              {exportDoc ? (
                <View style={styles.summary} testID="export-summary">
                  <Row label="Format" value={`${exportDoc.meta.format} · ${exportDoc.meta.formatVersion}`} />
                  <Row label="Kind" value={exportDoc.meta.kind} />
                  <Row label="Schema" value={exportDoc.meta.schemaVersion} />
                  <Row label="Source" value={exportDoc.meta.source} />
                  <Row label="Generated" value={exportDoc.meta.generatedAt} />
                  <SectionLabel>Record counts</SectionLabel>
                  <Row label="Shoes" value={exportDoc.meta.counts.shoes} />
                  <Row label="Rounds" value={exportDoc.meta.counts.rounds} />
                  <Row label="Revisions" value={exportDoc.meta.counts.revisions} />
                  <Row label="Locked predictions" value={exportDoc.meta.counts.lockedPredictions} />
                  <Row label="Session states" value={exportDoc.meta.counts.sessionStates} />
                  <View style={styles.actionRow}>
                    <ActionButton
                      label={showJson ? "Hide JSON" : "Show JSON"}
                      icon="code-json"
                      onPress={() => setShowJson((v) => !v)}
                      testID="export-toggle-json"
                    />
                  </View>
                  {showJson ? (
                    <ScrollView style={styles.jsonBox} nestedScrollEnabled>
                      <TextInput
                        style={styles.jsonText}
                        value={jsonPreview}
                        editable={false}
                        multiline
                        selectTextOnFocus
                        testID="export-json"
                      />
                    </ScrollView>
                  ) : null}
                </View>
              ) : null}
            </Card>

            <Card title="Import / Merge / Restore" testID="import-actions" wide>
              <SectionLabel>Paste a B-APP export</SectionLabel>
              <TextInput
                style={styles.importInput}
                value={importText}
                onChangeText={setImportText}
                placeholder="Paste exported .bapp JSON here…"
                placeholderTextColor={colors.textMuted}
                multiline
                testID="import-input"
              />
              <View style={styles.actionRow}>
                <ActionButton label="Validate Import" icon="check-decagram" onPress={runValidate} testID="import-validate" />
                <ActionButton label="Merge Preview" icon="merge" onPress={runMergePreview} testID="import-merge-preview" />
                <ActionButton
                  label="Restore Backup"
                  icon="backup-restore"
                  tone="danger"
                  disabled={!canWrite}
                  onPress={() => setConfirmRestore(true)}
                  testID="import-restore"
                />
              </View>
              {!canWrite ? (
                <Text style={styles.note} testID="write-unavailable-note">
                  Merge / Restore writes: Available on native SQLite runtime.
                </Text>
              ) : null}

              {validation ? (
                <View style={styles.summary} testID="import-validation">
                  <Row
                    label="Validation"
                    value={validation.ok ? "PASSED" : "FAILED"}
                    valueColor={validation.ok ? colors.tie : colors.banker}
                    testID="validation-status"
                  />
                  {validation.kind ? <Row label="Kind" value={validation.kind} /> : null}
                  {validation.counts ? (
                    <Row
                      label="Counts (sh/rd/rv/lp/ss)"
                      value={`${validation.counts.shoes}/${validation.counts.rounds}/${validation.counts.revisions}/${validation.counts.lockedPredictions}/${validation.counts.sessionStates}`}
                    />
                  ) : null}
                  {validation.errors.slice(0, 6).map((e, i) => (
                    <Text key={`e${i}`} style={styles.errLine}>{`✖ ${e.code}: ${e.message}`}</Text>
                  ))}
                  {validation.warnings.slice(0, 4).map((w, i) => (
                    <Text key={`w${i}`} style={styles.warnLine}>{`⚠ ${w.code}: ${w.message}`}</Text>
                  ))}
                </View>
              ) : null}

              {plan ? (
                <View style={styles.summary} testID="merge-report">
                  <SectionLabel>Merge report</SectionLabel>
                  <Row label="Shoes read / added" value={`${plan.report.shoesRead} / ${plan.report.shoesAdded}`} />
                  <Row label="Rounds read / added" value={`${plan.report.roundsRead} / ${plan.report.roundsAdded}`} />
                  <Row label="Predictions read / added" value={`${plan.report.predictionsRead} / ${plan.report.predictionsAdded}`} />
                  <Row label="Duplicates skipped" value={plan.report.duplicatesSkipped} />
                  <Row label="Conflicts" value={plan.report.conflicts.length} valueColor={plan.report.conflicts.length ? colors.banker : colors.tie} />
                  <Row label="Invalid records" value={plan.report.invalidRecords.length} valueColor={plan.report.invalidRecords.length ? colors.banker : colors.tie} />
                  <Row label="Safe to apply" value={plan.safe ? "YES" : "NO"} valueColor={plan.safe ? colors.tie : colors.banker} testID="merge-safe" />
                  <View style={styles.actionRow}>
                    <ActionButton
                      label="Apply Merge"
                      icon="content-save-move"
                      tone="primary"
                      disabled={!canWrite || !plan.safe}
                      onPress={applyMerge}
                      testID="merge-apply"
                    />
                  </View>
                </View>
              ) : null}
            </Card>
          </View>
        </ScrollView>
      )}

      <ConfirmDialog
        visible={confirmRestore}
        title="Restore from backup?"
        message="This permanently REPLACES all current local data with the pasted Full Backup. This cannot be undone."
        confirmLabel="Restore (replace all)"
        destructive
        onCancel={() => setConfirmRestore(false)}
        onConfirm={doRestore}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  bannerWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  content: { padding: spacing.lg, gap: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  summary: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 2,
  },
  importInput: {
    minHeight: 96,
    maxHeight: 200,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 12,
    padding: spacing.md,
    textAlignVertical: "top",
  },
  jsonBox: {
    maxHeight: 220,
    marginTop: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  jsonText: { color: colors.textSecondary, fontSize: 11, padding: spacing.sm },
  note: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
  errLine: { color: colors.banker, fontSize: 12, marginTop: 2 },
  warnLine: { color: "#D9A441", fontSize: 12, marginTop: 2 },
  muted: { color: colors.textSecondary, fontSize: 13, padding: spacing.lg },
  error: { color: colors.banker, fontSize: 13, padding: spacing.lg },
});
