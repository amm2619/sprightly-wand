import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { theme } from '../theme/colors';

type Props = {
  expiresAt: number;
  onUndo: () => void;
  onExpire: () => void;
};

export function TakeBackButton({ expiresAt, onUndo, onExpire }: Props) {
  const [, tick] = useState(0);
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    const id = setInterval(() => {
      tick((n) => n + 1);
      if (Date.now() >= expiresAt && !expiredRef.current) {
        expiredRef.current = true;
        clearInterval(id);
        onExpire();
      }
    }, 200);
    return () => clearInterval(id);
  }, [expiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const remaining = Math.max(0, expiresAt - Date.now());
  const secs = Math.ceil(remaining / 1000);

  return (
    <Pressable style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]} onPress={onUndo}>
      <Text style={styles.txt}>↩  Take back  ·  {secs}s</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: theme.accent,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 11,
    marginHorizontal: 12,
    marginBottom: 8,
    alignItems: 'center',
    shadowColor: theme.accent,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  txt: {
    color: theme.feltDark,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
