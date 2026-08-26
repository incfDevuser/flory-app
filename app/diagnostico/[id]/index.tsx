import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import {
  CalendarClock,
  Check,
  Droplets,
  Leaf,
  Sparkles,
} from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/screen";
import { Banner } from "@/components/ui/banner";
import { useDiagnosisDetail, type DiagnosisDetail } from "@/lib/plant-detail";
import { useSignedPhotoUrl } from "@/lib/plant-photo";
import { STATUS_TONE, type PlantStatus } from "@/lib/plant-vocab";
import { queryKeys } from "@/lib/query";
import { supabase } from "@/lib/supabase";
import {
  colors,
  fonts,
  layout,
  palette,
  radius,
  space,
  type as typography,
} from "@/theme/tokens";

/**
 * Resultado del diagnóstico. Una causa, una acción, un plazo y —si aplica— lo que ya no
 * se recupera (Flory.md §9). Habla en primera persona; nunca culpa. Sin números crudos:
 * el ajuste de riego ya lo aplicó el trigger, aquí no se muestra el intervalo en cifras.
 */

const SEVERITY_LABEL: Record<PlantStatus, string> = {
  bien: "Me veo bien",
  atencion: "Necesito un poco de atención",
  urgente: "Necesito ayuda pronto",
};

const CONFIDENCE_NOTE: Record<"alta" | "media" | "baja", string> = {
  alta: "Estaba bastante segura de esto.",
  media: "Creo que es esto, aunque podría ser otra cosa.",
  baja: "No estoy del todo segura; obsérvame estos días.",
};

type Feedback = "confirmo" | "corrigio" | "no_sabe";

export default function DiagnosticoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useDiagnosisDetail(id);

  if (query.isError) {
    return (
      <Screen
        eyebrow="Diagnóstico"
        title="No pude cargarlo"
        description="Algo se me enredó al recordar este diagnóstico. Inténtalo de nuevo en un momento."
      />
    );
  }

  if (query.isPending || !query.data) {
    return (
      <Screen
        eyebrow="Diagnóstico"
        title="Un momento…"
        description="Estoy recordando lo que vi."
      />
    );
  }

  return <Result diagnosis={query.data} />;
}

