import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Image } from "expo-image";
import {
  Droplets,
  Lightbulb,
  MessageCircle,
  Sprout,
  ThermometerSun,
  Wind,
  type LucideIcon,
} from "lucide-react-native";
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { useHomePlants } from "@/lib/home-plants";
import { useSession } from "@/lib/session";
import { useOffline } from "@/lib/use-offline";
import {
  colors,
  fonts,
  layout,
  palette,
  radius,
  space,
  type as typography,
} from "@/theme/tokens";

const DEVICE_IMAGE = require("@/assets/FloryDevice.png");
const CONTEXT_IMAGE = require("@/assets/sensor-in-pot-closeup.png");
const doNothing = () => {};

const SENSES: { icon: LucideIcon; label: string }[] = [
  { icon: Droplets, label: "Tierra" },
  { icon: Lightbulb, label: "Luz" },
  { icon: ThermometerSun, label: "Temperatura" },
  { icon: Wind, label: "Aire" },
];

const PREVIEW_MESSAGES = [
  "Hola. Ya puedo contarte cómo me siento.",
  "Mi tierra se está secando.",
  "Creo que pronto tendré sed.",
];

export default function FloryScreen() {
  const { userId } = useSession();
  const offline = useOffline();
  const { plants } = useHomePlants(userId, offline);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const featuredPlant = plants.find((plant) => plant.active) ?? plants[0];
  const plantName = featuredPlant?.nickname.trim() || "Tu planta";
  const contentWidth = Math.min(width - layout.gutter * 2, 520);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarHeight + space[8] }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { paddingTop: insets.top + space[4] }]}>
          <View pointerEvents="none" style={styles.heroOrb} />

          <View style={[styles.content, { width: contentWidth }]}>
            <Text style={styles.heroEyebrow}>FLORY SENSOR</Text>
            <Text style={styles.heroTitle}>Tu planta podrá escribirte.</Text>
            <Text style={styles.heroBody}>
              El sensor detecta cambios en su maceta y Flory te los cuenta con
              palabras simples.
            </Text>

            <View style={styles.floatingMessages}>
              {PREVIEW_MESSAGES.map((message, index) => (
                <View
                  key={message}
                  style={[
                    styles.floatingMessage,
                    index === 1 ? styles.floatingMessageRight : styles.floatingMessageLeft,
                    index === 2 && styles.floatingMessageLast,
                  ]}
                >
                  <View style={styles.messageMeta}>
                    <View style={styles.avatar}>
                      <Sprout
                        size={14}
                        color={colors.actionPrimaryHover}
                        strokeWidth={2.2}
                      />
                    </View>
                    <Text style={styles.messageSender}>{plantName}</Text>
                  </View>
                  <Text style={styles.messageText}>{message}</Text>
                </View>
              ))}
            </View>

            <View style={styles.deviceStage}>
              <View pointerEvents="none" style={styles.deviceGlow} />
              <Image
                source={DEVICE_IMAGE}
                style={styles.deviceImage}
                contentFit="contain"
                accessibilityLabel="Flory Sensor completo para instalar en la tierra de una maceta"
              />
            </View>
          </View>
        </View>

        <View
          style={[
            styles.simpleSection,
            styles.content,
            { width: contentWidth },
          ]}
        >
          <MessageCircle size={28} color={palette.violet500} strokeWidth={2} />
          <Text style={styles.sectionTitle}>Sin datos difíciles.</Text>
          <Text style={styles.sectionBody}>
            Tierra, luz, temperatura y humedad. Todo se convierte en un mensaje
            útil.
          </Text>

          <View style={styles.senseGrid}>
            {SENSES.map(({ icon: Icon, label }) => (
              <View key={label} style={styles.senseItem}>
                <View style={styles.senseIcon}>
                  <Icon size={20} color={palette.violet500} strokeWidth={2} />
                </View>
                <Text style={styles.senseLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View
          style={[styles.photoSection, styles.content, { width: contentWidth }]}
        >
          <View style={styles.photoWrap}>
            <Image
              source={CONTEXT_IMAGE}
              style={styles.photo}
              contentFit="cover"
              accessibilityLabel="Flory Sensor instalado en una maceta"
            />
            <View style={styles.photoCaption}>
              <Text style={styles.photoCaptionText}>
                “Yo siento el cambio. Flory te avisa.”
              </Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.releaseSection,
            styles.content,
            { width: contentWidth },
          ]}
        >
          <View style={styles.releaseCard}>
            <Text style={styles.releaseEyebrow}>
              DISPONIBLE EN DICIEMBRE 2026
            </Text>
            <Text style={styles.releaseTitle}>Flory Sensor</Text>
            <Text style={styles.price}>$20.990</Text>
            <Text style={styles.reserveNote}>
              Reserva de $5.000, descontada del precio final. Envío dentro de
              Chile.
            </Text>
            <Button
              label="Reservas próximamente"
              disabled
              onPress={doNothing}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  content: {
    alignSelf: "center",
  },
  hero: {
    overflow: "hidden",
    backgroundColor: palette.green900,
  },
  heroOrb: {
    position: "absolute",
    width: 260,
    height: 260,
    top: 132,
    right: -150,
    borderRadius: 130,
    backgroundColor: "rgba(126, 87, 194, 0.2)",
  },
  heroEyebrow: {
    color: palette.violet100,
    fontFamily: fonts.bodyBold,
    fontSize: typography.xs.fontSize,
    lineHeight: typography.xs.lineHeight,
    letterSpacing: 1.2,
  },
  heroTitle: {
    marginTop: space[4],
    color: colors.textOnBrand,
    fontFamily: fonts.display,
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -0.55,
  },
  heroBody: {
    marginTop: space[3],
    color: palette.green100,
    fontFamily: fonts.body,
    fontSize: typography.md.fontSize,
    lineHeight: 24,
  },
  floatingMessages: {
    marginTop: space[6],
    gap: space[3],
  },
  floatingMessage: {
    maxWidth: "84%",
    borderRadius: radius.lg,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    backgroundColor: colors.surfaceCard,
    shadowColor: palette.green900,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
  },
  floatingMessageLeft: {
    alignSelf: "flex-start",
  },
  floatingMessageRight: {
    alignSelf: "flex-end",
  },
  floatingMessageLast: {
    marginLeft: space[5],
  },
  messageMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 26,
    height: 26,
    flexShrink: 0,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.green100,
  },
  messageSender: {
    flexShrink: 1,
    marginLeft: space[2],
    color: colors.textHeading,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    lineHeight: 16,
  },
  messageText: {
    marginTop: space[2],
    color: colors.textBody,
    fontFamily: fonts.body,
    fontSize: typography.sm.fontSize,
    lineHeight: 20,
  },
  deviceStage: {
    position: "relative",
    alignItems: "center",
    marginTop: space[5],
    paddingBottom: space[6],
  },
  deviceGlow: {
    position: "absolute",
    width: 230,
    height: 230,
    top: 58,
    borderRadius: 115,
    backgroundColor: "rgba(126, 87, 194, 0.18)",
  },
  deviceImage: {
    width: "54%",
    aspectRatio: 941 / 1672,
  },
  simpleSection: {
    paddingVertical: space[10],
  },
  sectionTitle: {
    marginTop: space[3],
    color: colors.textHeading,
    fontFamily: fonts.display,
    fontSize: typography.h2.fontSize,
    lineHeight: typography.h2.lineHeight,
    letterSpacing: typography.h2.letterSpacing,
  },
  sectionBody: {
    marginTop: space[2],
    color: colors.textBody,
    fontFamily: fonts.body,
    fontSize: typography.md.fontSize,
    lineHeight: 24,
  },
  senseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[3],
    marginTop: space[6],
  },
  senseItem: {
    minWidth: 130,
    flexBasis: "46%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    padding: space[3],
    backgroundColor: palette.violet50,
  },
  senseIcon: {
    width: 38,
    height: 38,
    flexShrink: 0,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.violet100,
  },
  senseLabel: {
    flex: 1,
    marginLeft: space[2],
    color: colors.textHeading,
    fontFamily: fonts.bodyBold,
    fontSize: typography.sm.fontSize,
    lineHeight: 19,
  },
  photoSection: {
    paddingBottom: space[8],
  },
  photoWrap: {
    minHeight: 340,
    overflow: "hidden",
    justifyContent: "flex-end",
    borderRadius: radius.xl,
    backgroundColor: palette.green100,
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
  },
  photoCaption: {
    margin: space[4],
    borderRadius: radius.lg,
    padding: space[4],
    backgroundColor: "rgba(28, 75, 46, 0.92)",
  },
  photoCaptionText: {
    color: colors.textOnBrand,
    fontFamily: fonts.display,
    fontSize: typography.h3.fontSize,
    lineHeight: typography.h3.lineHeight,
    letterSpacing: typography.h3.letterSpacing,
  },
  releaseSection: {
    paddingBottom: space[8],
  },
  releaseCard: {
    borderRadius: radius.xl,
    padding: space[5],
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  releaseEyebrow: {
    color: palette.violet500,
    fontFamily: fonts.bodyBold,
    fontSize: typography.xs.fontSize,
    lineHeight: typography.xs.lineHeight,
    letterSpacing: 0.8,
  },
  releaseTitle: {
    marginTop: space[3],
    color: colors.textHeading,
    fontFamily: fonts.display,
    fontSize: typography.h2.fontSize,
    lineHeight: typography.h2.lineHeight,
    letterSpacing: typography.h2.letterSpacing,
  },
  price: {
    marginTop: space[2],
    color: colors.textHeading,
    fontFamily: fonts.display,
    fontSize: 42,
    lineHeight: 48,
    fontVariant: ["tabular-nums"],
  },
  reserveNote: {
    marginTop: space[2],
    marginBottom: space[5],
    color: colors.textBody,
    fontFamily: fonts.body,
    fontSize: typography.sm.fontSize,
    lineHeight: typography.sm.lineHeight,
  },
});
