import React from "react";
import { useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { ChevronLeft } from "lucide-react-native";
import { useApp } from "../app/providers/AppProvider";
import { colors } from "../theme/tokens";
import { IconButton, Row, Txt } from "./ui";

const SCALLOP = 18;
const DEPTH = SCALLOP / 2;
const FRINGE = DEPTH + 6;

// A jhalar: the scalloped fringe of a mandap canopy, each lobe trimmed in gold
// with a bead at its tip. It continues the bar's saffron below its edge.
export function Jhalar({ color = colors.saffron }: { color?: string }) {
  const { width } = useWindowDimensions();
  const count = Math.ceil(width / SCALLOP);
  let lobes = "M0 0";
  for (let i = 0; i < count; i++)
    lobes += ` A${DEPTH} ${DEPTH} 0 0 0 ${(i + 1) * SCALLOP} 0`;
  return (
    <Svg width={width} height={FRINGE} accessible={false}>
      <Path d={`${lobes} Z`} fill={color} />
      <Path d={lobes} fill="none" stroke={colors.haldi} strokeWidth={1.5} />
      {Array.from({ length: count }, (_, i) => (
        <Circle
          key={i}
          cx={i * SCALLOP + DEPTH}
          cy={DEPTH + 3}
          r={2}
          fill={colors.haldi}
        />
      ))}
    </Svg>
  );
}

// The saffron app bar every page shares: back, title and subtitle in white
// on bhagwa, finished with a jhalar. `children` replaces the title (Home's
// greeting); `fringe={false}` leaves the edge to the screen (Home's toran).
export function AppBar({
  title,
  subtitle,
  onBack,
  children,
  fringe = true,
}: React.PropsWithChildren<{
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  fringe?: boolean;
}>) {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <View>
      <LinearGradient
        colors={[colors.bhagwa, colors.saffron]}
        style={{
          paddingTop: insets.top + 6,
          paddingBottom: 10,
          paddingHorizontal: 16,
        }}
      >
        {children ?? (
          <Row style={{ minHeight: 52, gap: 6 }}>
            {onBack && (
              <IconButton
                icon={ChevronLeft}
                label={t("close")}
                onPress={onBack}
                color={colors.white}
              />
            )}
            <View style={{ flex: 1, paddingLeft: onBack ? 0 : 6 }}>
              <Txt
                bold
                size={24}
                numberOfLines={1}
                accessibilityRole="header"
                style={{ color: colors.white }}
              >
                {title}
              </Txt>
              {subtitle && (
                <Txt
                  size={14}
                  numberOfLines={1}
                  style={{ color: colors.headerText }}
                >
                  {subtitle}
                </Txt>
              )}
            </View>
          </Row>
        )}
      </LinearGradient>
      {fringe && <Jhalar />}
    </View>
  );
}
