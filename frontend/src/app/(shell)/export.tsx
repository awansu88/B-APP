import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useBappData } from "@/src/workflows/backup/use-bapp-data";
import {
  buildExport,
  exportFileName,
  inspectImport,
  rawSqliteFileName,
  serializeExport,
  type BappExport,
  type ExportKind,
  type ImportInspection,
} from "@/src/domain/backup";
import {
  deriveImportView,
  idleImportView,
} from "@/src/workflows/backup/import-view-model";
import * as filePortability from "@/src/workflows/backup/file-portability";
import { ConfirmDialog } from "@/src/ui/history";
import { ActionButton, Banner, Card, Row, ScreenHeader, SectionLabel } from "@/src/ui/data/cards";
import { colors, radius, spacing } from "@/src/ui/theme";

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

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
  const [inspection, setInspection] = useState<ImportInspection | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [busy, setBusy] = useState(false);

  const jsonPreview = useMemo(() => (exportDoc ? serializeExport(exportDoc) : ""), [exportDoc]);
  const validation = inspection?.validation ?? null;
  const summary = inspection?.summary ?? null;
  const view = inspection ? deriveImportView(inspection, canWrite) : idleImportView();
  const rawSupported = filePortability.rawSqliteExportSupported && Boolean(source?.serializeDatabase);

  // Build a preview doc (also used to render counts + Show JSON fallback).
  const runExport = (kind: ExportKind) => {
    if (!dataset || !runtime) return null;
    const doc = buildExport(dataset, { kind, source: runtime });
    setExportDoc(doc);
    setShowJson(false);
    return doc;
  };

  // Save an export to a user-chosen file (SAF folder on native; download on web).
  const saveExport = async (kind: ExportKind) => {
    const doc = runExport(kind);
    if (!doc) return;
    setBusy(true);
    setMessage(null);
    try {
      const name = exportFileName(kind);
      const res = await filePortability.saveTextFile(name, serializeExport(doc), "application/json");
      setMessage(res.cancelled ? "Save cancelled." : `Saved ${name}${res.uri ? ` → ${res.uri}` : ""}`);
    } catch (e) {
      setMessage(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // Inspect an import body (paste or picked file). Zero-write.
  const inspect = (text: string, fileName: string | null) => {
    setMessage(null);
    setImportText(text);
    setInspection(inspectImport(fileName, text, dataset));
  };

  const runValidate = () => inspect(importText, null);

  const chooseFile = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const picked = await filePortability.pickTextFile();
      if (!picked) {
        setMessage("No file selected.");
        return;
      }
      inspect(picked.text, picked.name);
    } catch (e) {
      setMessage(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const applyMerge = async () => {
    if (!inspection?.plan || !source) return;
    try {
      const r = inspection.plan.report;
      await source.applyMerge(inspection.plan);
      setMessage(
        `Merge applied: +${r.shoesAdded} shoes, +${r.roundsAdded} rounds, +${r.predictionsAdded} predictions.`,
      );
      setInspection(null);
      setImportText("");
      await reload();
    } catch (e) {
      setMessage(errMsg(e));
    }
  };

  const doRestore = async () => {
    setConfirmRestore(false);
    if (!inspection?.parsed || !source) return;
    if (!inspection.ok) {
      setMessage("Restore aborted: import failed validation.");
      return;
    }
    try {
      const res = await source.restore(inspection.parsed);
      setMessage(`Restore complete: ${res.shoes} shoes, ${res.rounds} rounds, ${res.lockedPredictions} predictions.`);
      setInspection(null);
      setImportText("");
      await reload();
    } catch (e) {
      setMessage(errMsg(e));
    }
  };

  const exportRaw = async () => {
    if (!source?.serializeDatabase) {
      setMessage("Raw SQLite export is available on the native SQLite runtime.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const bytes = await source.serializeDatabase();
      const name = rawSqliteFileName();
      const res = await filePortability.saveBinaryFile(name, bytes, "application/octet-stream");
      setMessage(res.cancelled ? "Save cancelled." : `Saved raw snapshot ${name}${res.uri ? ` → ${res.uri}` : ""}`);
    } catch (e) {
      setMessage(errMsg(e));
    } finally {
      setBusy(false);
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
            text="Web preview: files download/upload through the browser (EXPORT-001). Native-style transactional Merge / Restore writes remain available only on the native SQLite runtime."
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
            <Card title="Export / Backup" testID="export-actions" wide>
              <SectionLabel>Save a portable backup file (.bappbackup)</SectionLabel>
              <View style={styles.actionRow}>
                <ActionButton label="Save Backup File" icon="database-export" tone="primary" disabled={busy} onPress={() => saveExport("FULL_BACKUP")} testID="export-save-full" />
                <ActionButton label="Save History File" icon="history" disabled={busy} onPress={() => saveExport("HISTORY")} testID="export-save-history" />
                <ActionButton label="Save Analysis File" icon="chart-line" disabled={busy} onPress={() => saveExport("ANALYSIS")} testID="export-save-analysis" />
              </View>
              <Text style={styles.note}>
                {runtime === "web-preview"
                  ? "Downloads through your browser."
                  : "Choose a destination folder (Downloads, Drive, Files…) via the system dialog."}
              </Text>

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

            <Card title="Import / Restore" testID="import-actions" wide>
              <SectionLabel>Choose a backup file to import</SectionLabel>
              <View style={styles.actionRow}>
                <ActionButton label="Choose Backup File" icon="file-upload" tone="primary" disabled={busy} onPress={chooseFile} testID="import-choose-file" />
              </View>
              {view.fileName ? (
                <Text style={styles.note} testID="import-selected-file">{`Selected: ${view.fileName}`}</Text>
              ) : null}

              <SectionLabel>Or paste an export</SectionLabel>
              <TextInput
                style={styles.importInput}
                value={importText}
                onChangeText={setImportText}
                placeholder="Paste exported EXPORT-001 JSON here…"
                placeholderTextColor={colors.textMuted}
                multiline
                testID="import-input"
              />
              <View style={styles.actionRow}>
                <ActionButton label="Validate" icon="check-decagram" disabled={busy} onPress={runValidate} testID="import-validate" />
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
                    value={validation.ok ? "VALID" : "INVALID"}
                    valueColor={validation.ok ? colors.tie : colors.banker}
                    testID="validation-status"
                  />
                  {validation.errors.slice(0, 6).map((e, i) => (
                    <Text key={`e${i}`} style={styles.errLine}>{`✖ ${e.code}: ${e.message}`}</Text>
                  ))}
                  {validation.warnings.slice(0, 4).map((w, i) => (
                    <Text key={`w${i}`} style={styles.warnLine}>{`⚠ ${w.code}: ${w.message}`}</Text>
                  ))}
                </View>
              ) : null}

              {summary && validation?.ok ? (
                <View style={styles.summary} testID="import-summary">
                  <SectionLabel>Import summary</SectionLabel>
                  <Row label="File" value={summary.fileName ?? "(pasted)"} />
                  <Row label="Type" value={summary.type ?? "—"} />
                  <Row label="Export version" value={summary.exportVersion ?? "—"} />
                  <Row label="Shoes" value={summary.shoes} />
                  <Row label="Rounds" value={summary.rounds} />
                  <Row label="Locked predictions" value={summary.lockedPredictions} />
                  <Row label="Conflicts" value={summary.conflicts} valueColor={summary.conflicts ? colors.banker : colors.tie} />
                  <Row label="Duplicates" value={summary.duplicates} />
                  <Row label="New records" value={summary.newRecords} />
                  <Row
                    label="Safe to merge"
                    value={inspection?.plan?.safe ? "YES" : "NO"}
                    valueColor={inspection?.plan?.safe ? colors.tie : colors.banker}
                    testID="merge-safe"
                  />
                  <View style={styles.actionRow}>
                    <ActionButton
                      label="Merge"
                      icon="content-save-move"
                      tone="primary"
                      disabled={!view.mergeReady}
                      onPress={applyMerge}
                      testID="merge-apply"
                    />
                    <ActionButton
                      label="Restore (replace all)"
                      icon="backup-restore"
                      tone="danger"
                      disabled={!view.restoreReady}
                      onPress={() => setConfirmRestore(true)}
                      testID="import-restore"
                    />
                  </View>
                  {view.restoreReady ? null : summary.type === "FULL_BACKUP" && !canWrite ? (
                    <Text style={styles.note}>Restore is available on the native SQLite runtime.</Text>
                  ) : summary.type !== "FULL_BACKUP" ? (
                    <Text style={styles.note}>Restore requires a FULL_BACKUP file. Use Merge for History / Analysis.</Text>
                  ) : null}
                </View>
              ) : null}
            </Card>

            <Card title="Advanced" testID="advanced-actions" wide>
              <SectionLabel>Raw SQLite snapshot (diagnostic / emergency)</SectionLabel>
              <Text style={styles.note}>
                A consistent copy of the on-device database. The primary backup remains the portable
                BAPP-EXPORT file above.
              </Text>
              <View style={styles.actionRow}>
                <ActionButton
                  label="Export Raw SQLite Snapshot"
                  icon="database-cog"
                  disabled={!rawSupported || busy}
                  onPress={exportRaw}
                  testID="export-raw-sqlite"
                />
              </View>
              <Text style={styles.note} testID="raw-sqlite-state">
                {rawSupported
                  ? "Uses SQLite's consistent serialize (no live-file copy)."
                  : "Available on the native SQLite runtime only."}
              </Text>
            </Card>
          </View>
        </ScrollView>
      )}

      <ConfirmDialog
        visible={confirmRestore}
        title="Restore from backup?"
        message="This permanently REPLACES all current local data with the selected Full Backup. This cannot be undone."
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
