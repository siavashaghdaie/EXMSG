import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Building2, Camera, Globe, Lock, Save, Loader, AlertCircle } from 'lucide-react';
import { api } from '@/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PanelSettingsTabProps {
  orgId: string;
}

interface OrgProfile {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: 'public' | 'private';
  avatarUrl: string | null;
}

type Visibility = 'public' | 'private';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const extractError = (err: any): string => {
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    'Something went wrong'
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PanelSettingsTab({ orgId }: PanelSettingsTabProps) {
  // Profile state
  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Save / upload state
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Dirty tracking
  const [initialValues, setInitialValues] = useState<{
    name: string;
    description: string;
    visibility: Visibility;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDirty =
    initialValues !== null &&
    (name !== initialValues.name ||
      description !== initialValues.description ||
      visibility !== initialValues.visibility);

  // ---------------------------------------------------------------------------
  // Fetch profile on mount (and when orgId changes)
  // ---------------------------------------------------------------------------

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const data: OrgProfile = await api.getOrgProfile();
      setProfile(data);
      setName(data.name);
      setDescription(data.description ?? '');
      setVisibility(data.visibility);
      setAvatarUrl(data.avatarUrl);
      setInitialValues({
        name: data.name,
        description: data.description ?? '',
        visibility: data.visibility,
      });
    } catch (err) {
      console.error('Failed to load org profile:', err);
      setFetchError(extractError(err));
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Auto-dismiss success message after 4 seconds
  useEffect(() => {
    if (saveMessage?.type === 'success') {
      const timer = setTimeout(() => setSaveMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [saveMessage]);

  // ---------------------------------------------------------------------------
  // Logo upload
  // ---------------------------------------------------------------------------

  const handleLogoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset the input so the same file can be re-selected if needed
    e.target.value = '';

    setIsUploading(true);
    setSaveMessage(null);
    try {
      const result = await api.uploadOrgLogo(file);
      setAvatarUrl(result.avatarUrl);
    } catch (err) {
      console.error('Logo upload failed:', err);
      setSaveMessage({ type: 'error', text: extractError(err) });
    } finally {
      setIsUploading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Save profile
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    if (!isDirty) return;

    setIsSaving(true);
    setSaveMessage(null);
    try {
      const updated: OrgProfile = await api.updateOrgProfile({
        name,
        description,
        visibility,
      });
      setProfile(updated);
      setInitialValues({
        name: updated.name,
        description: updated.description ?? '',
        visibility: updated.visibility,
      });
      setSaveMessage({ type: 'success', text: 'Settings saved successfully.' });
    } catch (err) {
      console.error('Save profile failed:', err);
      setSaveMessage({ type: 'error', text: extractError(err) });
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Loading skeleton
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-surface-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-6 animate-pulse">
        {/* Logo skeleton */}
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="space-y-2">
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-3 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        </div>
        {/* Field skeletons */}
        <div className="space-y-4">
          <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          <div className="h-24 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          <div className="flex gap-4">
            <div className="flex-1 h-24 bg-slate-200 dark:bg-slate-700 rounded-lg" />
            <div className="flex-1 h-24 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (fetchError && !profile) {
    return (
      <div className="bg-white dark:bg-surface-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
            <AlertCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Failed to load panel settings
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 max-w-sm">
            {fetchError}
          </p>
          <button
            onClick={loadProfile}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="bg-white dark:bg-surface-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-8">
      {/* --- Panel Logo ---------------------------------------------------- */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Panel Logo
        </h2>
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={handleLogoClick}
            disabled={isUploading}
            className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-slate-200 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 transition group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 shrink-0"
            aria-label="Upload panel logo"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Panel logo"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                <Building2
                  size={28}
                  className="text-slate-400 dark:text-slate-500"
                />
              </div>
            )}
            {/* Camera overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              {isUploading ? (
                <Loader
                  size={22}
                  className="text-white animate-spin"
                />
              ) : (
                <Camera
                  size={22}
                  className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                />
              )}
            </div>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
            aria-hidden="true"
          />

          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Click to upload a new logo
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              JPG, PNG, or WebP. Recommended 256x256px.
            </p>
          </div>
        </div>
      </div>

      {/* --- Panel Name ---------------------------------------------------- */}
      <div>
        <label
          htmlFor="panel-name"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
        >
          Panel Name <span className="text-red-500">*</span>
        </label>
        <input
          id="panel-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="My Organization"
          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
        />
      </div>

      {/* --- Description --------------------------------------------------- */}
      <div>
        <label
          htmlFor="panel-description"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
        >
          Description <span className="text-slate-400">(optional)</span>
        </label>
        <textarea
          id="panel-description"
          value={description}
          onChange={(e) => {
            if (e.target.value.length <= 500) {
              setDescription(e.target.value);
            }
          }}
          rows={4}
          placeholder="Briefly describe what this panel is for..."
          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition"
        />
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-right">
          {description.length}/500
        </p>
      </div>

      {/* --- Visibility ----------------------------------------------------- */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
          Visibility
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Private card */}
          <button
            type="button"
            onClick={() => setVisibility('private')}
            className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition ${
              visibility === 'private'
                ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-900/20'
                : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
            }`}
          >
            <div
              className={`p-2 rounded-lg shrink-0 ${
                visibility === 'private'
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}
            >
              <Lock size={18} />
            </div>
            <div className="min-w-0">
              <p
                className={`text-sm font-semibold ${
                  visibility === 'private'
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                Private
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Only invited members can see this panel
              </p>
            </div>
          </button>

          {/* Public card */}
          <button
            type="button"
            onClick={() => setVisibility('public')}
            className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition ${
              visibility === 'public'
                ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-900/20'
                : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
            }`}
          >
            <div
              className={`p-2 rounded-lg shrink-0 ${
                visibility === 'public'
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}
            >
              <Globe size={18} />
            </div>
            <div className="min-w-0">
              <p
                className={`text-sm font-semibold ${
                  visibility === 'public'
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                Public
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Visible in panel directory, others can send connection requests
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* --- Feedback messages ---------------------------------------------- */}
      {saveMessage && (
        <div
          className={`p-3 rounded-lg border text-sm flex items-center gap-2 ${
            saveMessage.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
          }`}
        >
          {saveMessage.type === 'success' ? (
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <AlertCircle size={16} className="shrink-0" />
          )}
          {saveMessage.text}
        </div>
      )}

      {/* --- Save button --------------------------------------------------- */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isSaving || !name.trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition"
        >
          {isSaving ? (
            <>
              <Loader size={16} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={16} />
              Save Changes
            </>
          )}
        </button>
      </div>
    </div>
  );
}
