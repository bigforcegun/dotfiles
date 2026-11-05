import { memo } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import { STRIP_COLUMN_PITCH, STRIP_COLUMN_WIDTH } from "./strip-window";
export interface PulseColumnProps {
  readonly id: string; readonly label: string; readonly icon: string; readonly color: string;
  readonly height: number; readonly opacity: number; readonly hovered: boolean;
  readonly highlight: string; readonly last: boolean; readonly onSelect: (id: string | null) => void;
}
export const PulseColumn = memo(function PulseColumn({ id, label, icon, color, height, opacity, hovered, highlight, last, onSelect }: PulseColumnProps) {
  return <Pressable accessibilityLabel={label}
    onHoverIn={() => onSelect(id)} onHoverOut={() => onSelect(null)}
    onFocus={() => onSelect(id)} onBlur={() => onSelect(null)} onPress={() => onSelect(id)}
    style={{ width: last ? STRIP_COLUMN_WIDTH : STRIP_COLUMN_PITCH, height: 54, flexShrink: 0, ...(hovered ? { backgroundColor: highlight } : {}) }}>
    <View style={{ width: STRIP_COLUMN_WIDTH, height: 40, justifyContent: "flex-end" }}>
      <View style={{ width: STRIP_COLUMN_WIDTH, borderRadius: 2, height, opacity, backgroundColor: color }} />
    </View>
    <View style={{ width: STRIP_COLUMN_WIDTH, height: 14, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={10} color={color} />
    </View>
  </Pressable>;
});
