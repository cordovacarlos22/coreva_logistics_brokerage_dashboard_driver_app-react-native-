import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

// DESIGN.md's BottomNavBar: navy background, 4px orange top border, large
// 24px icons, 12px labels, active state = navy pill + orange top indicator.
const TAB_ICONS = { index: 'home', load: 'local-shipping', history: 'history' };

export default function TabsLayout() {
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
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="load" options={{ title: 'Load' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
    </Tabs>
  );
}
