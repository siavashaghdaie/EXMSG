import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { api } from '@/services/api';

const PRIMARY = '#6C47FF';

const PRESET_COLORS = [
  '#6C47FF', '#3B82F6', '#0EA5E9', '#14B8A6', '#22C55E',
  '#EAB308', '#F97316', '#EF4444', '#EC4899', '#8B5CF6',
];

interface OrgOnboardingModalProps {
  visible: boolean;
  onClose: () => void;
}

type Step = 'org-info' | 'branding' | 'invite' | 'done';
const STEPS: Step[] = ['org-info', 'branding', 'invite', 'done'];

export default function OrgOnboardingModal({ visible, onClose }: OrgOnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Org info
  const [orgName, setOrgName] = useState('');
  const [orgDescription, setOrgDescription] = useState('');

  // Branding
  const [primaryColor, setPrimaryColor] = useState('#6C47FF');
  const [welcomeMessage, setWelcomeMessage] = useState('');

  // Invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [isInviting, setIsInviting] = useState(false);

  const step = STEPS[currentStep];

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const profile = await api.getOrgProfile();
        setOrgName(profile.name || '');
        setOrgDescription(profile.description || '');
        setPrimaryColor(profile.primaryColor || '#6C47FF');
        setWelcomeMessage(profile.welcomeMessage || '');
      } catch {}
      setIsLoading(false);
    })();
  }, [visible]);

  const handleNext = async () => {
    setIsSaving(true);
    try {
      if (step === 'org-info') {
        await api.updateOrgProfile({ name: orgName.trim(), description: orgDescription.trim() });
      } else if (step === 'branding') {
        await api.updateOrgProfile({ primaryColor, welcomeMessage: welcomeMessage.trim() || null });
      }
    } catch {
      Alert.alert('Error', 'Failed to save settings');
      setIsSaving(false);
      return;
    }
    setIsSaving(false);
    setCurrentStep((prev) => prev + 1);
  };

  const handleComplete = async () => {
    setIsSaving(true);
    try {
      await api.updateOrgProfile({ onboardingDone: true });
    } catch {}
    setIsSaving(false);
    onClose();
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    if (invitedEmails.includes(email)) {
      Alert.alert('Already invited');
      return;
    }
    setIsInviting(true);
    try {
      await api.addOrgAdminMember({ email, role: 'MEMBER' });
      setInvitedEmails((prev) => [...prev, email]);
      setInviteEmail('');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to invite');
    }
    setIsInviting(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Set Up Organization</Text>
          <TouchableOpacity onPress={onClose} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[styles.progressSegment, i <= currentStep && styles.progressActive]}
            />
          ))}
        </View>
        <Text style={styles.stepLabel}>Step {currentStep + 1} of {STEPS.length}</Text>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        ) : (
          <ScrollView style={styles.content} contentContainerStyle={styles.contentPad} keyboardShouldPersistTaps="handled">
            {step === 'org-info' && (
              <View>
                <Text style={styles.stepTitle}>Organization Details</Text>
                <Text style={styles.stepSubtitle}>Tell us about your organization</Text>

                <Text style={styles.label}>Organization Name</Text>
                <TextInput
                  style={styles.input}
                  value={orgName}
                  onChangeText={setOrgName}
                  placeholder="e.g., Acme Corporation"
                  placeholderTextColor="#aaa"
                />

                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={orgDescription}
                  onChangeText={setOrgDescription}
                  placeholder="Brief description..."
                  placeholderTextColor="#aaa"
                  multiline
                  numberOfLines={3}
                  maxLength={300}
                  textAlignVertical="top"
                />
              </View>
            )}

            {step === 'branding' && (
              <View>
                <Text style={styles.stepTitle}>Branding</Text>
                <Text style={styles.stepSubtitle}>Customize your workspace</Text>

                <Text style={styles.label}>Brand Color</Text>
                <View style={styles.colorGrid}>
                  {PRESET_COLORS.map((color) => (
                    <TouchableOpacity
                      key={color}
                      onPress={() => setPrimaryColor(color)}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: color },
                        primaryColor === color && styles.colorCircleActive,
                      ]}
                    />
                  ))}
                </View>

                <Text style={styles.label}>Welcome Message</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={welcomeMessage}
                  onChangeText={setWelcomeMessage}
                  placeholder="Message shown to new members (optional)..."
                  placeholderTextColor="#aaa"
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                  textAlignVertical="top"
                />
              </View>
            )}

            {step === 'invite' && (
              <View>
                <Text style={styles.stepTitle}>Invite Your Team</Text>
                <Text style={styles.stepSubtitle}>Add members by email (you can skip this)</Text>

                <View style={styles.inviteRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    value={inviteEmail}
                    onChangeText={setInviteEmail}
                    placeholder="colleague@company.com"
                    placeholderTextColor="#aaa"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    onSubmitEditing={handleInvite}
                  />
                  <TouchableOpacity
                    style={styles.inviteButton}
                    onPress={handleInvite}
                    disabled={isInviting || !inviteEmail.trim()}
                  >
                    {isInviting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.inviteButtonText}>Add</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {invitedEmails.map((email) => (
                  <View key={email} style={styles.invitedRow}>
                    <Text style={styles.invitedCheck}>✓</Text>
                    <Text style={styles.invitedEmail}>{email}</Text>
                  </View>
                ))}
              </View>
            )}

            {step === 'done' && (
              <View style={styles.doneContainer}>
                <Text style={styles.doneEmoji}>✨</Text>
                <Text style={styles.stepTitle}>You're All Set!</Text>
                <Text style={styles.stepSubtitle}>
                  Your organization is ready. You can change these settings anytime from the Admin Dashboard.
                </Text>
                {invitedEmails.length > 0 && (
                  <Text style={styles.inviteCount}>
                    {invitedEmails.length} team member{invitedEmails.length > 1 ? 's' : ''} invited
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
        )}

        {/* Footer */}
        {!isLoading && (
          <View style={styles.footer}>
            {currentStep > 0 && step !== 'done' ? (
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setCurrentStep((prev) => prev - 1)}
              >
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}

            {step === 'done' ? (
              <TouchableOpacity
                style={[styles.nextButton, isSaving && { opacity: 0.5 }]}
                onPress={handleComplete}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.nextButtonText}>Get Started</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.nextButton, (isSaving || (step === 'org-info' && !orgName.trim())) && { opacity: 0.5 }]}
                onPress={step === 'invite' ? () => setCurrentStep((prev) => prev + 1) : handleNext}
                disabled={isSaving || (step === 'org-info' && !orgName.trim())}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.nextButtonText}>
                    {step === 'invite' ? 'Skip' : 'Next'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  skipButton: { paddingHorizontal: 12, paddingVertical: 6 },
  skipText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  progressContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
  },
  progressActive: { backgroundColor: PRIMARY },
  stepLabel: {
    fontSize: 12,
    color: '#9ca3af',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  content: { flex: 1 },
  contentPad: { padding: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  stepTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 6 },
  stepSubtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
    backgroundColor: '#f9fafb',
    marginBottom: 12,
  },
  textArea: { minHeight: 80, paddingTop: 12 },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginVertical: 12,
  },
  colorCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  colorCircleActive: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  inviteRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 16 },
  inviteButton: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  inviteButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  invitedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ecfdf5',
    borderRadius: 8,
    marginBottom: 8,
  },
  invitedCheck: { fontSize: 14, color: '#059669' },
  invitedEmail: { fontSize: 14, color: '#065f46' },
  doneContainer: { alignItems: 'center', paddingTop: 40 },
  doneEmoji: { fontSize: 48, marginBottom: 16 },
  inviteCount: { fontSize: 14, color: '#059669', marginTop: 12, fontWeight: '500' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  backButton: { paddingHorizontal: 16, paddingVertical: 12 },
  backButtonText: { fontSize: 15, color: '#6b7280', fontWeight: '500' },
  nextButton: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  nextButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
