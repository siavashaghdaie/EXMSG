import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Shield,
  Users,
  Zap,
  Check,
  Sparkles,
  Lock,
  Building2,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { api, PlanDefinition } from '@/services/api';
import { Button } from '../common/Button';
import { Toast } from '../common/Toast';

/**
 * Public marketing landing page for OmniLink.
 *
 * Implements spec 2.3.1 "First Touch – The Landing Page" of
 * OmniLink_Development_Specification.docx. It is the default `/` route for
 * unauthenticated visitors and funnels them to plan selection / registration.
 *
 * No checkout in v1: only the Starter plan is self-servable; all other tiers
 * route to the plan-selection page which makes the "unavailable" state clear.
 */
export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setPlansLoading(true);
    setPlansError(null);
    try {
      const res = await api.getPlans();
      setPlans(res.plans);
    } catch (err: any) {
      // Show a user-friendly message — never expose raw internal errors.
      const serverMsg = err?.response?.data?.error;
      setPlansError(
        serverMsg ||
          (err?.code === 'ERR_NETWORK'
            ? 'Could not connect to the server. Please check your connection and try again.'
            : 'Something went wrong loading the plans. Please try again.')
      );
    } finally {
      setPlansLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handlePlanCta = (plan: PlanDefinition) => {
    if (plan.publiclySelfServable) {
      // Starter: jump straight into registration with this plan selected.
      navigate(`/register?plan=${plan.id}`);
    } else if (plan.id === 'enterprise') {
      // Contact Sales is a no-op in v1 — route to plan selection with anchor.
      navigate('/plans#enterprise');
    } else {
      // Professional / Business: "Coming soon" state lives on plan selection.
      navigate(`/plans?highlight=${plan.id}`);
    }
  };

  const formatPrice = (plan: PlanDefinition): string => {
    if (plan.priceMonthly === 0) return 'Free';
    if (plan.priceMonthly < 0) return 'Custom';
    return `$${plan.priceMonthly}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 relative">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-[36rem] h-[36rem] bg-blue-200 dark:bg-blue-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
        <div className="absolute top-40 right-0 w-[32rem] h-[32rem] bg-purple-200 dark:bg-purple-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
        <div className="absolute bottom-0 left-1/2 w-[28rem] h-[28rem] bg-pink-200 dark:bg-pink-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 max-w-6xl mx-auto px-6 pt-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="p-2 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg shadow-md">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900 dark:text-white">OmniLink</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/login"
            className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2"
          >
            Sign in
          </Link>
          <Button size="sm" onClick={() => navigate('/plans')}>
            Get started
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-6">
          <Sparkles className="h-3.5 w-3.5" />
          Private messaging with a built-in AI team
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-6">
          A messenger your company
          <br />
          actually controls.
        </h1>
        <p className="max-w-2xl mx-auto text-lg text-gray-600 dark:text-gray-400 mb-10">
          OmniLink is an exclusive messaging platform for organizations that can't—or
          won't—trust public chat apps with their conversations. Run it on your own terms,
          with AI task managers and agents already on the team.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" onClick={() => navigate('/plans')}>
            Create your panel
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-3 text-base font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            I already have an account
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<Shield className="h-6 w-6" />}
            title="Private by default"
            body="Your org, your rules. Invite-only workspaces, no public search, no data sold to anyone."
          />
          <FeatureCard
            icon={<Users className="h-6 w-6" />}
            title="Built for teams"
            body="Channels, DMs, voice, tasks, and announcements under one workspace per organization."
          />
          <FeatureCard
            icon={<Zap className="h-6 w-6" />}
            title="Linda AI on the roster"
            body="A secretary, task manager, and meeting note-taker that already knows everyone in the org."
          />
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-3">
            Pick the plan that fits your team
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Start free. Upgrade when you outgrow it. Cancel or change any time.
          </p>
        </div>

        {plansLoading ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-3" />
            Loading plans…
          </div>
        ) : plansError ? (
          <div className="max-w-md mx-auto text-center py-12">
            <Toast
              message={plansError}
              type="error"
              onClose={() => setPlansError(null)}
            />
            <button
              onClick={fetchPlans}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                priceLabel={formatPrice(plan)}
                onCta={() => handlePlanCta(plan)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Trust strip */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-8 shadow-lg">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl">
                <Lock className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Your data stays yours
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Every organization gets a dedicated workspace, admin controls, and audit trails.
                </p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => navigate('/plans')}>
              <Building2 className="h-4 w-4 mr-2" />
              Create your workspace
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 max-w-6xl mx-auto px-6 pb-10 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>
          &copy; {new Date().getFullYear()} OmniLink. Exclusive messaging for serious teams.
        </p>
      </footer>
    </div>
  );
};

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, body }) => (
  <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white mb-4">
      {icon}
    </div>
    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{body}</p>
  </div>
);

interface PlanCardProps {
  plan: PlanDefinition;
  priceLabel: string;
  onCta: () => void;
}

const PlanCard: React.FC<PlanCardProps> = ({ plan, priceLabel, onCta }) => {
  const isRecommended = plan.recommended;
  return (
    <div
      className={`relative rounded-2xl border p-6 flex flex-col bg-white dark:bg-gray-900 shadow-sm transition-shadow hover:shadow-lg ${
        isRecommended
          ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500 dark:ring-blue-400'
          : 'border-gray-200 dark:border-gray-800'
      }`}
    >
      {isRecommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-bold shadow">
          Most popular
        </div>
      )}
      <h3 className="text-xl font-bold text-gray-900 dark:text-white">{plan.name}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 min-h-[2.5rem]">{plan.tagline}</p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold text-gray-900 dark:text-white">{priceLabel}</span>
        {plan.priceMonthly > 0 && (
          <span className="text-gray-500 dark:text-gray-400 text-sm">/ user / mo</span>
        )}
      </div>
      <ul className="mt-5 space-y-2 flex-1">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
            <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Button
        onClick={onCta}
        variant={isRecommended ? 'primary' : 'secondary'}
        fullWidth
        className="mt-6"
      >
        {plan.ctaLabel}
      </Button>
      {!plan.publiclySelfServable && plan.id !== 'enterprise' && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 text-center">
          Available soon — join the waitlist on plan selection.
        </p>
      )}
    </div>
  );
};

