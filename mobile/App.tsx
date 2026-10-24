import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { TabBar, type TabKey } from './src/components/TabBar';
import { AssistantScreen } from './src/screens/AssistantScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { SensorsScreen } from './src/screens/SensorsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { GreenhouseProvider } from './src/state/greenhouse';
import { SettingsProvider, useSettings } from './src/state/settings';
import { colors } from './src/theme';

function Shell() {
  const { loaded, configured } = useSettings();
  const [tab, setTab] = useState<TabKey>('dashboard');

  useEffect(() => {
    if (loaded && !configured) setTab('settings');
    // Only on first load; afterwards the user navigates freely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  if (!loaded) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Screens stay mounted so chat history and scroll position survive tab switches.
  const pane = (key: TabKey) => [styles.fill, tab !== key && styles.hidden];
  return (
    <SafeAreaView style={styles.fill} edges={['top', 'left', 'right']}>
      <View style={pane('dashboard')}>
        <DashboardScreen onOpenAssistant={() => setTab('assistant')} onOpenSettings={() => setTab('settings')} />
      </View>
      <View style={pane('sensors')}>
        <SensorsScreen active={tab === 'sensors'} />
      </View>
      <View style={pane('assistant')}>
        <AssistantScreen active={tab === 'assistant'} onOpenSettings={() => setTab('settings')} />
      </View>
      <View style={pane('settings')}>
        <SettingsScreen />
      </View>
      <TabBar active={tab} onChange={setTab} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={[styles.fill, { backgroundColor: colors.bg }]}>
        <SettingsProvider>
          <GreenhouseProvider>
            <Shell />
          </GreenhouseProvider>
        </SettingsProvider>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  hidden: { display: 'none' },
});
