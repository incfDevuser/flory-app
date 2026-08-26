import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  CheckCircle2,
  Images,
  Leaf,
  RefreshCw,
  Search,
  X,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SpeciesChoice } from '@/components/onboarding/onboarding-draft';
import { Banner } from '@/components/ui/banner';
import { FloryMascot } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import {
  identifyPlant,
  resolveIdentification,
  type IdentificationCatalogSpecies,
  type IdentificationNonPlantKind,
  type IdentificationProposal,
  type IdentificationSuccess,
} from '@/lib/ai';
import {
  border,
  colors,
  elevation,
  fonts,
  layout,
  radius,
  space,
  type as typography,
} from '@/theme/tokens';

type LocalPhoto = {
  uri: string;
  width: number;
  height: number;
};

type SheetPhase =
  | { kind: 'choose' }
  | { kind: 'analyzing' }
  | { kind: 'error'; message: string; canRetry: boolean }
  | { kind: 'result'; result: IdentificationSuccess };

export type SpeciesIdentificationSheetProps = {
  visible: boolean;
  offline: boolean;
  onClose: () => void;
  onConfirm: (species: SpeciesChoice, attemptId: string) => void;
  onUnknown: (species: SpeciesChoice, attemptId: string) => void;
  onSearch: (attemptId: string, suggestedQuery?: string) => void;
};

const UNKNOWN_SPECIES: SpeciesChoice = {
  id: null,
  commonName: 'Planta por identificar',
  scientificName: null,
  imageUrl: null,
  approximate: true,
};

const NON_PLANT_COPY: Record<IdentificationNonPlantKind, { title: string; body: string }> = {
  artificial: {
    title: 'Parece que no necesito agua',
    body: 'Veo una planta artificial. Probemos con una foto de la planta viva que quieres cuidar.',
  },
  flores_cortadas: {
    title: 'Veo flores cortadas',
    body: 'Parece un ramo o flores en un florero. Para crear cuidados necesito ver una planta viva en su maceta.',
  },
  planta_muerta: {
    title: 'No encuentro tejido vivo',
    body: 'Esta planta parece estar completamente seca. Probemos con otra foto si todavía ves hojas o tallos vivos.',
  },
  no_es_planta: {
    title: 'No encuentro una planta',
    body: 'Probemos con otra foto donde se vea una sola planta viva en su maceta.',
  },
  multiples_plantas: {
    title: 'Veo más de una planta',
    body: 'No sé cuál de ellas soy. Probemos de nuevo enfocando una sola especie.',
  },
  foto_ilegible: {
    title: 'No logro verme bien',
    body: 'Probemos de cerca, con buena luz y mostrando mis hojas completas.',
  },
};

