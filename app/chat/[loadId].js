import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useChatBadge } from '../../contexts/ChatBadgeContext.js';
import { fetchLoadMessages, sendLoadMessage, subscribeToLoadMessages } from '../../lib/chat.js';
import ScreenHeader from '../../components/ScreenHeader.js';
import Button from '../../components/Button.js';

// Driver's side of the direct customer<->driver thread (load_messages,
// channel='driver') -- the web dashboard's side (Load Detail's Messages
// card, "driver" tab) has been live for a while; drivers being mobile-only
// meant this side never got built until now. Unlike the web UI, there's no
// channel switcher here -- a driver only ever has this one thread, never
// the staff-facing 'dispatch' channel.
export default function LoadChat() {
  const { loadId } = useLocalSearchParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const insets = useSafeAreaInsets();
  const { clear: clearBadge } = useChatBadge();

  const refresh = useCallback(() => {
    fetchLoadMessages(supabase, loadId)
      .then(setMessages)
      .catch((err) => setError(err.message));
  }, [loadId]);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeToLoadMessages(supabase, loadId, refresh);
    return unsubscribe;
  }, [refresh, loadId]);

  // Opening this screen is what "reading" the message means here --
  // persists a per-load "last viewed" timestamp (see ChatBadgeContext),
  // not just an in-memory reset, so the badge stays correct across app
  // restarts too.
  useEffect(() => {
    clearBadge(loadId);
  }, [clearBadge, loadId]);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      await sendLoadMessage(supabase, { loadId, senderId: user.id, body: trimmed });
      setBody('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <ScreenHeader title="Message Customer" showBack />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        // Screens with a scrollable body + button-at-the-end (checklist,
        // delivery) don't need this -- the button just scrolls with the
        // content. This screen pins the input bar to the bottom instead, so
        // the offset has to actually match the real distance from the
        // screen's top edge to this view: the safe-area inset SafeAreaView
        // already consumed (its `edges` padding isn't visible to
        // KeyboardAvoidingView) plus ScreenHeader's fixed 48px height.
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
