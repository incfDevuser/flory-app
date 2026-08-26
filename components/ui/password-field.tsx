import { Eye, EyeOff, Lock } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, type TextInputProps } from 'react-native';

import { Field } from '@/components/ui/field';
import { colors, space } from '@/theme/tokens';

type PasswordFieldProps = Omit<TextInputProps, 'style' | 'secureTextEntry'> & {
  label?: string;
  error?: boolean;
  hint?: string;
};

/**
 * Campo de contraseña con toggle mostrar/ocultar (FlorySpec §88).
 *
 * Existe como componente propio porque lo usan sign-in y sign-up con el mismo
 * comportamiento, y porque el toggle tiene detalles fáciles de olvidar: el estado
 * arranca oculto siempre y el botón necesita nombre accesible.
 */
export function PasswordField({ label = 'Contraseña', error, hint, ...inputProps }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      // Sin esto iOS ofrece la contraseña guardada como texto y luego la enmascara
      // a destiempo, dejando un frame con la contraseña visible.
      textContentType={inputProps.autoComplete === 'new-password' ? 'newPassword' : 'password'}
      leadingIcon={<Lock size={18} color={colors.textFaint} strokeWidth={2.2} />}
      trailingSlot={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          onPress={() => setVisible((v) => !v)}
          hitSlop={space[3]}
          style={styles.toggle}
        >
          <Icon size={18} color={colors.textMuted} strokeWidth={2.2} />
        </Pressable>
      }
      {...inputProps}
    />
  );
}

const styles = StyleSheet.create({
  toggle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
