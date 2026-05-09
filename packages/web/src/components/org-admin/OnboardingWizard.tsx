import React, { useState, useRef, useEffect } from 'react';
import {
  Building2,
  Palette,
  Users,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Camera,
  Loader,
  UserPlus,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '@/services/api';

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

type Step = 'org-info' | 'branding' | 'invite' | 'done';
const STEPS: Step[] = ['org-info', 'branding', 'invite', 'done'];

const PRESET_COLORS = [
  '#6C47FF', '#3B82F6', '#0EA5E9', '#14B8A6', '#22C55E',
  '#EAB308', '#F97316', '#EF4444', '#EC4899', '#8B5CF6',
];

export default function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Step 1: Org info
  const [orgName, setOrgName] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Branding
  const [primaryColor, setPrimaryColor] = useState('#6C47FF');
  const [welcomeMessage, setWelcomeMessage] = useState('');

  // Step 3: Invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [inviteError, setInviteError] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  // Saving
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Load existing org profile
  useEffect(() => {
    (async () => {
      try {
        const profile = await api.getOrgProfile();
        setOrgName(profile.name || '');
        setOrgDescription(profile.description || '');
        setLogoUrl(profile.avatarUrl || null);
        setPrimaryColor(profile.primaryColor || '#6C47FF');
        setWelcomeMessage(profile.welcomeMessage || '');
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  const step = STEPS[currentStep];

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsUploadingLogo(true);
    try {
      const result = await api.uploadOrgLogo(file);
      setLogoUrl(result.avatarUrl);
    } catch {
      setError('Failed to upload logo');
    }
    setIsUploadingLogo(false);
  };

  const handleSaveStep = async () => {
    setIsSaving(true);
    setError('');
    try {
      if (step === 'org-info') {
        await api.updateOrgProfile({
          name: orgName.trim(),
          description: orgDescription.trim(),
        });
      } else if (step === 'branding') {
        await api.updateOrgProfile({
          primaryColor,
          welcomeMessage: welcomeMessage.trim() || null,
        });
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save');
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
    onComplete();
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    const email = inviteEmail.trim().toLowerCase();
    if (invitedEmails.includes(email)) {
      setInviteError('Already invited');
      return;
    }
    setIsInviting(true);
    setInviteError('');
    try {
      await api.addOrgAdminMember({ email, role: inviteRole });
      setInvitedEmails((prev) => [...prev, email]);
      setInviteEmail('');
    } catch (err: any) {
      setInviteError(err?.response?.data?.error || 'Failed to invite');
    }
    setIsInviting(false);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-surface-900 rounded-2xl p-12">
          <Loader className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-surface-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Set Up Your Organization
            </h2>
            <button
              onClick={onSkip}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            >
              <X size={18} className="text-slate-400" />
            </button>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center flex-1">
                <div
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i <= currentStep ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Step {currentStep + 1} of {STEPS.length}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Step 1: Organization Info */}
          {step === 'org-info' && (
            <div className="space-y-6">
              <div className="text-center mb-2">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Organization Details</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Tell us about your organization
                </p>
              </div>

              {/* Logo */}
              <div className="flex justify-center">
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  className="relative w-24 h-24 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-400 transition overflow-hidden group"
                >
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-50 dark:bg-slate-800">
                      <Building2 className="w-8 h-8 text-slate-400" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center">
                    {isUploadingLogo ? (
                      <Loader className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition" />
                    )}
                  </div>
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </div>
              <p className="text-center text-xs text-slate-500">Click to upload your organization logo</p>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Organization Name
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g., Acme Corporation"
                  className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Description
                </label>
                <textarea
                  value={orgDescription}
                  onChange={(e) => setOrgDescription(e.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="Brief description of your organization..."
                  className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition resize-none"
                />
              </div>
            </div>
          )}

          {/* Step 2: Branding */}
          {step === 'branding' && (
            <div className="space-y-6">
              <div className="text-center mb-2">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Palette className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Branding</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Customize the look and feel of your workspace
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Brand Color
                </label>
                <div className="flex flex-wrap gap-3 justify-center">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setPrimaryColor(color)}
                      className={`w-10 h-10 rounded-full transition-transform ${
                        primaryColor === color ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 justify-center">
                  <label className="text-xs text-slate-500">Custom:</label>
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0"
                  />
                  <span className="text-xs font-mono text-slate-500">{primaryColor}</span>
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                <p className="text-xs text-slate-500 mb-2 font-medium">Preview</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: primaryColor }}>
                    {orgName?.[0]?.toUpperCase() || 'O'}
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: primaryColor }}>{orgName || 'Your Organization'}</p>
                    <p className="text-xs text-slate-400">Workspace</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Welcome Message
                </label>
                <textarea
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Message shown to new team members when they join (optional)..."
                  className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition resize-none"
                />
              </div>
            </div>
          )}

          {/* Step 3: Invite Team */}
          {step === 'invite' && (
            <div className="space-y-6">
              <div className="text-center mb-2">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Invite Your Team</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Add team members by email (you can always do this later)
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => { setInviteEmail(e.target.value); setInviteError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  placeholder="colleague@company.com"
                  className="flex-1 px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'MEMBER' | 'ADMIN')}
                  className="px-2 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <button
                  onClick={handleInvite}
                  disabled={isInviting || !inviteEmail.trim()}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1"
                >
                  {isInviting ? <Loader className="w-4 h-4 animate-spin" /> : <UserPlus size={16} />}
                </button>
              </div>

              {inviteError && (
                <p className="text-sm text-red-500">{inviteError}</p>
              )}

              {invitedEmails.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Invited ({invitedEmails.length})
                  </p>
                  {invitedEmails.map((email) => (
                    <div
                      key={email}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                    >
                      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm text-green-700 dark:text-green-300">{email}</span>
                    </div>
                  ))}
                </div>
              )}

              {invitedEmails.length === 0 && (
                <div className="text-center py-6">
                  <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No invites yet. You can skip this step and invite people later.</p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
                <Sparkles className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">You're All Set!</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Your organization is configured and ready to go. You can always adjust these settings later from the Admin Dashboard.
              </p>
              {invitedEmails.length > 0 && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  {invitedEmails.length} team member{invitedEmails.length > 1 ? 's' : ''} invited
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          {currentStep > 0 && step !== 'done' ? (
            <button
              onClick={() => setCurrentStep((prev) => prev - 1)}
              className="flex items-center gap-1 px-4 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition font-medium text-sm"
            >
              <ChevronLeft size={16} /> Back
            </button>
          ) : (
            <div />
          )}

          {step === 'done' ? (
            <button
              onClick={handleComplete}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {isSaving ? <Loader className="w-4 h-4 animate-spin" /> : null}
              Get Started
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {step === 'invite' && (
                <button
                  onClick={() => setCurrentStep((prev) => prev + 1)}
                  className="px-4 py-2.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium text-sm transition"
                >
                  Skip
                </button>
              )}
              <button
                onClick={handleSaveStep}
                disabled={isSaving || (step === 'org-info' && !orgName.trim())}
                className="flex items-center gap-1 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {isSaving ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Next <ChevronRight size={16} />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
