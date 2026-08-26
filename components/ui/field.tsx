import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { border, colors, elevation, fonts, radius, space, type as typography } from '@/theme/tokens';

type FieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Reemplaza al hint cuando aparece. Nunca culpa al usuario. */
  error?: boolean;
  hint?: string;
  /** Glifo de Lucide a la izquierda, dentro del campo. */
  leadingIcon?: ReactNode;
  /** Zona táctil derecha: el ojo de contraseña vive aquí. */
  trailingSlot?: ReactNode;
};

/**
 * Alto 50, radio 16, borde 1.5, foco con halo verde — las métricas de formulario
 * del design system (§8.2).
 *
 * `error` es booleano a propósito: pinta el campo, pero **no** escribe el mensaje.
 * En auth el texto del error va una sola vez bajo el formulario, no colgando de un
 * campo, porque decir cuál de los dos falló permite enumerar cuentas (FlorySpec §99).
 */
export function Field({ label, error = false, hint, leadingIcon, trailingSlot, ...inputProps }: FieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <View
        style={[
          styles.box,
          focused ? styles.boxFocused : null,
          error ? styles.boxError : null,
          // El halo es sombra, no borde: cambiar el ancho del borde al enfocar
          // desplazaría el texto un pixel y medio cada vez que entras al campo.
          focused && !error ? styles.ring : elevation.xs,
        ]}
      >
        {leadingIcon ? <View style={styles.leading}>{leadingIcon}</View> : null}

        <TextInput
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.actionPrimary}
          {...inputProps}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          style={styles.input}
        />

        {trailingSlot ? <View style={styles.trailing}>{trailingSlot}</View> : null}
      </View>

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: space[2],
  },
  label: {
    // §8.2: etiqueta en display 700 a 14px.
    ...typography.sm,
    fontFamily: fonts.displayBold,
    color: colors.textHeading,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: radius.md,
    borderWidth: border.width,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: space[4],
    gap: space[3],
  },
  boxFocused: {
    borderColor: colors.borderFocus,
  },
  boxError: {
    // Ámbar, jamás rojo: el rojo dispara culpa y el usuario ya llega con culpa
    // (FlorySpec §18).
    borderColor: colors.statusAtencion,
  },
  ring: {
    shadowColor: colors.actionPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 0,
  },
  leading: {
    justifyContent: 'center',
  },
  trailing: {
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: '100%',
    ...typography.md,
    color: colors.textBody,
    // Nunito también trae font padding: sin esto el texto se apoya en el borde
    // inferior del campo en Android.
    includeFontPadding: false,
    paddingVertical: 0,
  },
  hint: {
    ...typography.xs,
    color: colors.textMuted,
  },
});
