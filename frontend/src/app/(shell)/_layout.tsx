import { Slot } from "expo-router";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NavRail } from "@/src/ui/NavRail";
import { colors } from "@/src/ui/theme";

/**
 * Tablet landscape shell: a persistent left navigation rail plus the active
 * route rendered via <Slot />.
 */
export default function ShellLayout() {
  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top", "bottom", "left"]}
      testID="app-shell"
    >
      <View style={styles.row}>
        <NavRail />
        <View style={styles.content}>
          <Slot />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  row: {
    flex: 1,
    flexDirection: "row",
  },
  content: {
    flex: 1,
  },
});
