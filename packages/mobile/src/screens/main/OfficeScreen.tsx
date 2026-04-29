import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  primary: '#7C3AED',
  bg: '#FFFFFF',
  text: '#1E293B',
  secondary: '#64748B',
  muted: '#94A3B8',
  border: '#E2E8F0',
  green: '#10B981',
  white: '#FFFFFF',
};

interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'offline';
  description: string;
  currentTask: string | null;
  icon: string;
  color: string;
}

const agents: Agent[] = [
  {
    id: 'linda',
    name: 'Linda',
    role: 'AI Secretary',
    status: 'active',
    description: 'Manages tasks, announcements, and team coordination. Responds to messages and voice notes.',
    currentTask: 'Monitoring conversations and task updates',
    icon: '💬',
    color: '#7C3AED',
  },
  {
    id: 'databot',
    name: 'DataBot',
    role: 'Data Analyst',
    status: 'idle',
    description: 'Analyzes spreadsheets, generates reports, and provides data insights for decision-making.',
    currentTask: null,
    icon: '📊',
    color: '#3B82F6',
  },
  {
    id: 'linguabot',
    name: 'LinguaBot',
    role: 'Translator',
    status: 'active',
    description: 'Real-time message translation across 50+ languages. Auto-detects language and translates seamlessly.',
    currentTask: 'Auto-translating chat messages',
    icon: '🌐',
    color: '#10B981',
  },
  {
    id: 'codeassist',
    name: 'CodeAssist',
    role: 'Developer Assistant',
    status: 'idle',
    description: 'Reviews code, suggests improvements, and helps debug technical issues shared in conversations.',
    currentTask: null,
    icon: '🖥️',
    color: '#F59E0B',
  },
  {
    id: 'guardian',
    name: 'Guardian',
    role: 'Security Monitor',
    status: 'active',
    description: 'Monitors for sensitive data leaks, phishing attempts, and suspicious activity in messages.',
    currentTask: 'Scanning messages for security threats',
    icon: '🛡️',
    color: '#EF4444',
  },
  {
    id: 'quickreply',
    name: 'QuickReply',
    role: 'Auto-Responder',
    status: 'idle',
    description: 'Drafts quick replies and suggests responses based on conversation context and tone.',
    currentTask: null,
    icon: '⚡',
    color: '#F97316',
  },
];

export default function OfficeScreen() {
  const activeCount = agents.filter(a => a.status === 'active').length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Office</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.activeDot} />
          <Text style={styles.activeText}>{activeCount} active</Text>
        </View>
      </View>

      {/* Summary Banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerIcon}>🏢</Text>
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle}>{agents.length} AI Agents in your Office</Text>
          <Text style={styles.bannerSubtitle}>
            {activeCount} working right now, {agents.length - activeCount} on standby
          </Text>
        </View>
      </View>

      {/* Agent Cards */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {agents.map((agent) => (
          <View key={agent.id} style={styles.card}>
            <View style={[styles.cardIcon, { backgroundColor: agent.color }]}>
              <Text style={styles.cardIconText}>{agent.icon}</Text>
            </View>
            <View style={styles.cardInfo}>
              <View style={styles.cardNameRow}>
                <Text style={styles.cardName}>{agent.name}</Text>
                <View style={[
                  styles.statusBadge,
                  agent.status === 'active' ? styles.statusActive : styles.statusIdle
                ]}>
                  <View style={[
                    styles.statusDot,
                    { backgroundColor: agent.status === 'active' ? COLORS.green : COLORS.muted }
                  ]} />
                  <Text style={[
                    styles.statusText,
                    { color: agent.status === 'active' ? COLORS.green : COLORS.muted }
                  ]}>
                    {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardRole}>{agent.role}</Text>
              <Text style={styles.cardDesc}>{agent.description}</Text>
              {agent.currentTask && (
                <View style={styles.taskBadge}>
                  <View style={styles.taskDot} />
                  <Text style={styles.taskText}>{agent.currentTask}</Text>
                </View>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.green },
  activeText: { fontSize: 13, color: COLORS.secondary, fontWeight: '500' },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F5F3FF',
    gap: 12,
  },
  bannerIcon: { fontSize: 28 },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  bannerSubtitle: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },

  list: { flex: 1 },
  listContent: { padding: 16, gap: 12 },

  card: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    gap: 12,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardIconText: { fontSize: 22 },
  cardInfo: { flex: 1 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  statusActive: { backgroundColor: '#ECFDF5' },
  statusIdle: { backgroundColor: '#F1F5F9' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '600' },
  cardRole: { fontSize: 12, fontWeight: '600', color: COLORS.primary, marginTop: 2 },
  cardDesc: { fontSize: 12, color: COLORS.secondary, lineHeight: 17, marginTop: 4 },

  taskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    gap: 6,
  },
  taskDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.green },
  taskText: { fontSize: 11, color: '#059669', fontWeight: '500', flex: 1 },
});
