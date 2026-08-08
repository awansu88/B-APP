import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useBappData } from "@/src/workflows/backup/use-bapp-data";
import { ActionButton, Banner, Card, Row, ScreenHeader, SectionLabel } from "@/src/ui/data/cards";
import { Winner } from "@/src/domain/models/outcome";
import { PairState } from "@/src/domain/models/pair";
import { ShoeStatus } from "@/src/domain/models/enums";
import { colors, radius, spacing } from "@/src/ui/theme";

/**
 * History (Milestone 7A) — READ-ONLY Shoe History / Raw Records browser.
 *
 * Reads the accepted read-only dataset projection (`useBappData`) and lists the
 * persisted shoes plus the raw round records of the selected shoe in
 * deterministic round order. It performs NO writes, NO edit/delete, and NEVER
 * recomputes historical predictions. Editing / revisions remain exclusively in
 * Active Shoe → Review Data (accepted History Input / revision semantics).
 */
const winnerColor = (w: Winner): string =>
  w === Winner.PLAYER ? colors.player : w === Winner.BANKER ? colors.banker : colors.tie;

const winnerLetter = (w: Winner): string =>
  w === Winner.PLAYER ? "P" : w === Winner.BANKER ? "B" : "T";

export default function HistoryScreen() {
  const { dataset, runtime, loading, error, reload } = useBappData();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const shoes = useMemo(() => {
    const list = dataset?.shoes ? dataset.shoes.slice() : [];
    // Deterministic order: newest first by creation, id as tie-break.
    return list.sort((a, b) =>
      a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : b.createdAt.localeCompare(a.createdAt),
    );
  }, [dataset]);

  const activeShoe = shoes.find((s) => s.status === ShoeStatus.ACTIVE) ?? null;
  const effectiveId = selectedId ?? activeShoe?.id ?? shoes[0]?.id ?? null;
  const selectedShoe = shoes.find((s) => s.id === effectiveId) ?? null;

  const rounds = useMemo(() => {
    if (!dataset || !effectiveId) return [];
    return dataset.rounds
      .filter((r) => r.shoeId === effectiveId)
      .slice()
      .sort((a, b) => a.roundNumber - b.roundNumber);
  }, [dataset, effectiveId]);

  const isEmpty = !loading && !error && shoes.length === 0;

  return (
    <View style={styles.screen} testID="screen-history">
      <ScreenHeader
        title="History"
        subtitle="Read-only shoe archive and raw round records."
        icon="history"
        testID="screen-history-title"
        right={<ActionButton label="Refresh" icon="refresh" onPress={reload} testID="history-refresh" />}
      />

      <View style={styles.bannerWrap}>
        <Banner
          tone="info"
          testID="history-readonly-banner"
          text="Read-only. Editing, revisions and deletes stay in Active Shoe → Review Data."
        />
      </View>

      {loading ? (
        <View style={styles.center} testID="history-loading">
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.muted}>Loading shoes…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error} testID="history-error">{error}</Text>
        </View>
      ) : isEmpty ? (
        <View style={styles.bannerWrap}>
          <Banner
            tone="info"
            testID="history-empty"
            text="No shoes yet — start entering rounds in Active Shoe to build history."
          />
        </View>
      ) : (
        <View style={styles.body}>
          {/* Left: shoe list */}
          <View style={styles.listCol}>
            <Card title={`Shoes (${shoes.length})`} testID="history-shoe-list">
              <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
                {shoes.map((s) => {
                  const active = s.id === effectiveId;
                  const isCurrent = s.status === ShoeStatus.ACTIVE;
                  return (
                    <Pressable
                      key={s.id}
                      testID={`history-shoe-${s.id}`}
                      onPress={() => setSelectedId(s.id)}
                      style={[styles.shoeItem, active && styles.shoeItemActive]}
                    >
                      <View style={styles.shoeItemTop}>
                        <Text numberOfLines={1} style={[styles.shoeId, active && styles.shoeIdActive]}>
                          {s.label ?? s.id}
                        </Text>
                        {isCurrent ? (
                          <View style={styles.currentBadge}>
                            <Text style={styles.currentBadgeText}>ACTIVE</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.shoeMeta} numberOfLines={1}>
                        {s.environment} · {s.status} · {s.roundCount} rounds
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Card>
          </View>

          {/* Right: raw rounds of the selected shoe */}
          <View style={styles.detailCol}>
            <Card title="Raw Round Records" testID="history-rounds" wide>
              {selectedShoe ? (
                <>
                  <Row label="Shoe" value={selectedShoe.label ?? selectedShoe.id} testID="history-detail-shoe" />
                  <Row label="Environment" value={selectedShoe.environment} />
                  <Row label="Status" value={selectedShoe.status} />
                  <Row label="Total rounds" value={rounds.length} testID="history-detail-count" />
                  <SectionLabel>Rounds (in order)</SectionLabel>
                  {rounds.length === 0 ? (
                    <Text style={styles.muted} testID="history-rounds-empty">
                      This shoe has no rounds yet.
                    </Text>
                  ) : (
                    <ScrollView style={styles.roundsScroll} showsVerticalScrollIndicator={false}>
                      <View style={styles.roundGrid}>
                        {rounds.map((r) => (
                          <View key={r.id} style={styles.roundChip} testID={`history-round-${r.roundNumber}`}>
                            <Text style={styles.roundNum}>#{r.roundNumber}</Text>
                            <View style={[styles.roundDot, { backgroundColor: winnerColor(r.winner) }]}>
                              <Text style={styles.roundDotText}>{winnerLetter(r.winner)}</Text>
                            </View>
                            <View style={styles.pairTags}>
                              {r.playerPair === PairState.YES ? (
                                <Text style={[styles.pairTag, { color: colors.player }]}>PP</Text>
                              ) : null}
                              {r.bankerPair === PairState.YES ? (
                                <Text style={[styles.pairTag, { color: colors.banker }]}>BP</Text>
                              ) : null}
                            </View>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  )}
                </>
              ) : (
                <Text style={styles.muted}>Select a shoe to view its rounds.</Text>
              )}
            </Card>
          </View>
        </View>
      )}

      {runtime === "web-preview" ? (
        <View style={styles.footerBanner}>
          <Banner
            tone="info"
            testID="history-web-banner"
            text="Web-preview data (AsyncStorage). Native SQLite/DB-002 is the authoritative source."
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  bannerWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  footerBanner: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  muted: { color: colors.textSecondary, fontSize: 13 },
  error: { color: colors.banker, fontSize: 13, paddingHorizontal: spacing.lg, textAlign: "center" },
  body: { flex: 1, flexDirection: "row", padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  listCol: { width: 280 },
  detailCol: { flex: 1 },
  listScroll: { maxHeight: 560 },
  shoeItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
  },
  shoeItemActive: {
    backgroundColor: colors.railActiveSurface,
    borderColor: colors.accent,
  },
  shoeItemTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  shoeId: { color: colors.textSecondary, fontSize: 13, fontWeight: "700", flexShrink: 1 },
  shoeIdActive: { color: colors.textPrimary },
  currentBadge: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  currentBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  shoeMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  roundsScroll: { maxHeight: 480, marginTop: spacing.xs },
  roundGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  roundChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    minWidth: 74,
  },
  roundNum: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  roundDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  roundDotText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  pairTags: { flexDirection: "row", gap: 2 },
  pairTag: { fontSize: 9, fontWeight: "800" },
});
