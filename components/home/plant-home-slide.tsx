import { Image } from "expo-image";
import { router } from "expo-router";
import { Camera, Droplets, Siren, Sparkles } from "lucide-react-native";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { MissingDataCard } from "@/components/home/missing-data-card";
import { FloryMascot, type MascotPose } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import type { HomePlant, PlantStatus } from "@/lib/home-plants";
import { dailyMessage } from "@/lib/plant-messages";
import { useSignedPhotoUrl } from "@/lib/plant-photo";
import { wateringSentence } from "@/lib/watering-copy";
import {
  colors,
  fonts,
  layout,
  palette,
  radius,
  space,
  type as typography,
} from "@/theme/tokens";

type PlantHomeSlideProps = {
  plant: HomePlant;
  userId: string | null;
  width: number;
  bottomInset: number;
  refreshing: boolean;
  onRefresh: () => void;
  onWater: () => void;
  wateringDisabled: boolean;
};

const STATUS_STYLE: Record<
  PlantStatus,
  { label: string; accent: string; soft: string; pose: MascotPose }
> = {
  bien: {
    label: "Estoy bien",
    accent: colors.statusBien,
    soft: colors.statusBienSoft,
    pose: "saluda",
  },
  atencion: {
    label: "Necesito atención",
    accent: colors.statusAtencion,
    soft: colors.statusAtencionSoft,
    pose: "idea",
  },
  urgente: {
    label: "Necesito agua",
    accent: colors.statusUrgente,
    soft: colors.statusUrgenteSoft,
    pose: "regadera",
  },
};

export function PlantHomeSlide({
  plant,
  userId,
  width,
  bottomInset,
  refreshing,
  onRefresh,
  onWater,
  wateringDisabled,
}: PlantHomeSlideProps) {
  const status = STATUS_STYLE[plant.status];
  const approximate = plant.species === null;
  const message = dailyMessage(plant.id, plant.status);
  const photo = useSignedPhotoUrl(plant.photoPath);
  const photoUrl = photo.data ?? null;

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: bottomInset + space[8] },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.actionPrimary}
        />
      }
    >
      <View style={styles.hero}>
        <View style={styles.statusPill}>
          <View
            style={[styles.statusDot, { backgroundColor: status.accent }]}
          />
          <Text style={styles.statusLabel}>{status.label}</Text>
        </View>

        <View style={styles.visualWrap}>
          <View
            style={[
              styles.visualCircle,
              { backgroundColor: status.soft, borderColor: status.accent },
            ]}
          >
            {photoUrl ? (
              <Image
                source={{ uri: photoUrl }}
                style={styles.plantPhoto}
                contentFit="cover"
                contentPosition="center"
                transition={180}
                accessibilityLabel={`Foto de ${plant.nickname}`}
              />
            ) : (
              <View style={styles.mascotWrap}>
                <FloryMascot pose={status.pose} height={164} />
              </View>
            )}
          </View>

          <View style={styles.photoActionWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={photoUrl ? "Editar planta" : "Agregar foto"}
              hitSlop={8}
              onPress={() =>
                router.push({
                  pathname: "/plant/[id]/editar",
                  params: { id: plant.id },
                })
              }
              style={({ pressed }) => [
                styles.photoAction,
                pressed && styles.pressed,
              ]}
            >
              <Camera size={16} color={colors.textHeading} strokeWidth={2.2} />
              <Text style={styles.photoActionLabel}>
                {photoUrl ? "Editar foto" : "Agregar foto"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.identity}>
        <Text style={styles.name}>{plant.nickname}</Text>
        <Text style={styles.species}>
          {plant.species?.commonName ?? "Especie por identificar"}
        </Text>
        {plant.species?.scientificName ? (
          <Text style={styles.scientificName}>
            {plant.species.scientificName}
          </Text>
        ) : null}
      </View>

      <Text style={styles.message}>{message}</Text>
      <Text style={styles.wateringDate}>
        {wateringSentence(plant.nextWateringAt)}
      </Text>

      {approximate ? (
        <View style={styles.approximateCard}>
          <Sparkles size={19} color={palette.violet500} strokeWidth={2.2} />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Mi ritmo es aproximado</Text>
            <Text style={styles.cardBody}>
              Todavía no conozco mi especie exacta. Iré ajustando mi cuidado con
              lo que me cuentes.
            </Text>
          </View>
        </View>
      ) : null}

      {/*
        La pregunta se responde aquí mismo. Mandarla a otra pantalla convertía un
        toque en una excursión, y con eso el dato no se completa nunca.
      */}
      {userId ? <MissingDataCard plant={plant} userId={userId} /> : null}

      <View style={styles.actions}>
        <Button
          label={
            wateringDisabled
              ? "Registrar riego al conectarte"
              : "Registrar riego"
          }
          onPress={onWater}
          disabled={wateringDisabled}
          leadingIcon={
            <Droplets
              size={20}
              color={wateringDisabled ? colors.textFaint : colors.textOnBrand}
              strokeWidth={2.2}
            />
          }
        />
        <Button
          label="¿Me pasa algo?"
          variant="secondary"
          onPress={() => router.push("/diagnostico/camara")}
          leadingIcon={
            <Siren size={20} color={colors.textHeading} strokeWidth={2.2} />
          }
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    gap: space[4],
  },
  hero: {
    height: 304,
    alignItems: "center",
    gap: space[3],
    paddingTop: space[1],
  },
  visualWrap: {
    width: 224,
    height: 246,
    position: "relative",
    alignItems: "center",
  },
  visualCircle: {
    width: 224,
    height: 224,
    borderRadius: 112,
    borderWidth: 4,
    overflow: "hidden",
    position: "relative",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.88)",
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: radius.pill,
  },
  statusLabel: {
    ...typography.xs,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
  },
  plantPhoto: {
    width: "100%",
    height: "100%",
  },
  mascotWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  photoActionWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  photoAction: {
    height: 40,
    paddingHorizontal: space[3],
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceCard,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
  },
  photoActionLabel: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
  },
  identity: {
    alignItems: "center",
    gap: 1,
    paddingTop: space[2],
    paddingHorizontal: space[2],
  },
  name: {
    ...typography.h1,
    lineHeight: 48,
    color: colors.textHeading,
    textAlign: "center",
    width: "100%",
    minHeight: 52,
  },
  species: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textBody,
    textAlign: "center",
  },
  scientificName: {
    ...typography.xs,
    color: colors.textMuted,
    fontStyle: "italic",
    textAlign: "center",
  },
  message: {
    ...typography.lg,
    color: colors.textBody,
    textAlign: "center",
    paddingHorizontal: space[2],
  },
  wateringDate: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
    textAlign: "center",
  },
  approximateCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    padding: space[4],
    borderRadius: radius.lg,
    backgroundColor: palette.violet50,
    borderWidth: 1.5,
    borderColor: palette.violet100,
  },
  cardText: {
    flex: 1,
    gap: space[1],
  },
  cardTitle: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
  },
  cardBody: {
    ...typography.xs,
    color: colors.textMuted,
  },
  actions: {
    gap: space[3],
    marginTop: space[2],
  },
  pressed: {
    opacity: 0.72,
  },
});
