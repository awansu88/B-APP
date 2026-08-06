import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';

interface ConfirmDialogProps {
  readonly visible: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * A cross-platform confirmation dialog (works identically on web and native,
 * unlike `Alert.alert`). Used to guard destructive actions such as Clear Shoe.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} testID="confirm-backdrop">
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable
              testID="confirm-cancel"
              onPress={onCancel}
              style={[styles.btn, styles.cancelBtn]}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              testID="confirm-ok"
              onPress={onConfirm}
              style={[styles.btn, destructive ? styles.destructiveBtn : styles.confirmBtn]}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: 420,
    maxWidth: '100%',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  message: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  btn: { minHeight: 44, paddingVertical: 10, paddingHorizontal: spacing.lg, borderRadius: radius.sm, justifyContent: 'center' },
  cancelBtn: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  confirmBtn: { backgroundColor: colors.accent },
  destructiveBtn: { backgroundColor: colors.banker },
  cancelText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  confirmText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
