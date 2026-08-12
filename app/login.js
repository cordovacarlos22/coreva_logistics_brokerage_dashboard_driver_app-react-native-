import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext.js';
import Button from '../components/Button.js';

// Built from stitch_coreva_logistics_driver_hub/login/code.html. Biometric
// login is left out of this pass -- expo-local-authentication is real
// follow-up work, not needed to prove the auth pipeline end to end.
export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSignIn() {
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (signInError) setError(signInError.message);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 items-center justify-center px-margin-mobile"
      >
        <View className="w-full max-w-md rounded-lg border border-surface-dim bg-surface-container-lowest p-stack-lg">
          <View className="mb-stack-lg items-center">
            <MaterialIcons name="local-shipping" size={48} color="#00193c" />
            <Text className="mt-stack-sm text-center font-bold text-headline-lg-mobile text-primary">
              Coreva Logistics
            </Text>
            <Text className="mt-2 text-center text-body-md text-on-surface-variant">
              Driver Access Portal
            </Text>
          </View>

          <View className="gap-stack-md">
            <View className="gap-2">
              <Text className="font-medium text-label-lg text-on-surface">Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
                className="h-[56px] rounded border-2 border-outline-variant bg-surface px-4 text-body-md text-on-surface"
              />
            </View>
            <View className="gap-2">
              <Text className="font-medium text-label-lg text-on-surface">Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Enter your password"
                className="h-[56px] rounded border-2 border-outline-variant bg-surface px-4 text-body-md text-on-surface"
              />
            </View>

            {error && <Text className="text-body-md text-error">{error}</Text>}

            <Button label="Sign In" icon="arrow-forward" onPress={handleSignIn} loading={submitting} />
          </View>

          <Text className="mt-stack-lg text-center text-body-md text-on-surface-variant">
            Need help? Contact Dispatch.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