function Result({ diagnosis }: { diagnosis: DiagnosisDetail }) {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<Feedback | null>(
    feedbackFromAction(diagnosis.userAction),
  );
  const signed = useSignedPhotoUrl(diagnosis.imagePath);
  const severity = diagnosis.severity ?? "bien";
  const tone = STATUS_TONE[severity];

  const feedback = useMutation({
    mutationFn: async (action: Feedback) => {
      const { error } = await supabase.rpc("set_diagnosis_user_action", {
        p_diagnosis_id: diagnosis.id,
        p_action: action,
      });
      if (error) throw error;
    },
    onSuccess: (_data, action) => {
      setChoice(action);
      queryClient.setQueryData(queryKeys.diagnosis(diagnosis.id), {
        ...diagnosis,
        userAction: action,
      });
    },
  });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Diagnóstico" }} />

      <View style={[styles.hero, { backgroundColor: tone.soft }]}>
        <View style={[styles.chip, { backgroundColor: tone.accent }]}>
          <Text style={styles.chipLabel}>{SEVERITY_LABEL[severity]}</Text>
        </View>
        {diagnosis.floryMessage ? (
          <Text style={styles.floryMessage}>{diagnosis.floryMessage}</Text>
        ) : null}
        {signed.data ? (
          <Image
            source={{ uri: signed.data }}
            style={styles.photo}
            contentFit="cover"
            transition={180}
            accessibilityLabel="La foto que miré"
          />
        ) : null}
      </View>

      {diagnosis.cause ? (
        <Card
          icon={
            <Leaf
              size={18}
              color={colors.actionPrimaryHover}
              strokeWidth={2.2}
            />
          }
          title="Lo que veo"
        >
          {diagnosis.cause}
        </Card>
      ) : null}

      {diagnosis.action ? (
        <Card
          icon={
            <Droplets
              size={18}
              color={colors.actionPrimaryHover}
              strokeWidth={2.2}
            />
          }
          title="Qué hacer"
        >
          {diagnosis.action}
        </Card>
      ) : null}

      {diagnosis.timeframe ? (
        <Card
          icon={
            <Sparkles size={18} color={palette.violet500} strokeWidth={2.2} />
          }
          title="Qué esperar"
        >
          {diagnosis.timeframe}
        </Card>
      ) : null}

      {diagnosis.notRecoverable ? (
        <Banner
          tone="atencion"
          message={`Esto ya no se revierte: ${diagnosis.notRecoverable}`}
        />
      ) : null}

      {diagnosis.confidence ? (
        <Text style={styles.confidence}>
          {CONFIDENCE_NOTE[diagnosis.confidence]}
        </Text>
      ) : null}

      {diagnosis.followupAt ? (
        <Link
          href={{
            pathname: "/diagnostico/[id]/seguimiento",
            params: { id: diagnosis.id },
          }}
          asChild
        >
          <Pressable
            style={({ pressed }) => [
              styles.followup,
              pressed && styles.pressed,
            ]}
          >
            <CalendarClock
              size={18}
              color={colors.textHeading}
              strokeWidth={2.2}
            />
            <Text style={styles.followupLabel}>
              Volveré a revisarme en unas semanas
            </Text>
          </Pressable>
        </Link>
      ) : null}

      <View style={styles.feedbackBlock}>
        {choice ? (
          <View style={styles.thanks}>
            <Check size={18} color={colors.actionPrimary} strokeWidth={2.6} />
            <Text style={styles.thanksLabel}>
              Gracias, me ayuda a mirarme mejor.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.feedbackTitle}>¿Validas el diagnostico?</Text>
            <View style={styles.feedbackRow}>
              <FeedbackButton
                label="Sí, era eso"
                onPress={() => feedback.mutate("confirmo")}
                disabled={feedback.isPending}
              />
              <FeedbackButton
                label="Era otra cosa"
                onPress={() => feedback.mutate("corrigio")}
                disabled={feedback.isPending}
              />
              <FeedbackButton
                label="No sé"
                onPress={() => feedback.mutate("no_sabe")}
                disabled={feedback.isPending}
              />
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        {icon}
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Text style={styles.cardBody}>{children}</Text>
    </View>
  );
}

function FeedbackButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.feedbackButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.feedbackButtonLabel}>{label}</Text>
    </Pressable>
  );
}

function feedbackFromAction(action: string | null): Feedback | null {
  if (action === "confirmo" || action === "corrigio" || action === "no_sabe")
    return action;
  return null;
}

const styles = StyleSheet.create({
  content: {
    padding: layout.gutter,
    gap: space[4],
    paddingBottom: space[12],
  },
  hero: {
    borderRadius: radius.xl,
    padding: space[5],
    gap: space[3],
  },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radius.pill,
  },
  chipLabel: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textOnBrand,
  },
  floryMessage: {
    ...typography.h4,
    color: colors.textHeading,
  },
  photo: {
    width: "100%",
    height: 200,
    borderRadius: radius.lg,
    marginTop: space[1],
  },
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: space[4],
    gap: space[2],
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  cardTitle: {
    ...typography.eyebrow,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  cardBody: {
    ...typography.md,
    color: colors.textBody,
  },
  confidence: {
    ...typography.sm,
    color: colors.textMuted,
    fontStyle: "italic",
    paddingHorizontal: space[1],
  },
  followup: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    padding: space[4],
  },
  followupLabel: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
    flex: 1,
  },
  feedbackBlock: {
    marginTop: space[2],
    gap: space[3],
  },
  feedbackTitle: {
    ...typography.md,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
    textAlign: "center",
  },
  feedbackRow: {
    flexDirection: "row",
    gap: space[2],
    justifyContent: "center",
  },
  feedbackButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[2],
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceCard,
  },
  feedbackButtonLabel: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
    textAlign: "center",
  },
  thanks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
  },
  thanksLabel: {
    ...typography.md,
    color: colors.textBody,
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.4,
  },
});
