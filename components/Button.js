import { ActivityIndicator, Pressable, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

// DESIGN.md: "Primary Action Buttons: 56px minimum height. Vibrant Orange
// background with White or Deep Navy text." touch-target-min stays the
// floor for smaller secondary/outline buttons.
const VARIANTS = {
  primary: { container: 'bg-secondary-container active:bg-secondary', text: 'text-on-primary' },
  outline: {
    container: 'border-2 border-primary bg-transparent active:bg-surface-container-low',
    text: 'text-primary',
  },
  ghost: {
    container: 'border-2 border-error bg-transparent active:bg-error-container',
    text: 'text-error',
  },
};

export default function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  className = '',
}) {
  const styles = VARIANTS[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`h-[56px] flex-row items-center justify-center gap-2 rounded ${styles.container} ${
        isDisabled ? 'opacity-50' : ''
      } ${className}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#ffffff' : '#00193c'} />
      ) : (
        <>
          {icon && (
            <MaterialIcons
              name={icon}
              size={22}
              color={variant === 'primary' ? '#ffffff' : variant === 'ghost' ? '#ba1a1a' : '#00193c'}
            />
          )}
          <Text className={`font-medium text-button-text ${styles.text}`}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
