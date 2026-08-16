import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useChatBadge } from '../../contexts/ChatBadgeContext.js';

// DESIGN.md's BottomNavBar: navy background, 4px orange top border, large
// 24px icons, 12px labels, active state = navy pill + orange top indicator.
// Renamed from Home/Load/History (Phase 1) to match Carlos's wireframe:
// Activate Shipment (assigned-not-started loads) / Current Load (the
// active step-by-step flow) / Load History.
const TAB_ICONS = {
  index: 'assignment-turned-in',
  load: 'local-shipping',
  chat: 'chat',
  history: 'history',
};

export default function TabsLayout() {
  const { count } = useChatBadge();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: '#7796d1',
        tabBarStyle: {
          backgroundColor: '#00193c',
          borderTopWidth: 4,
          borderTopColor: '#fd8b00',
          height: 64,
        },
        tabBarLabelStyle: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
        tabBarIcon: ({ color }) => (
          <MaterialIcons name={TAB_ICONS[route.name]} size={24} color={color} />
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Activate' }} />
      <Tabs.Screen name="load" options={{ title: 'Current Load' }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarBadge: count > 0 ? count : undefined }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
    </Tabs>
  );
}
