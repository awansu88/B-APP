import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useHistorySession, useLiveSession } from "@/src/workflows";
import { buildRoadmap } from "@/src/domain/roadmap/engine";
import { OperatorAction } from "@/src/domain/session";
import { resolvePairState, computeStatistics } from "@/src/domain/history";
import { Winner } from "@/src/domain/models/outcome";
import {
  CheckpointBanner,
  ConfirmDialog,
  ControlBar,
  ReviewDataSheet,
  ShoeInfoPanel,
} from "@/src/ui/history";
import { LiveSessionPanel } from "@/src/ui/live";
import { RoadmapBoards } from "@/src/ui/roadmap";
import { colors, radius, spacing } from "@/src/ui/theme";

type ConfirmKind = "clear" | "new" | null;

/**
 * Active Shoe — History Input Mode (Milestone 2).
 * Landscape tablet layout: left info panel · center roadmaps · bottom P/T/B
 * controls. Raw rounds are the source of truth; roadmaps rebuild on every edit.
 */
export default function ActiveShoeScreen() {
  const session = useHistorySession();
  const live = useLiveSession(session.shoe ?? null, session.rounds);
  const [showReview, setShowReview] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [operatorAction, setOperatorAction] = useState<OperatorAction>(OperatorAction.NOT_PLAYED);

  const liveActive = live.active;
  const liveMode = liveActive && live.state != null;
  const liveRounds = live.state?.rounds ?? null;
  const liveRoadmap = useMemo(
    () => (liveRounds ? buildRoadmap(liveRounds.slice()) : null),
    [liveRounds],
  );
  // In a forward session the authoritative raw rounds live in the persisted
  // live session — derive the Review list + statistics from THOSE (single
  // source of truth), so an edit/delete refreshes every view consistently.
  const activeRounds = liveMode && liveRounds ? liveRounds : session.rounds;
  const activeStatistics = useMemo(
    () => (liveMode && liveRounds ? computeStatistics(liveRounds) : session.statistics),
    [liveMode, liveRounds, session.statistics],
  );

  if (!session.ready) {
    return (
      <View style={styles.loading} testID="screen-active-shoe-loading">
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Loading shoe…</Text>
      </View>
    );
  }

  // Actual-result input is allowed ONLY on a healthy, initialized persisted
  // session with a valid current lock and no in-flight write (UI safety).
  const canLiveSubmit =
    liveActive &&
    !live.busy &&
    live.error == null &&
    live.storeKind != null &&
    live.state?.currentPrediction != null;
  const resultDisabled = liveActive ? !canLiveSubmit : session.busy;
  const generalDisabled = liveActive ? live.busy : session.busy;
  const boardsRoadmap = liveMode && liveRoadmap ? liveRoadmap : session.roadmap;

  const onSelectWinner = (winner: Winner) => {
    if (liveActive) {
      if (!canLiveSubmit) return; // never fall back to a history append in a forward session
      live.submit(winner, operatorAction, {
        playerPair: resolvePairState(session.draft.playerPairSelected, session.draft.pairMode),
        bankerPair: resolvePairState(session.draft.bankerPairSelected, session.draft.pairMode),
      });
      session.resetPairSelections(); // PP/BP auto-reset after a submitted live round
      return;
    }
    session.addResult(winner);
  };

  return (
    <View style={styles.screen} testID="screen-active-shoe">
      <View style={styles.body}>
        <ShoeInfoPanel
          shoe={session.shoe}
          statistics={activeStatistics}
          canStart={session.canStartForwardModes}
          nonTieRemaining={session.nonTieRemaining}
          historyConfirmed={liveActive ? true : session.historyConfirmed}
        />

        <View style={styles.center}>
          {live.active && live.error ? (
            <View style={styles.liveError} testID="live-error">
              <Text style={styles.liveErrorText}>Live lock/persist error: {live.error}</Text>
              <Pressable onPress={live.retry} style={styles.retryBtn} testID="live-retry">
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {liveMode && live.state ? (
            <LiveSessionPanel
              state={live.state}
              lastResolved={live.lastResolved}
              operatorAction={operatorAction}
              onSetOperatorAction={setOperatorAction}
              busy={live.busy}
              storeKind={live.storeKind}
            />
          ) : null}

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
            <RoadmapBoards roadmap={boardsRoadmap} />
          </ScrollView>
        </View>
      </View>

      <ControlBar
        draft={session.draft}
        disabled={generalDisabled}
        resultDisabled={resultDisabled}
        canUndo={liveActive ? false : session.rounds.length > 0}
        canReview={activeRounds.length > 0}
        canStart={session.canStartForwardModes}
        onSelectWinner={onSelectWinner}
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
        rounds={activeRounds}
        onClose={() => setShowReview(false)}
        onEdit={liveMode ? live.editHistory : session.editRound}
        onDelete={liveMode ? live.deleteHistoryRound : session.deleteRound}
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
  liveError: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.banker,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  liveErrorText: { color: colors.banker, fontSize: 13, flex: 1 },
  retryBtn: {
    backgroundColor: colors.railActiveSurface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  retryText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  boardsScroll: { flex: 1 },
  boardsContent: { paddingBottom: spacing.md },
});