export function SpeciesIdentificationSheet({
  visible,
  offline,
  onClose,
  onConfirm,
  onUnknown,
  onSearch,
}: SpeciesIdentificationSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [phase, setPhase] = useState<SheetPhase>({ kind: 'choose' });
  const [pickerPending, setPickerPending] = useState(false);
  const [resolvePending, setResolvePending] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const pickerLaunchedRef = useRef(false);
  const pickerResultHandledRef = useRef(false);
  const checkingPendingRef = useRef(false);
  const resolutionHandledRef = useRef(false);
  const analysisRunRef = useRef(0);
  const handlePickerResultRef = useRef<
    (
      result: ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult
    ) => Promise<void>
  >(async () => {});
  const liveResultRef = useRef<IdentificationSuccess | null>(null);

  const busy = pickerPending || phase.kind === 'analyzing' || resolvePending;
  const liveResult = phase.kind === 'result' ? phase.result : null;
  liveResultRef.current = liveResult;

  useEffect(() => {
    if (!visible) {
      const unresolved = liveResultRef.current;
      if (unresolved && !resolutionHandledRef.current) {
        resolutionHandledRef.current = true;
        void resolveIdentification(unresolved.attemptId, 'abandono').catch(() => {});
      }
      analysisRunRef.current += 1;
      setPhoto(null);
      setPhase({ kind: 'choose' });
      setPickerPending(false);
      setResolvePending(false);
      setResolveError(null);
      resolutionHandledRef.current = false;
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    async function recoverPendingPickerResult() {
      // This marker is set only by this mounted flow. After a process restart it is false,
      // so a pending result belonging to another picker is deliberately left untouched.
      if (!pickerLaunchedRef.current || checkingPendingRef.current) return;
      checkingPendingRef.current = true;
      try {
        const result = await ImagePicker.getPendingResultAsync();
        if (result) await handlePickerResultRef.current(result);
      } finally {
        checkingPendingRef.current = false;
      }
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recoverPendingPickerResult();
    });
    void recoverPendingPickerResult();
    return () => subscription.remove();
  }, [visible]);

  useEffect(
    () => () => {
      const unresolved = liveResultRef.current;
      if (unresolved && !resolutionHandledRef.current) {
        resolutionHandledRef.current = true;
        void resolveIdentification(unresolved.attemptId, 'abandono').catch(() => {});
      }
    },
    []
  );

  async function choosePhoto(source: 'camera' | 'library') {
    if (busy) return;
    setResolveError(null);

    let permission: ImagePicker.PermissionResponse;
    try {
      permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
    } catch {
      Alert.alert('No pude abrir la foto', 'Probemos de nuevo en un momento.');
      return;
    }

    if (!permission.granted) {
      Alert.alert(
        source === 'camera' ? 'Necesito la cámara' : 'Necesito tus fotos',
        'Para reconocerme necesito ver una foto. Puedes darme acceso desde los ajustes del teléfono.',
        [
          { text: 'Ahora no', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    setPickerPending(true);
    pickerLaunchedRef.current = true;
    pickerResultHandledRef.current = false;
    try {
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              quality: 1,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              quality: 1,
            });
      await handlePickerResult(result);
    } catch {
      setPhase({
        kind: 'error',
        message: 'No pude abrir esa foto. ¿Probamos con otra?',
        canRetry: false,
      });
    } finally {
      pickerLaunchedRef.current = false;
      setPickerPending(false);
    }
  }

  async function handlePickerResult(
    result: ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult
  ) {
    if (pickerResultHandledRef.current) return;
    pickerResultHandledRef.current = true;
    if ('code' in result) {
      pickerLaunchedRef.current = false;
      setPickerPending(false);
      setPhase({
        kind: 'error',
        message: 'No pude recuperar esa foto. ¿Probamos con otra?',
        canRetry: false,
      });
      return;
    }
    if (result.canceled) {
      pickerLaunchedRef.current = false;
      setPickerPending(false);
      return;
    }

    const asset = result.assets[0];
    if (!asset || asset.type === 'video') {
      setPhase({
        kind: 'error',
        message: 'Necesito una foto para reconocerme. ¿Probamos con otra?',
        canRetry: false,
      });
      return;
    }

    pickerLaunchedRef.current = false;
    const nextPhoto = { uri: asset.uri, width: asset.width, height: asset.height };
    setPhoto(nextPhoto);
    await analyze(nextPhoto);
  }
  handlePickerResultRef.current = handlePickerResult;

  async function analyze(target: LocalPhoto) {
    if (offline) {
      setPhase({
        kind: 'error',
        message: 'Estoy sin conexión. Dejo esta foto lista para probar cuando vuelva la red.',
        canRetry: true,
      });
      return;
    }

    const run = analysisRunRef.current + 1;
    analysisRunRef.current = run;
    setResolveError(null);
    setPhase({ kind: 'analyzing' });
    const result = await identifyPlant(target.uri, target.width, target.height);
    if (run !== analysisRunRef.current) return;

    if (!result.ok) {
      setPhase({
        kind: 'error',
        message: result.message,
        canRetry: result.kind !== 'no_session',
      });
      return;
    }

    resolutionHandledRef.current = false;
    setPhase({ kind: 'result', result });
  }

  function close() {
    if (busy) return;
    if (liveResult && !resolutionHandledRef.current) {
      resolutionHandledRef.current = true;
      void resolveIdentification(liveResult.attemptId, 'abandono').catch(() => {});
    }
    onClose();
  }

  function search(attemptId: string, suggestedQuery?: string) {
    if (resolvePending) return;
    resolutionHandledRef.current = true;
    onSearch(attemptId, suggestedQuery);
  }

  async function confirm(result: IdentificationSuccess, provisional: boolean) {
    if (resolvePending) return;
    setResolvePending(true);
    setResolveError(null);
    try {
      const resolution = await resolveIdentification(result.attemptId, 'confirmo');
      if (!resolution.species) throw new Error('No pude guardar tu elección. Inténtalo de nuevo.');
      resolutionHandledRef.current = true;
      onConfirm(
        {
          id: resolution.species.id,
          commonName: resolution.species.commonName,
          scientificName: resolution.species.scientificName,
          imageUrl: null,
          approximate: provisional ? true : resolution.species.approximate,
        },
        result.attemptId
      );
    } catch (error) {
      setResolveError(
        error instanceof Error
          ? error.message
          : 'No pude guardar tu elección. Inténtalo de nuevo en un momento.'
      );
    } finally {
      setResolvePending(false);
    }
  }

  async function chooseUnknown(attemptId: string) {
    if (resolvePending) return;
    setResolvePending(true);
    setResolveError(null);
    try {
      await resolveIdentification(attemptId, 'no_sabe');
      resolutionHandledRef.current = true;
      onUnknown(UNKNOWN_SPECIES, attemptId);
    } catch (error) {
      setResolveError(
        error instanceof Error
          ? error.message
          : 'No pude guardar tu elección. Inténtalo de nuevo en un momento.'
      );
    } finally {
      setResolvePending(false);
    }
  }

  function retake() {
    if (busy) return;
    if (liveResult && !resolutionHandledRef.current) {
      resolutionHandledRef.current = true;
      void resolveIdentification(liveResult.attemptId, 'abandono').catch(() => {});
    }
    setPhoto(null);
    setResolveError(null);
    setPhase({ kind: 'choose' });
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.modal}>
        <Pressable
          accessibilityLabel="Cerrar identificación"
          disabled={busy}
          onPress={close}
          style={styles.backdrop}
        />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, space[4]) + space[2],
              maxHeight: windowHeight - Math.max(insets.top, space[3]),
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>IDENTIFICACIÓN CON FOTO</Text>
              <Text style={styles.title}>{titleForPhase(phase)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar identificación"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={close}
              style={styles.close}
            >
              <X size={21} color={colors.textMuted} strokeWidth={2.2} />
            </Pressable>
          </View>

          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            {phase.kind === 'choose' ? (
              <ChooseState
                offline={offline}
                pickerPending={pickerPending}
                onCamera={() => void choosePhoto('camera')}
                onLibrary={() => void choosePhoto('library')}
              />
            ) : null}

            {phase.kind === 'analyzing' ? <AnalyzingState photo={photo} /> : null}

            {phase.kind === 'error' ? (
              <ErrorState
                photo={photo}
                message={phase.message}
                canRetry={phase.canRetry}
                offline={offline}
                onRetry={() => {
                  if (photo) void analyze(photo);
                }}
                onRetake={retake}
              />
            ) : null}

            {phase.kind === 'result' && phase.result.nonPlant ? (
              <NonPlantState
                kind={phase.result.nonPlant.kind}
                photo={photo}
                onRetake={retake}
              />
            ) : null}

            {phase.kind === 'result' && phase.result.catalogSpecies ? (
              <CatalogState
                species={phase.result.catalogSpecies}
                photo={photo}
                pending={resolvePending}
                error={resolveError}
                onConfirm={() => void confirm(phase.result, false)}
                onSearch={(query) => search(phase.result.attemptId, query)}
                onUnknown={() => void chooseUnknown(phase.result.attemptId)}
              />
            ) : null}

            {phase.kind === 'result' && phase.result.proposal ? (
              <ProposalState
                proposal={phase.result.proposal}
                photo={photo}
                pending={resolvePending}
                error={resolveError}
                onConfirm={() => void confirm(phase.result, true)}
                onSearch={(query) => search(phase.result.attemptId, query)}
                onUnknown={() => void chooseUnknown(phase.result.attemptId)}
              />
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ChooseState({
  offline,
  pickerPending,
  onCamera,
  onLibrary,
}: {
  offline: boolean;
  pickerPending: boolean;
  onCamera: () => void;
  onLibrary: () => void;
}) {
  return (
    <View style={styles.state}>
      <FloryMascot pose="idea" height={148} style={styles.hero} />
      <Text style={styles.bodyCenter}>
        Muéstrame entera, con buena luz y una sola especie en la maceta. Voy a darte una
        sugerencia, no una certeza.
      </Text>
      {offline ? (
        <Banner tone="offline" message="Necesito conexión para reconocerme en una foto." />
      ) : null}
      <View style={styles.actions}>
        <Button
          label="Tomar una foto"
          disabled={offline}
          loading={pickerPending}
          onPress={onCamera}
          leadingIcon={<Camera size={20} color={colors.textOnBrand} strokeWidth={2.2} />}
        />
        <Button
          label="Elegir de galería"
          variant="secondary"
          disabled={offline || pickerPending}
          onPress={onLibrary}
          leadingIcon={<Images size={20} color={colors.textHeading} strokeWidth={2.2} />}
        />
      </View>
    </View>
  );
}

function AnalyzingState({ photo }: { photo: LocalPhoto | null }) {
  return (
    <View style={styles.state} accessibilityLiveRegion="polite">
      <PhotoPreview photo={photo} overlay>
        <ActivityIndicator size="large" color={colors.textOnBrand} />
      </PhotoPreview>
      <Text style={styles.resultTitle}>Estoy mirando mis hojas…</Text>
      <Text style={styles.bodyCenter}>Comparo mi forma y mis colores con el catálogo.</Text>
    </View>
  );
}

function ErrorState({
  photo,
  message,
  canRetry,
  offline,
  onRetry,
  onRetake,
}: {
  photo: LocalPhoto | null;
  message: string;
  canRetry: boolean;
  offline: boolean;
  onRetry: () => void;
  onRetake: () => void;
}) {
  return (
    <View style={styles.state}>
      <PhotoPreview photo={photo} />
      <Banner tone={offline ? 'offline' : 'atencion'} message={message} />
      <View style={styles.actions}>
        {photo && canRetry ? (
          <Button
            label="Probar de nuevo"
            disabled={offline}
            onPress={onRetry}
            leadingIcon={<RefreshCw size={19} color={colors.textOnBrand} strokeWidth={2.2} />}
          />
        ) : (
          <Button label="Elegir otra foto" onPress={onRetake} />
        )}
        {photo && canRetry ? (
          <Button label="Elegir otra foto" variant="ghost" onPress={onRetake} />
        ) : null}
      </View>
    </View>
  );
}

function NonPlantState({
  kind,
  photo,
  onRetake,
}: {
  kind: IdentificationNonPlantKind;
  photo: LocalPhoto | null;
  onRetake: () => void;
}) {
  const copy = NON_PLANT_COPY[kind];
  return (
    <View style={styles.state}>
      <PhotoPreview photo={photo} />
      <View style={styles.resultCopy}>
        <Text style={styles.resultTitle}>{copy.title}</Text>
        <Text style={styles.bodyCenter}>{copy.body}</Text>
      </View>
      <Button
        label="Tomar otra foto"
        onPress={onRetake}
        leadingIcon={<Camera size={20} color={colors.textOnBrand} strokeWidth={2.2} />}
      />
    </View>
  );
}

function CatalogState({
  species,
  photo,
  pending,
  error,
  onConfirm,
  onSearch,
  onUnknown,
}: {
  species: IdentificationCatalogSpecies;
  photo: LocalPhoto | null;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onSearch: (query?: string) => void;
  onUnknown: () => void;
}) {
  const low = species.confidence === 'baja';
  const medium = species.confidence === 'media';
  const heading = low
    ? 'No estoy segura de mi especie'
    : medium
      ? `Podría ser ${species.commonName}`
      : `¿Soy ${species.commonName}?`;
  const body = low
    ? `Me parezco a ${species.commonName}, pero la foto no alcanza para afirmarlo.`
    : medium
      ? 'Esta es mi mejor coincidencia, aunque hay plantas parecidas. Tú tienes la última palabra.'
      : 'Esta es la coincidencia más clara que encontré en el catálogo. Confírmala si te hace sentido.';

  return (
    <View style={styles.state} pointerEvents={pending ? 'none' : 'auto'}>
      <PhotoPreview photo={photo} />
      <ConfidenceLabel confidence={species.confidence} />
      <View style={styles.resultCopy}>
        <Text style={styles.resultTitle}>{heading}</Text>
        <Text style={styles.scientific}>{species.scientificName}</Text>
        <Text style={styles.bodyCenter}>{body}</Text>
      </View>
      {species.alternatives.length > 0 && species.confidence !== 'alta' ? (
        <AlternativeList alternatives={species.alternatives} onSearch={onSearch} />
      ) : null}
      {error ? <Banner message={error} /> : null}
      <View style={styles.actions}>
        {!low ? (
          <Button
            label={medium ? 'Sí, usar esta especie' : 'Sí, esa soy yo'}
            loading={pending}
            onPress={onConfirm}
            leadingIcon={<CheckCircle2 size={20} color={colors.textOnBrand} strokeWidth={2.2} />}
          />
        ) : (
          <Button
            label="Buscar mi especie"
            loading={pending}
            onPress={() => onSearch(species.scientificName)}
            leadingIcon={<Search size={20} color={colors.textOnBrand} strokeWidth={2.2} />}
          />
        )}
        {!low ? (
          <Button
            label="No, buscar otra"
            variant="secondary"
            disabled={pending}
            onPress={() => onSearch(species.scientificName)}
          />
        ) : null}
        {low ? (
          <Button
            label="Continuar sin identificarme"
            variant="ghost"
            loading={pending}
            onPress={onUnknown}
          />
        ) : null}
      </View>
    </View>
  );
}

function ProposalState({
  proposal,
  photo,
  pending,
  error,
  onConfirm,
  onSearch,
  onUnknown,
}: {
  proposal: IdentificationProposal;
  photo: LocalPhoto | null;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onSearch: (query?: string) => void;
  onUnknown: () => void;
}) {
  return (
    <View style={styles.state} pointerEvents={pending ? 'none' : 'auto'}>
      <PhotoPreview photo={photo} />
      <ConfidenceLabel confidence={proposal.confidence} />
      <View style={styles.firstTime}>
        <Leaf size={19} color={colors.actionPrimaryHover} strokeWidth={2.2} />
        <Text style={styles.firstTimeText}>Es la primera vez que veo esta especie en Flory</Text>
      </View>
      <View style={styles.resultCopy}>
        <Text style={styles.resultTitle}>¿Podría ser {proposal.commonName}?</Text>
        <Text style={styles.scientific}>{proposal.scientificName}</Text>
        <Text style={styles.bodyCenter}>
          Si la eliges, empezaré con cuidados aproximados y quedará señalado en mi ficha.
        </Text>
      </View>
      {proposal.alternatives.length > 0 ? (
        <AlternativeList alternatives={proposal.alternatives} onSearch={onSearch} />
      ) : null}
      {error ? <Banner message={error} /> : null}
      <View style={styles.actions}>
        <Button
          label="Sí, usar esta opción"
          loading={pending}
          onPress={onConfirm}
          leadingIcon={<CheckCircle2 size={20} color={colors.textOnBrand} strokeWidth={2.2} />}
        />
        <Button
          label="No, buscar otra"
          variant="secondary"
          disabled={pending}
          onPress={() => onSearch(proposal.scientificName)}
        />
        <Button
          label="Continuar sin identificarme"
          variant="ghost"
          disabled={pending}
          onPress={onUnknown}
        />
      </View>
    </View>
  );
}

function ConfidenceLabel({
  confidence,
}: {
  confidence: IdentificationCatalogSpecies['confidence'];
}) {
  const label =
    confidence === 'alta'
      ? 'Coincidencia clara'
      : confidence === 'media'
        ? 'Coincidencia posible'
        : 'Coincidencia incierta';
  return (
    <View style={[styles.confidence, confidence === 'baja' ? styles.confidenceLow : null]}>
      <Text style={styles.confidenceText}>{label}</Text>
    </View>
  );
}

function AlternativeList({
  alternatives,
  onSearch,
}: {
  alternatives: string[];
  onSearch: (query: string) => void;
}) {
  return (
    <View style={styles.alternatives}>
      <Text style={styles.alternativesTitle}>También podría parecerme a</Text>
      {alternatives.map((alternative) => (
        <Pressable
          key={alternative}
          accessibilityRole="button"
          accessibilityLabel={`Buscar ${alternative}`}
          onPress={() => onSearch(alternative)}
          style={styles.alternative}
        >
          <Text style={styles.alternativeText}>{alternative}</Text>
          <Search size={18} color={colors.actionPrimaryHover} strokeWidth={2.2} />
        </Pressable>
      ))}
    </View>
  );
}

function PhotoPreview({
  photo,
  overlay = false,
  children,
}: {
  photo: LocalPhoto | null;
  overlay?: boolean;
  children?: React.ReactNode;
}) {
  if (!photo) return null;
  return (
    <View style={styles.preview}>
      <Image source={photo.uri} contentFit="cover" transition={160} style={styles.previewImage} />
      {overlay ? <View style={styles.previewOverlay}>{children}</View> : children}
    </View>
  );
}

function titleForPhase(phase: SheetPhase): string {
  if (phase.kind === 'choose') return '¿Qué planta soy?';
  if (phase.kind === 'analyzing') return 'Estoy reconociéndome';
  if (phase.kind === 'error') return 'No pude reconocerme';
  if (phase.result.nonPlant) return 'Probemos con otra foto';
  return 'Esto es lo que encontré';
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,75,46,0.32)',
  },
  sheet: {
    paddingTop: space[3],
    paddingHorizontal: layout.gutter,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    backgroundColor: colors.bgPageAlt,
    ...elevation.lg,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.borderDefault,
    alignSelf: 'center',
    marginBottom: space[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    marginBottom: space[3],
  },
  headerCopy: {
    flex: 1,
    gap: space[1],
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.actionPrimaryHover,
  },
  title: {
    ...typography.h3,
    color: colors.textHeading,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  content: {
    paddingBottom: space[2],
  },
  state: {
    gap: space[4],
  },
  hero: {
    alignSelf: 'center',
  },
  bodyCenter: {
    ...typography.md,
    color: colors.textBody,
    textAlign: 'center',
  },
  actions: {
    gap: space[2],
  },
  preview: {
    height: 184,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,75,46,0.48)',
  },
  resultCopy: {
    alignItems: 'center',
    gap: space[1],
  },
  resultTitle: {
    ...typography.h3,
    color: colors.textHeading,
    textAlign: 'center',
  },
  scientific: {
    ...typography.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: space[2],
  },
  confidence: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.pill,
    backgroundColor: colors.statusBienSoft,
  },
  confidenceLow: {
    backgroundColor: colors.statusAtencionSoft,
  },
  confidenceText: {
    ...typography.xs,
    fontFamily: fonts.bodyBold,
    color: colors.textBody,
  },
  firstTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    padding: space[3],
    borderRadius: radius.md,
    borderWidth: border.width,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceBrandSoft,
  },
  firstTimeText: {
    ...typography.sm,
    flex: 1,
    fontFamily: fonts.bodySemibold,
    color: colors.textBody,
  },
  alternatives: {
    gap: space[2],
  },
  alternativesTitle: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
  },
  alternative: {
    minHeight: layout.tapMin,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radius.md,
    borderWidth: border.width,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  alternativeText: {
    ...typography.sm,
    flex: 1,
    color: colors.textBody,
    fontStyle: 'italic',
  },
});
