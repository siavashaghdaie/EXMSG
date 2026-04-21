import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { api } from '@/services/api';

const COLORS = {
  primary: '#7C3AED',
  bg: '#FFFFFF',
  text: '#1E293B',
  secondary: '#64748B',
  muted: '#94A3B8',
  border: '#F1F5F9',
  inputBg: '#F1F5F9',
  lightPurple: '#F3F0FF',
  white: '#FFFFFF',
  green: '#10B981',
  amber: '#F59E0B',
  blue: '#3B82F6',
  red: '#EF4444',
};

interface AgentDef {
  id: string;
  name: string;
  description: string;
  category: 'Productivity' | 'Communication' | 'Analysis' | 'Security';
  icon: string;
  iconBg: string;
  capabilities: string[];
  status?: 'mandatory' | 'popular';
}

const AGENTS: AgentDef[] = [
  {
    id: 'linda',
    name: 'Linda',
    description: 'AI secretary that manages your conversations, schedules, and daily tasks with natural language understanding.',
    category: 'Productivity',
    icon: 'AI',
    iconBg: '#7C3AED',
    capabilities: ['Message summarization', 'Meeting scheduling', 'Task delegation', 'Smart replies'],
    status: 'mandatory',
  },
  {
    id: 'analyst',
    name: 'DataBot',
    description: 'Analyzes conversations and documents to extract insights, trends, and actionable data for your team.',
    category: 'Analysis',
    icon: '\uD83D\uDCCA',
    iconBg: '#3B82F6',
    capabilities: ['Conversation analytics', 'Sentiment analysis', 'Report generation', 'Trend detection'],
  },
  {
    id: 'translator',
    name: 'LinguaBot',
    description: 'Real-time message translation across 50+ languages with context-aware accuracy for global teams.',
    category: 'Communication',
    icon: '\uD83C\uDF10',
    iconBg: '#10B981',
    capabilities: ['Real-time translation', 'Language detection', 'Cultural context', 'Multi-language threads'],
    status: 'popular',
  },
  {
    id: 'codebot',
    name: 'CodeAssist',
    description: 'Helps developers share, review, and discuss code snippets with syntax highlighting and AI suggestions.',
    category: 'Productivity',
    icon: '\uD83D\uDCBB',
    iconBg: '#F59E0B',
    capabilities: ['Code review', 'Syntax highlighting', 'Bug detection', 'Documentation'],
  },
  {
    id: 'guardian',
    name: 'Guardian',
    description: 'Monitors conversations for compliance, sensitive data leaks, and policy violations in real-time.',
    category: 'Security',
    icon: '\uD83D\uDEE1',
    iconBg: '#EF4444',
    capabilities: ['DLP monitoring', 'Compliance checks', 'Threat detection', 'Audit logging'],
  },
  {
    id: 'quickbot',
    name: 'QuickReply',
    description: 'Generates smart, context-aware reply suggestions to help you respond faster in busy conversations.',
    category: 'Communication',
    icon: '\u26A1',
    iconBg: '#EC4899',
    capabilities: ['Smart suggestions', 'Tone adjustment', 'Template responses', 'Priority detection'],
  },
];

const CATEGORIES = ['All', 'Productivity', 'Comms', 'Analysis', 'Security'];

const CATEGORY_MAP: Record<string, string> = {
  'Comms': 'Communication',
};

interface TuningSettings {
  responsiveness: number;
  creativity: number;
  verbosity: number;
}

const DEFAULT_TUNING: TuningSettings = {
  responsiveness: 70,
  creativity: 50,
  verbosity: 60,
};

