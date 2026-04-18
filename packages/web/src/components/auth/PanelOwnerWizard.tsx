import React, { useState, useMemo } from 'react';
import {
  Users,
  BarChart3,
  Mail,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  LayoutDashboard,
  Bot,
  Camera,
  Clipboard,
  X,
} from 'lucide-react';

interface WelcomeWizardProps {
  displayName: string;
  isAdmin: boolean;      // true for SUPER_ADMIN / OWNER / ADMIN
  onComplete: () => void;
  onOpenDashboard?: () => void;
}

interface WizardStep {
  id: string;
  icon: React.FC<any>;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  description: string;
  hint?: { icon: React.FC<any>; iconColor: string; text: string };
  adminOnly?: boolean;
}

const ALL_STEPS: WizardStep[] = [
  // ─── Linda intro (shown to ALL users as the first page) ───
  {
    id: 'linda',
    icon: Bot,
    iconColor: 'text-primary-600 dark:text-primary-400',
    iconBg: 'bg-primary-100 dark:bg-primary-900/30',
    title: "Hi! I'm Linda",
    subtitle: 'Your personal AI assistant',
    description:
      "I'm here to help you with anything you need — from managing tasks and drafting messages to answering questions about your organization. You can find me in the conversation list on the sidebar. I'm available 24/7, just send me a message anytime!",
    hint: {
      icon: MessageSquare,
      iconColor: 'text-primary-500',
      text: 'Look for "Linda AI" in your conversations to start chatting',
    },
  },

  // ─── Admin Dashboard (admin only) ───
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    iconColor: 'text-primary-600 dark:text-primary-400',
    iconBg: 'bg-primary-100 dark:bg-primary-900/30',
    title: 'Your Admin Dashboard',
    subtitle: 'The command center for your organization',
    description:
      'Look for the blinking dashboard icon in the sidebar header — right next to the bell icon. From there you can view organization statistics, monitor activity, and manage everything.',
    hint: {
      icon: LayoutDashboard,
      iconColor: 'text-primary-500 animate-pulse',
      text: 'Look for this icon blinking in the sidebar after this tour',
    },
    adminOnly: true,
  },

  // ─── Invite Members (admin only) ───
  {
    id: 'members',
    icon: Users,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    title: 'Invite Your Team',
    subtitle: 'Add members to your organization',
    description:
      'Open the Admin Dashboard and go to the Members tab. Click "Add Member" to invite people by email. They\'ll receive an invitation link to set up their account and join your organization.',
    hint: {
      icon: Mail,
      iconColor: 'text-emerald-500',
      text: 'Members receive an email invitation with a secure link',
    },
    adminOnly: true,
  },

  // ─── Features overview (shown to ALL users) ───
  {
    id: 'features',
    icon: MessageSquare,
    iconColor: 'text-violet-600 dark:text-violet-400',
    iconBg: 'bg-violet-100 dark:bg-violet-900/30',
    title: 'Messaging & Stories',
    subtitle: 'Stay connected with your team',
    description:
      'Send messages, share files, and react to conversations. Post stories using the + button next to your avatar — they\'re visible to everyone in your organization for 24 hours.',
    hint: {
      icon: Camera,
      iconColor: 'text-violet-500',
      text: 'Tap the + button near your profile picture to post a story',
    },
  },

  // ─── Tasks & Announcements (shown to ALL users) ───
  {
    id: 'tasks',
    icon: Clipboard,
    iconColor: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    title: 'Tasks & Announcements',
    subtitle: 'Stay organized and informed',
    description:
      'Keep track of your to-dos with the task manager, and check the announcements board for important updates from your organization. You can find both from the sidebar icons.',
  },

  // ─── Monitor & Manage (admin only) ───
  {
    id: 'stats',
    icon: BarChart3,
    iconColor: 'text-blue-600 dark:text-blue-400',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    title: 'Monitor & Manage',
    subtitle: 'Stay on top of everything',
    description:
      'The Admin Dashboard gives you real-time statistics — active users, messages per day, member activity reports, and more. Keep your organization running smoothly.',
    adminOnly: true,
  },
];

const WelcomeWizard: React.FC<WelcomeWizardProps> = ({
  displayName,
  isAdmin,
  onComplete,
  onOpenDashboard,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  // Filter steps based on role
  const steps = useMemo(
    () => ALL_STEPS.filter((s) => !s.adminOnly || isAdmin),
    [isAdmin]
  );

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;
  const StepIcon = step.icon;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
      if (isAdmin && onOpenDashboard) onOpenDashboard();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Skip / Close button */}
        <div className="flex justify-end p-3 pb-0">
          <button
            onClick={handleSkip}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
            title="Skip tour"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-8 pb-2 text-center">
          {/* Step icon */}
          <div className={`w-20 h-20 ${step.iconBg} rounded-2xl flex items-center justify-center mx-auto mb-5`}>
            <StepIcon className={`w-10 h-10 ${step.iconColor}`} />
          </div>

          {/* Personalized greeting on Linda intro step */}
          {step.id === 'linda' && (
            <p className="text-sm text-primary-600 dark:text-primary-400 font-medium mb-1">
              Hello, {displayName || 'there'}!
            </p>
          )}

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            {step.title}
          </h2>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
            {step.subtitle}
          </p>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-sm">
            {step.description}
          </p>

          {/* Visual hint */}
          {step.hint && (
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-surface-700 rounded-lg py-2 px-3">
              <step.hint.icon className={`w-4 h-4 flex-shrink-0 ${step.hint.iconColor}`} />
              <span>{step.hint.text}</span>
            </div>
          )}
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 py-4">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentStep(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? 'w-6 bg-primary-600 dark:bg-primary-400'
                  : 'w-2 bg-gray-300 dark:bg-surface-600 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="px-8 pb-6 flex items-center justify-between gap-3">
          {!isFirstStep ? (
            <button
              onClick={() => setCurrentStep((s) => s - 1)}
              className="flex items-center gap-1 px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-700 rounded-lg transition-colors text-sm font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <button
              onClick={handleSkip}
              className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors text-sm font-medium"
            >
              Skip Tour
            </button>
          )}

          <button
            onClick={handleNext}
            className="flex items-center gap-1 px-6 py-2.5 bg-primary-600 dark:bg-primary-500 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors text-sm font-medium shadow-sm"
          >
            {isLastStep && isAdmin ? 'Open Dashboard' : isLastStep ? 'Get Started' : 'Next'}
            {!isLastStep && <ChevronRight className="w-4 h-4" />}
            {isLastStep && isAdmin && <LayoutDashboard className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeWizard;
