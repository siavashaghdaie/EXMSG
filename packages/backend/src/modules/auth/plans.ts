/**
 * Subscription plans — static catalog.
 *
 * Section 2.3 of OmniLink_Development_Specification.docx defines the Panel
 * Owner newcomer journey. For v1 this catalog exists so the landing page,
 * plan selection, and registration flow can share a single source of truth.
 * Checkout and real billing are intentionally out of scope for v1: only the
 * free "starter" tier is actually reachable end-to-end. All other tiers are
 * displayed on the marketing site and plan-selection screen, but attempting
 * to sign up on them routes the user to "Contact Sales" (Enterprise) or to
 * a "Coming soon" state (Professional / Business).
 */

export type PlanId = 'starter' | 'professional' | 'business' | 'enterprise';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number;  // USD, 0 for Starter, -1 for "Contact Sales"
  priceAnnual: number;
  seatLimit: number;     // -1 means unlimited
  storageGb: number;
  aiAgentHours: number;  // per month, -1 means unlimited
  prioritySupport: boolean;
  ssoEnabled: boolean;
  features: string[];
  /** Whether a newcomer can self-serve onto this plan in v1 (no checkout yet). */
  publiclySelfServable: boolean;
  /** Whether this plan is recommended on the landing page. */
  recommended: boolean;
  /** Copy shown on the CTA button for this tier. */
  ctaLabel: string;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    tagline: 'For small teams getting started with private messaging.',
    priceMonthly: 0,
    priceAnnual: 0,
    seatLimit: 10,
    storageGb: 5,
    aiAgentHours: 2,
    prioritySupport: false,
    ssoEnabled: false,
    features: [
      'Up to 10 seats',
      '5 GB shared storage',
      'Core messaging & channels',
      'Linda AI assistant (2h / month)',
      'Email support',
    ],
    publiclySelfServable: true,
    recommended: false,
    ctaLabel: 'Start for free',
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    tagline: 'For growing organizations that need more seats and AI time.',
    priceMonthly: 12,
    priceAnnual: 120,
    seatLimit: 50,
    storageGb: 50,
    aiAgentHours: 20,
    prioritySupport: false,
    ssoEnabled: false,
    features: [
      'Up to 50 seats',
      '50 GB shared storage',
      'Everything in Starter',
      'Linda AI assistant (20h / month)',
      'Voice & video calls',
      'Advanced channel moderation',
    ],
    publiclySelfServable: false, // v1: no checkout
    recommended: true,
    ctaLabel: 'Coming soon',
  },
  business: {
    id: 'business',
    name: 'Business',
    tagline: 'For mid-size companies with compliance and scale needs.',
    priceMonthly: 24,
    priceAnnual: 240,
    seatLimit: 250,
    storageGb: 250,
    aiAgentHours: 100,
    prioritySupport: true,
    ssoEnabled: true,
    features: [
      'Up to 250 seats',
      '250 GB shared storage',
      'Everything in Professional',
      'Linda AI assistant (100h / month)',
      'SSO (SAML / OIDC)',
      'Priority support',
    ],
    publiclySelfServable: false, // v1: no checkout
    recommended: false,
    ctaLabel: 'Coming soon',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom deployment, dedicated support, and security reviews.',
    priceMonthly: -1,
    priceAnnual: -1,
    seatLimit: -1,
    storageGb: -1,
    aiAgentHours: -1,
    prioritySupport: true,
    ssoEnabled: true,
    features: [
      'Unlimited seats',
      'Custom storage quota',
      'Everything in Business',
      'Unlimited Linda AI hours',
      'Dedicated success manager',
      'Security & compliance reviews',
      'Custom SLAs',
    ],
    publiclySelfServable: false,
    recommended: false,
    ctaLabel: 'Contact sales',
  },
};

export const PLAN_ORDER: PlanId[] = ['starter', 'professional', 'business', 'enterprise'];

export function isValidPlan(value: string | undefined | null): value is PlanId {
  return !!value && value in PLANS;
}

export function getPlan(id: PlanId): PlanDefinition {
  return PLANS[id];
}

/**
 * Whether a newcomer can actually complete registration on the given plan in v1.
 * In v1 this is only "starter" — every other plan routes back to plan selection.
 */
export function canSelfRegisterOn(planId: PlanId): boolean {
  return PLANS[planId].publiclySelfServable;
}
