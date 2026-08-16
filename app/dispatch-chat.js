import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useChatBadge } from '../contexts/ChatBadgeContext.js';
import { fetchDriverMessages, sendDriverMessage, subscribeToDriverMessages } from '../lib/driverMessages.js';
import ScreenHeader from '../components/ScreenHeader.js';
import Button from '../components/Button.js';

// Driver's side of the load-independent dispatch thread (driver_messages)
// -- always just "my own thread with dispatch," no loadId needed, unlike
// app/chat/[loadId].js (the per-load customer thread) which this otherwise
// mirrors exactly.
export default function DispatchChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const insets = useSafeAreaInsets();
  const { clear: clearBadge } = useChatBadge();

  const refresh = useCallback(() => {
    if (!user) return;
    fetchDriverMessages(supabase, user.id)
      .then(setMessages)
      .catch((err) => setError(err.message));
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    refresh();
    const unsubscribe = subscribeToDriverMessages(supabase, user.id, refresh);
    return unsubscribe;
  }, [refresh, user]);

  useEffect(() => {
    clearBadge('dispatch');
  }, [clearBadge]);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed || !user) return;
    setSending(true);
    setError(null);
    try {
      await sendDriverMessage(supabase, { driverId: user.id, senderId: user.id, body: trimmed });
      setBody('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <ScreenHeader title="Message Dispatch" showBack />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 48 : 0}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-margin-mobile"
          contentContainerClassName="gap-stack-sm py-stack-md"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages === null && !error && (
            <Text className="text-center text-body-md text-on-surface-variant">Loading…</Text>
          )}
          {messages?.length === 0 && (
            <Text className="text-center text-body-md text-on-surface-variant">No messages yet.</Text>
          )}
          {messages?.map((message) => {
            const own = message.sender_id === user?.id;
            return (
              <View
                key={message.id}
                className={`max-w-[80%] ${own ? 'self-end items-end' : 'self-start items-start'}`}
              >
                <View
                  className={`rounded-lg px-3 py-2 ${
                    own ? 'bg-secondary-container' : 'border border-outline-variant bg-surface-container-lowest'
                  }`}
                >
                  <Text className={own ? 'text-on-primary' : 'text-on-surface'}>{message.body}</Text>
                </View>
                <Text className="mt-1 text-label-lg text-outline">
                  {message.sender?.full_name ?? 'Unknown'} · {new Date(message.created_at).toLocaleTimeString()}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {error && (
          <Text className="mx-margin-mobile mb-2 rounded border border-error bg-error-container p-2 text-body-md text-error">
            {error}
          </Text>
        )}

        <View className="flex-row items-end gap-stack-sm border-t border-outline-variant bg-surface-container-lowest px-margin-mobile py-stack-sm">
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Type a message…"
            multiline
            className="max-h-24 flex-1 rounded-lg border border-outline-variant bg-background px-3 py-2 text-body-md text-on-surface"
          />
          <Button label="Send" onPress={handleSend} loading={sending} disabled={!body.trim()} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
