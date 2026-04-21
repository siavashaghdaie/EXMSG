import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
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
  lightPurple: '#F3F0FF',
  white: '#FFFFFF',
};

export default function AgentsScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);

  const handleChatWithLinda = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await api.getLindaConversations();
      const conversations = result?.conversations || [];
      if (conversations.length > 0) {
        // Find the user's own Linda conversation
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
        Alert.alert(
          'No Conversation',
          'Could not find a Linda AI conversation. Linda may not be set up for your organization yet.',
        );
      }
    } catch (err: any) {
      console.error('[AgentsScreen] Failed to get Linda conversation:', err);
      Alert.alert('Error', 'Failed to open Linda chat. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [loading, navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Agents</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* Linda AI Card */}
        <View style={styles.agentCard}>
          <View style={styles.agentHeader}>
            <View style={styles.agentAvatar}>
              <Text style={styles.agentAvatarText}>AI</Text>
            </View>
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>Linda</Text>
              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Always Online</Text>
              </View>
            </View>
          </View>

          <Text style={styles.agentDescription}>
            AI Secretary — Your intelligent assistant for tasks, announcements, and team coordination
          </Text>

          <View style={styles.agentCapabilities}>
            <Text style={styles.capabilitiesTitle}>Capabilities</Text>
            <View style={styles.capabilityRow}>
              <Text style={styles.capabilityBullet}>*</Text>
              <Text style={styles.capabilityText}>Create and manage tasks</Text>
            </View>
            <View style={styles.capabilityRow}>
              <Text style={styles.capabilityBullet}>*</Text>
              <Text style={styles.capabilityText}>Draft and post announcements</Text>
            </View>
            <View style={styles.capabilityRow}>
              <Text style={styles.capabilityBullet}>*</Text>
              <Text style={styles.capabilityText}>Answer questions about your organization</Text>
            </View>
            <View style={styles.capabilityRow}>
              <Text style={styles.capabilityBullet}>*</Text>
              <Text style={styles.capabilityText}>Coordinate team activities</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.chatButton}
            onPress={handleChatWithLinda}
            activeOpacity={0.7}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.chatButtonText}>Chat with Linda</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Future Agents Section */}
        <View style={styles.futureSection}>
          <Text style={styles.futureSectionTitle}>More Agents</Text>
          <View style={styles.futurePlaceholder}>
            <Text style={styles.futurePlaceholderIcon}>🤖</Text>
            <Text style={styles.futurePlaceholderText}>
              More agents coming soon
            </Text>
            <Text style={styles.futurePlaceholderSubtext}>
              Stay tuned for new AI-powered assistants to help your team
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
  },
  agentCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  agentAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  agentAvatarText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '800',
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '500',
  },
  agentDescription: {
    fontSize: 15,
    color: COLORS.secondary,
    lineHeight: 22,
    marginBottom: 16,
  },
  agentCapabilities: {
    backgroundColor: COLORS.lightPurple,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  capabilitiesTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  capabilityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  capabilityBullet: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '700',
    marginRight: 8,
    marginTop: 1,
  },
  capabilityText: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
    lineHeight: 20,
  },
  chatButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  chatButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  futureSection: {
    marginTop: 28,
  },
  futureSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  futurePlaceholder: {
    backgroundColor: COLORS.border,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  futurePlaceholderIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  futurePlaceholderText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.secondary,
    marginBottom: 6,
  },
  futurePlaceholderSubtext: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
