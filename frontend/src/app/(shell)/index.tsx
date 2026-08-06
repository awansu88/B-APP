import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { useHistorySession } from "@/src/workflows";
import {
  CheckpointBanner,
  ConfirmDialog,
  ControlBar,
  ReviewDataSheet,
  ShoeInfoPanel,
} from "@/src/ui/history";
import { RoadmapBoards } from "@/src/ui/roadmap";
import { colors, spacing } from "@/src/ui/theme";

type ConfirmKind = "clear" | "new" | null;

/**
 * Active Shoe — History Input Mode (Milestone 2).
 * Landscape tablet layout: left info panel · center roadmaps · bottom P/T/B
 * controls. Raw rounds are the source of truth; roadmaps rebuild on every edit.
 */
export default function ActiveShoeScreen() {
  const session = useHistorySession();
  const [showReview, setShowReview] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);

  if (!session.ready) {
    return (
      <View style={styles.loading} testID="screen-active-shoe-loading">
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Loading shoe…</Text>
      </View>
    );
  }

  const disabled = session.busy;

  return (
    <View style={styles.screen} testID="screen-active-shoe">
      <View style={styles.body}>
        <ShoeInfoPanel
          shoe={session.shoe}
          statistics={session.statistics}
          canStart={session.canStartForwardModes}
          nonTieRemaining={session.nonTieRemaining}
          historyConfirmed={session.historyConfirmed}
        />

        <View style={styles.center}>
          {session.checkpointDue ? (
            <CheckpointBanner
              totalRounds={session.statistics.totalRounds}
              canStart={session.canStartForwardModes}
              onContinue={session.dismissCheckpoint}
              onReview={() => {
                session.dismissCheckpoint();
                setShowReview(true);
              }}
              onStartLive={() => {
                session.dismissCheckpoint();
                session.startLive();
              }}
            />
          ) : null}

          <ScrollView
            style={styles.boardsScroll}
            contentContainerStyle={styles.boardsContent}
            showsVerticalScrollIndicator={false}
          >
            <RoadmapBoards roadmap={session.roadmap} />
          </ScrollView>
        </View>
      </View>

      <ControlBar
        draft={session.draft}
        disabled={disabled}
        canUndo={session.rounds.length > 0}
        canStart={session.canStartForwardModes}
        onSelectWinner={session.addResult}
        onTogglePlayerPair={session.togglePlayerPair}
        onToggleBankerPair={session.toggleBankerPair}
        onSetPairMode={session.setPairMode}
        onUndo={session.undo}
        onEditRound={() => setShowReview(true)}
        onDeleteRound={() => setShowReview(true)}
        onNewShoe={() => setConfirm("new")}
        onClearShoe={() => setConfirm("clear")}
        onStartLive={session.startLive}
        onStartHistoricalTest={session.startHistoricalTest}
      />

      <ReviewDataSheet
        visible={showReview}
        rounds={session.rounds}
        onClose={() => setShowReview(false)}
        onEdit={session.editRound}
        onDelete={session.deleteRound}
      />

      <ConfirmDialog
        visible={confirm === "clear"}
        title="Clear this shoe?"
        message="This permanently removes every round in the current shoe. The shoe itself is kept. This cannot be undone."
        confirmLabel="Clear Shoe"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          session.clearShoe();
        }}
      />

      <ConfirmDialog
        visible={confirm === "new"}
        title="Start a new shoe?"
        message="The current shoe is archived and a fresh empty shoe becomes active."
        confirmLabel="New Shoe"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          session.newShoe();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.background },
  loadingText: { color: colors.textSecondary, fontSize: 14 },
  body: { flex: 1, flexDirection: "row", padding: spacing.md, gap: spacing.md },
  center: { flex: 1, gap: spacing.sm },
  boardsScroll: { flex: 1 },
  boardsContent: { paddingBottom: spacing.md },
});
