import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { router } from 'expo-router';
import { CloudOff, Send, Sprout } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlantSwitcher } from '@/components/home/plant-switcher';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import {
  useChatHistory,
  useSendChatMessage,
  type ChatMessage,
} from '@/lib/chat';
import { useHomePlants, type HomePlant } from '@/lib/home-plants';
import { useOffline } from '@/lib/use-offline';
import { useSession } from '@/lib/session';
import { colors, layout, radius, space, type as typography } from '@/theme/tokens';

/**
 * `true` mientras el teclado está arriba. iOS avisa con `Will` (antes de animar, para que
 * el layout acompañe al teclado sin salto); Android solo emite los `Did`.
 */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setShown(true));
    const hide = Keyboard.addListener(hideEvent, () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return shown;
}

export default function ChatScreen() {
  const { userId } = useSession();
  const offline = useOffline();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { plants, isLoading } = useHomePlants(userId, offline);

  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    if (activeIndex >= plants.length) setActiveIndex(Math.max(0, plants.length - 1));
  }, [activeIndex, plants.length]);

  const activePlant: HomePlant | null = plants[activeIndex] ?? null;

  return (
    // La pantalla entera es el KeyboardAvoidingView con offset 0: así RN no tiene que
    // adivinar la altura del header. El header queda fijo arriba; al abrir el teclado solo
    // se comprime el área de mensajes y el input sube pegado al teclado.
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + space[2] }]}>
        <Text style={styles.title}>Chat</Text>
        {activePlant ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            Hablas con {activePlant.nickname}
          </Text>
        ) : null}
      </View>

      {offline ? (
        <View style={styles.bannerWrap}>
          <Banner
            tone="offline"
            icon={<CloudOff size={18} color={colors.textMuted} strokeWidth={2.2} />}
            message="Estás sin conexión. Podremos conversar cuando vuelva la red."
          />
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.actionPrimary} />
        </View>
      ) : plants.length === 0 ? (
        <EmptyPlants />
      ) : (
        <>
          {plants.length > 1 ? (
            <PlantSwitcher
              plants={plants}
              activeIndex={activeIndex}
              onSelect={setActiveIndex}
            />
          ) : null}

          {activePlant && userId ? (
            <Conversation
              key={activePlant.id}
              plant={activePlant}
              offline={offline}
              tabBarHeight={tabBarHeight}
            />
          ) : null}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function Conversation({
  plant,
  offline,
  tabBarHeight,
}: {
  plant: HomePlant;
  offline: boolean;
  tabBarHeight: number;
}) {
  const [text, setText] = useState('');
  const history = useChatHistory(plant.id, offline);
  const send = useSendChatMessage({ plantId: plant.id });

  const messageCount = history.data?.length ?? 0;
  // La lista va invertida (lo nuevo abajo, pegado al input), así que se ordena de más
  // reciente a más antiguo. `slice` para no invertir el array de la caché en su sitio.
  const inverted = useMemo(() => (history.data ?? []).slice().reverse(), [history.data]);

  const canSend = text.trim().length > 0 && !offline && !send.isPending;

  const handleSend = () => {
    const content = text.trim();
    if (!content || offline || send.isPending) return;
    setText('');
    // Si falla, se devuelve el texto al input para reintentar sin reescribirlo.
    send.mutate({ text: content }, { onError: () => setText(content) });
  };

  const errorMessage = send.isError && send.error instanceof Error ? send.error.message : null;
  const keyboardShown = useKeyboardShown();

  // Con teclado cerrado, el input deja hueco para la barra de pestañas flotante; con
  // teclado abierto ese hueco desaparece y queda pegado al teclado.
  const inputPaddingBottom = keyboardShown ? space[3] : tabBarHeight;

  return (
    <View style={styles.flex}>
      {messageCount === 0 && !history.isPending ? (
        // Sin lista scrolleable en el estado vacío, tocar aquí es la única forma de bajar
        // el teclado. `Keyboard.dismiss` lo cierra.
        <Pressable style={styles.centered} onPress={Keyboard.dismiss} accessibilityRole="none">
          <Text style={styles.emptyTitle}>Todavía no hemos hablado</Text>
          <Text style={styles.emptyBody}>
            Escríbeme lo que quieras. Te acompaño y te cuento cómo me siento.
          </Text>
        </Pressable>
      ) : (
        <FlatList
          style={styles.flex}
          data={inverted}
          inverted
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <Bubble message={item} />}
          // La lista está invertida: el header se pinta abajo, junto al input, que es
          // justo donde aparecen los puntitos mientras la planta responde.
          ListHeaderComponent={send.isPending ? <TypingBubble /> : null}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          // Arrastrar la conversación baja el teclado (interactivo en iOS, al soltar en
          // Android): la otra forma de cerrarlo cuando ya hay mensajes.
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        />
      )}

      {errorMessage ? (
        <View style={styles.errorWrap}>
          <Banner message={errorMessage} />
        </View>
      ) : null}

      <View style={[styles.inputBar, { paddingBottom: inputPaddingBottom }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={offline ? 'Sin conexión…' : 'Escríbele a tu planta…'}
          placeholderTextColor={colors.textFaint}
          editable={!offline}
          multiline
          maxLength={2000}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enviar mensaje"
          disabled={!canSend}
          onPress={handleSend}
          style={({ pressed }) => [
            styles.sendButton,
            !canSend && styles.sendButtonDisabled,
            pressed && canSend && styles.sendButtonPressed,
          ]}
        >
          <Send size={20} color={colors.textOnBrand} strokeWidth={2.2} />
        </Pressable>
      </View>
    </View>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser ? styles.rowUser : styles.rowPlant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubblePlant]}>
        <Text style={[styles.bubbleText, isUser ? styles.textUser : styles.textPlant]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

/** Burbuja de «la planta está respondiendo»: tres puntos que rebotan suave. */
function TypingBubble() {
  return (
    <View style={[styles.bubbleRow, styles.rowPlant]}>
      <View style={[styles.bubble, styles.bubblePlant, styles.typingBubble]}>
        <TypingDot delay={0} />
        <TypingDot delay={150} />
        <TypingDot delay={300} />
      </View>
    </View>
  );
}

const DOT_LIFT = -3;
const DOT_STEP = 260;

function TypingDot({ delay }: { delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // Sube y baja en bucle. Solo translateY/opacity (GPU); amplitud mínima para que
    // acompañe sin distraer. El desfase entre puntos crea la onda.
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: DOT_STEP }),
          withTiming(0, { duration: DOT_STEP })
        ),
        -1,
        false
      )
    );
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: progress.value * DOT_LIFT }],
    opacity: 0.4 + progress.value * 0.6,
  }));

  return <Animated.View style={[styles.typingDot, animatedStyle]} />;
}