export default function AgentsScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [enabledAgents, setEnabledAgents] = useState<Set<string>>(new Set(['linda']));
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [tuningAgent, setTuningAgent] = useState<string | null>(null);
  const [agentSettings, setAgentSettings] = useState<Record<string, TuningSettings>>({});

  const filteredAgents = useMemo(() => {
    let result = AGENTS;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q),
      );
    }

    if (activeCategory !== 'All') {
      const mapped = CATEGORY_MAP[activeCategory] || activeCategory;
      result = result.filter((a) => a.category === mapped);
    }

    return result;
  }, [searchQuery, activeCategory]);

  const handleToggleAgent = useCallback((agentId: string) => {
    if (agentId === 'linda') return; // Linda is mandatory
    setEnabledAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
        setTuningAgent((t) => (t === agentId ? null : t));
      } else {
        next.add(agentId);
      }
      return next;
    });
  }, []);

  const handleExpandToggle = useCallback((agentId: string) => {
    setExpandedAgent((prev) => (prev === agentId ? null : agentId));
  }, []);

  const handleTuningToggle = useCallback((agentId: string) => {
    setTuningAgent((prev) => (prev === agentId ? null : agentId));
  }, []);

  const getSettings = (agentId: string): TuningSettings => {
    return agentSettings[agentId] || DEFAULT_TUNING;
  };

  const updateSetting = useCallback(
    (agentId: string, key: keyof TuningSettings, value: number) => {
      setAgentSettings((prev) => ({
        ...prev,
        [agentId]: {
          ...(prev[agentId] || DEFAULT_TUNING),
          [key]: value,
        },
      }));
    },
    [],
  );

  const handleChatWithLinda = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await api.getLindaConversations();
      const conversations = result?.conversations || [];
      if (conversations.length > 0) {
        const ownConversation = conversations.find((c) => c.isOwn) || conversations[0];
        navigation.navigate('Chats', {
          screen: 'Chat',
          params: {
            conversationId: ownConversation.id,
            name: 'Linda AI',
            isLinda: true,
          },
        });
      } else {
        Alert.alert('No Conversation', 'Could not find a Linda AI conversation.');
      }
    } catch (err: any) {
      console.error('[AgentsScreen] Failed to get Linda conversation:', err);
      Alert.alert('Error', 'Failed to open Linda chat. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [loading, navigation]);

  const activeCount = enabledAgents.size;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconBadge}>
            <Text style={styles.headerIconText}>{'\uD83E\uDD16'}</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Agents</Text>
            <Text style={styles.headerSubtitle}>{activeCount} active</Text>
          </View>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search agents..."
          placeholderTextColor={COLORS.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
      </View>

      {/* Category Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsContainer}
        contentContainerStyle={styles.tabsContent}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.tab, activeCategory === cat && styles.tabActive]}
            onPress={() => setActiveCategory(cat)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeCategory === cat && styles.tabTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Agent Cards */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {filteredAgents.map((agent) => {
          const isEnabled = enabledAgents.has(agent.id);
          const isExpanded = expandedAgent === agent.id;
          const isTuning = tuningAgent === agent.id;

          return (
            <View key={agent.id}>
              <TouchableOpacity
                style={[styles.agentCard, isEnabled && styles.agentCardEnabled]}
                onPress={() => handleExpandToggle(agent.id)}
                activeOpacity={0.7}
              >
                <View style={styles.agentCardRow}>
                  {/* Icon */}
                  <View style={[styles.agentIcon, { backgroundColor: agent.iconBg }]}>
                    <Text style={styles.agentIconText}>{agent.icon}</Text>
                  </View>

                  {/* Info */}
                  <View style={styles.agentCardInfo}>
                    <View style={styles.agentNameRow}>
                      <Text style={styles.agentName}>{agent.name}</Text>
                      {agent.status === 'mandatory' && (
                        <View style={[styles.statusBadge, { backgroundColor: '#DBEAFE' }]}>
                          <Text style={[styles.statusBadgeText, { color: COLORS.blue }]}>Mandatory</Text>
                        </View>
                      )}
                      {agent.status === 'popular' && (
                        <View style={[styles.statusBadge, { backgroundColor: '#FEF3C7' }]}>
                          <Text style={[styles.statusBadgeText, { color: COLORS.amber }]}>Popular</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.agentDescription} numberOfLines={isExpanded ? undefined : 2}>
                      {agent.description}
                    </Text>
                  </View>

                  {/* Right side: tuning + toggle */}
                  <View style={styles.agentCardRight}>
                    {isEnabled && agent.id !== 'linda' && (
                      <TouchableOpacity
                        style={styles.tuneButton}
                        onPress={() => handleTuningToggle(agent.id)}
                        activeOpacity={0.6}
                      >
                        <Text style={styles.tuneButtonIcon}>{'\u2699'}</Text>
                      </TouchableOpacity>
                    )}
                    <Switch
                      value={isEnabled}
                      onValueChange={() => handleToggleAgent(agent.id)}
                      trackColor={{ false: '#E2E8F0', true: COLORS.primary + '80' }}
                      thumbColor={isEnabled ? COLORS.primary : '#CBD5E1'}
                      disabled={agent.id === 'linda'}
                    />
                  </View>
                </View>

                {/* Expanded details */}
                {isExpanded && (
                  <View style={styles.expandedSection}>
                    <Text style={styles.capabilitiesLabel}>Capabilities</Text>
                    <View style={styles.capabilitiesList}>
                      {agent.capabilities.map((cap) => (
                        <View key={cap} style={styles.capabilityPill}>
                          <Text style={styles.capabilityPillText}>{cap}</Text>
                        </View>
                      ))}
                    </View>

                    {agent.id === 'linda' ? (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={handleChatWithLinda}
                        disabled={loading}
                        activeOpacity={0.7}
                      >
                        {loading ? (
                          <ActivityIndicator size="small" color={COLORS.white} />
                        ) : (
                          <Text style={styles.actionButtonText}>Chat with Linda</Text>
                        )}
                      </TouchableOpacity>
                    ) : isEnabled ? (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => Alert.alert('Add to Conversation', 'Select a conversation to add this agent.')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.actionButtonText}>Add to Conversation</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.actionButton, styles.actionButtonOutline]}
                        onPress={() => handleToggleAgent(agent.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.actionButtonText, styles.actionButtonTextOutline]}>Enable Agent</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </TouchableOpacity>

              {/* Tuning Panel */}
              {isTuning && isEnabled && (
                <View style={styles.tuningPanel}>
                  <View style={styles.tuningHeader}>
                    <Text style={styles.tuningHeaderIcon}>{'\u2699'}</Text>
                    <Text style={styles.tuningHeaderText}>Agent Tuning</Text>
                  </View>

                  {(['responsiveness', 'creativity', 'verbosity'] as const).map((key) => {
                    const settings = getSettings(agent.id);
                    const labels: Record<string, { label: string; desc: string }> = {
                      responsiveness: { label: 'Responsiveness', desc: 'How quickly the agent reacts' },
                      creativity: { label: 'Creativity', desc: 'Balance between precise and creative' },
                      verbosity: { label: 'Verbosity', desc: 'How detailed responses are' },
                    };
                    return (
                      <View key={key} style={styles.tuningSlider}>
                        <View style={styles.tuningSliderHeader}>
                          <Text style={styles.tuningSliderLabel}>{labels[key].label}</Text>
                          <Text style={styles.tuningSliderValue}>{settings[key]}%</Text>
                        </View>
                        <View style={styles.sliderTrack}>
                          <View style={[styles.sliderFill, { width: `${settings[key]}%` }]} />
                          <TouchableOpacity
                            style={[styles.sliderThumb, { left: `${settings[key]}%` }]}
                            activeOpacity={0.8}
                          />
                        </View>
                        <Text style={styles.tuningSliderDesc}>{labels[key].desc}</Text>
                      </View>
                    );
                  })}

                  <TouchableOpacity
                    style={styles.saveTuningButton}
                    onPress={() => {
                      setTuningAgent(null);
                      Alert.alert('Saved', 'Agent settings saved.');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.saveTuningButtonText}>Save Settings</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {filteredAgents.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>{'\uD83D\uDD0D'}</Text>
            <Text style={styles.emptyText}>No agents found</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIconText: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.secondary,
  },

  // Search
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: COLORS.text,
  },

  // Category tabs
  tabsContainer: {
    maxHeight: 44,
    marginBottom: 4,
  },
  tabsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.inputBg,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.secondary,
  },
  tabTextActive: {
    color: COLORS.white,
  },

  // Content
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    gap: 12,
  },

  // Agent card
  agentCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  agentCardEnabled: {
    borderColor: COLORS.primary + '30',
    backgroundColor: '#FDFCFF',
  },
  agentCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  agentIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  agentIconText: {
    fontSize: 18,
    color: COLORS.white,
    fontWeight: '800',
  },
  agentCardInfo: {
    flex: 1,
    marginRight: 8,
  },
  agentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  agentName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  agentDescription: {
    fontSize: 13,
    color: COLORS.secondary,
    lineHeight: 18,
  },
  agentCardRight: {
    alignItems: 'center',
    gap: 6,
  },
  tuneButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tuneButtonIcon: {
    fontSize: 16,
    color: COLORS.secondary,
  },

  // Expanded section
  expandedSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  capabilitiesLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  capabilitiesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  capabilityPill: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  capabilityPillText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '500',
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionButtonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  actionButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },
  actionButtonTextOutline: {
    color: COLORS.primary,
  },

  // Tuning panel
  tuningPanel: {
    backgroundColor: COLORS.lightPurple,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.primary + '20',
  },
  tuningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  tuningHeaderIcon: {
    fontSize: 18,
    color: COLORS.primary,
  },
  tuningHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  tuningSlider: {
    marginBottom: 16,
  },
  tuningSliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  tuningSliderLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  tuningSliderValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  sliderTrack: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    position: 'relative',
    marginBottom: 4,
  },
  sliderFill: {
    height: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 3,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  sliderThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.primary,
    position: 'absolute',
    top: -6,
    marginLeft: -9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  tuningSliderDesc: {
    fontSize: 11,
    color: COLORS.muted,
  },
  saveTuningButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveTuningButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.muted,
  },
});
