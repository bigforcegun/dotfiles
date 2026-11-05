import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { RING_PERIOD_MS, startWebRotation } from "./ring-clock";

export function WorkingRing({ size, color }: { size: number; color: string }) {
  const rotation = useRef(new Animated.Value(0)).current;
  const spinner = useRef<View | null>(null);
  useEffect(() => {
    // JS-driven Animated stalls whenever the JS thread is busy; prefer the compositor.
    const stopWeb = startWebRotation(spinner.current, typeof performance === "undefined" ? Date.now() : performance.now());
    if (stopWeb) return stopWeb;
    const animation = Animated.loop(Animated.timing(rotation, { toValue: 1, duration: RING_PERIOD_MS, easing: Easing.linear, useNativeDriver: false }));
    animation.start();
    return () => { animation.stop(); rotation.setValue(0); };
  }, [rotation]);
  const diameter = Math.max(8, size - 2);
  return <View style={{ width: diameter, height: diameter }}>
    <View style={{ position: "absolute", width: diameter, height: diameter, borderRadius: diameter / 2, borderWidth: 2, borderColor: color, opacity: 0.2 }} />
    <Animated.View ref={spinner} style={{ width: diameter, height: diameter, transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
      <View style={{ width: diameter / 2, height: diameter / 2, borderTopLeftRadius: diameter / 2, borderTopWidth: 2, borderLeftWidth: 2, borderColor: color }} />
    </Animated.View>
  </View>;
}