function EmptyPlants() {
  return (
    <View style={styles.centered}>
      <View style={styles.emptyIcon}>
        <Sprout size={28} color={colors.actionPrimaryHover} strokeWidth={2} />
      </View>
      <Text style={styles.emptyTitle}>Todavía no hay con quién hablar</Text>
      <Text style={styles.emptyBody}>
        Cuando agregues una planta, podrás conversar con ella aquí.
      </Text>
      <Button
        label="Agregar una planta"
        onPress={() => router.push('/plant/nueva')}
        style={styles.emptyButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: layout.gutter,
    paddingBottom: space[2],
  },
  title: {
    ...typography.h3,
    color: colors.textHeading,
  },
  subtitle: {
    ...typography.sm,
    color: colors.textMuted,
    marginTop: space[1] / 2,
  },
  bannerWrap: {
    paddingHorizontal: layout.gutter,
    paddingBottom: space[2],
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.gutter,
  },
  listContent: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[4],
    gap: space[2],
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  rowPlant: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radius.lg,
  },
  bubbleUser: {
    backgroundColor: colors.surfaceBrand,
    borderBottomRightRadius: radius.xs,
  },
  bubblePlant: {
    backgroundColor: colors.surfaceCard,
    borderBottomLeftRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  bubbleText: {
    ...typography.md,
  },
  textUser: {
    color: colors.textOnBrand,
  },
  textPlant: {
    color: colors.textBody,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    paddingVertical: space[4],
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.textFaint,
  },
  errorWrap: {
    paddingHorizontal: layout.gutter,
    paddingBottom: space[2],
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space[2],
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgPageAlt,
  },
  input: {
    flex: 1,
    minHeight: layout.tapMin,
    maxHeight: 120,
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[3],
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
    ...typography.md,
    color: colors.textHeading,
  },
  sendButton: {
    width: layout.tapMin,
    height: layout.tapMin,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.actionPrimary,
  },
  sendButtonDisabled: {
    backgroundColor: colors.borderStrong,
  },
  sendButtonPressed: {
    backgroundColor: colors.actionPrimaryHover,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceBrandSoft,
    marginBottom: space[4],
  },
  emptyTitle: {
    ...typography.h4,
    color: colors.textHeading,
    textAlign: 'center',
  },
  emptyBody: {
    ...typography.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space[2],
    maxWidth: 320,
  },
  emptyButton: {
    marginTop: space[6],
    alignSelf: 'stretch',
  },
});
