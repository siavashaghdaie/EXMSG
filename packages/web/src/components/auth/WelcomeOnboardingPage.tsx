import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Users, CheckSquare, Bot, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '../common/Button';

const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Real-Time Messaging',
    description: 'Chat with your team instantly. Send text, files, and more.',
  },
  {
    icon: Bot,
    title: 'Meet Linda',
    description: 'Your AI assistant is ready in your DMs. Ask her anything!',
  },
  {
    icon: CheckSquare,
    title: 'Task Management',
    description: 'Create tasks, assign them, and track progress — all in one place.',
  },
  {
    icon: Users,
    title: 'Team Channels',
    description: 'Join group conversations and collaborate with your whole team.',
  },
];

export const WelcomeOnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < FEATURES.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      navigate('/chat', { replace: true });
    }
  };

  const handleSkip = () => {
    navigate('/chat', { replace: true });
  };

  const feature = FEATURES[currentStep];
  const Icon = feature.icon;
  const isLast = currentStep === FEATURES.length - 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center py-8 px-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200 dark:bg-blue-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-purple-200 dark:bg-purple-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000" />
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-pink-200 dark:bg-pink-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-surface-700">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-800 dark:text-white">Welcome!</span>
          </div>

          {/* Feature card */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-all duration-300">
              <Icon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-2">
              {feature.title}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
              {feature.description}
            </p>
          </div>

          {/* Step dots */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {FEATURES.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-6 bg-primary-500'
                    : 'bg-gray-300 dark:bg-surface-600'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button onClick={handleNext} className="w-full flex items-center justify-center gap-2">
              {isLast ? 'Start Chatting' : 'Next'}
              <ArrowRight className="w-4 h-4" />
            </Button>
            {!isLast && (
              <button
                onClick={handleSkip}
                className="w-full text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 py-2"
              >
                Skip tour
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
