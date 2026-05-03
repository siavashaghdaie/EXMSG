import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class AgentController {
  // GET /agents/catalog — list all available agents in the marketplace
  async getCatalog(_req: Request, res: Response) {
    try {
      const agents = await prisma.agent.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      res.json(agents);
    } catch (error) {
      console.error('Error fetching agent catalog:', error);
      res.status(500).json({ error: 'Failed to fetch agent catalog' });
    }
  }

  // GET /agents/hired — list agents hired by the current org
  async getHiredAgents(req: Request, res: Response) {
    try {
      const orgId = (req as any).organizationId;
      if (!orgId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      const orgAgents = await prisma.orgAgent.findMany({
        where: { organizationId: orgId },
        include: {
          agent: true,
        },
        orderBy: { hiredAt: 'asc' },
      });

      res.json(orgAgents);
    } catch (error) {
      console.error('Error fetching hired agents:', error);
      res.status(500).json({ error: 'Failed to fetch hired agents' });
    }
  }

  // POST /agents/:agentId/hire — hire an agent for the org
  async hireAgent(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const orgId = (req as any).organizationId;
      const userId = (req as any).userId;

      if (!orgId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      // Check agent exists
      const agent = await prisma.agent.findUnique({ where: { id: agentId } });
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // Check if already hired
      const existing = await prisma.orgAgent.findUnique({
        where: { organizationId_agentId: { organizationId: orgId, agentId } },
      });
      if (existing) {
        return res.status(409).json({ error: 'Agent already hired' });
      }

      const orgAgent = await prisma.orgAgent.create({
        data: {
          organizationId: orgId,
          agentId,
          hiredBy: userId,
          isEnabled: true,
        },
        include: { agent: true },
      });

      res.status(201).json(orgAgent);
    } catch (error) {
      console.error('Error hiring agent:', error);
      res.status(500).json({ error: 'Failed to hire agent' });
    }
  }

  // DELETE /agents/:agentId/fire — remove an agent from the org
  async fireAgent(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const orgId = (req as any).organizationId;

      if (!orgId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      // Check if agent is mandatory
      const agent = await prisma.agent.findUnique({ where: { id: agentId } });
      if (agent?.isMandatory) {
        return res.status(403).json({ error: 'Cannot fire a mandatory agent' });
      }

      const existing = await prisma.orgAgent.findUnique({
        where: { organizationId_agentId: { organizationId: orgId, agentId } },
      });
      if (!existing) {
        return res.status(404).json({ error: 'Agent not hired' });
      }

      await prisma.orgAgent.delete({
        where: { id: existing.id },
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error firing agent:', error);
      res.status(500).json({ error: 'Failed to fire agent' });
    }
  }

  // PATCH /agents/:agentId/settings — update agent settings for the org
  async updateSettings(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const orgId = (req as any).organizationId;
      const { isEnabled, settings } = req.body;

      if (!orgId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      const existing = await prisma.orgAgent.findUnique({
        where: { organizationId_agentId: { organizationId: orgId, agentId } },
      });
      if (!existing) {
        return res.status(404).json({ error: 'Agent not hired' });
      }

      // Don't allow disabling mandatory agents
      if (isEnabled === false) {
        const agent = await prisma.agent.findUnique({ where: { id: agentId } });
        if (agent?.isMandatory) {
          return res.status(403).json({ error: 'Cannot disable a mandatory agent' });
        }
      }

      const updated = await prisma.orgAgent.update({
        where: { id: existing.id },
        data: {
          ...(isEnabled !== undefined && { isEnabled }),
          ...(settings !== undefined && { settings }),
        },
        include: { agent: true },
      });

      res.json(updated);
    } catch (error) {
      console.error('Error updating agent settings:', error);
      res.status(500).json({ error: 'Failed to update agent settings' });
    }
  }
}

// Seed preset agents — called on server startup
export async function seedAgents() {
  const presetAgents = [
    {
      slug: 'linda',
      name: 'Linda',
      role: 'AI Secretary & Manager',
      tagline: 'Your intelligent office assistant',
      description: 'Linda manages your tasks, announcements, and team coordination. She responds to messages and voice notes, creates documents, and keeps your workspace organized. Linda is always learning your preferences to serve you better.',
      category: 'productivity',
      capabilities: ['Task management', 'Document creation', 'Voice understanding', 'Smart replies', 'Meeting scheduling', 'Team coordination'],
      gradientFrom: '#8B5CF6',
      gradientTo: '#6366F1',
      iconName: 'MessageSquare',
      isBuiltIn: true,
      isMandatory: true,
      isPopular: true,
      sortOrder: 0,
    },
    {
      slug: 'transguy',
      name: 'TransGuy',
      role: 'Real-Time Translator',
      tagline: 'Break language barriers instantly',
      description: 'TransGuy provides real-time message translation across 50+ languages. He auto-detects the language of incoming messages and translates them seamlessly in your chat. Perfect for international teams and cross-border collaboration.',
      category: 'communication',
      capabilities: ['Real-time translation', 'Language detection', '50+ languages', 'Context-aware accuracy', 'Voice translation', 'Cultural adaptation'],
      gradientFrom: '#10B981',
      gradientTo: '#059669',
      iconName: 'Globe',
      isBuiltIn: true,
      isMandatory: false,
      isPopular: true,
      sortOrder: 1,
    },
    {
      slug: 'databot',
      name: 'DataBot',
      role: 'Data Analyst',
      tagline: 'Turn data into decisions',
      description: 'DataBot analyzes spreadsheets, generates reports, and provides data insights for decision-making. Share your data files in chat and DataBot will extract meaningful patterns, create visualizations, and summarize findings.',
      category: 'analysis',
      capabilities: ['Spreadsheet analysis', 'Report generation', 'Data visualization', 'Trend detection', 'Sentiment analysis', 'KPI tracking'],
      gradientFrom: '#3B82F6',
      gradientTo: '#0891B2',
      iconName: 'BarChart3',
      isBuiltIn: true,
      isMandatory: false,
      isPopular: false,
      sortOrder: 2,
    },
    {
      slug: 'codeassist',
      name: 'CodeAssist',
      role: 'Developer Assistant',
      tagline: 'Your pair programming buddy',
      description: 'CodeAssist reviews code shared in conversations, suggests improvements, detects bugs, and helps with documentation. Supports all major programming languages and can explain complex code to non-technical team members.',
      category: 'productivity',
      capabilities: ['Code review', 'Bug detection', 'Documentation', 'Syntax highlighting', 'Refactoring suggestions', 'Multi-language support'],
      gradientFrom: '#F97316',
      gradientTo: '#F59E0B',
      iconName: 'Code',
      isBuiltIn: true,
      isMandatory: false,
      isPopular: false,
      sortOrder: 3,
    },
    {
      slug: 'guardian',
      name: 'Guardian',
      role: 'Security Monitor',
      tagline: 'Protect your conversations',
      description: 'Guardian monitors for sensitive data leaks, phishing attempts, and suspicious activity in messages. He alerts admins about potential security threats and helps maintain compliance standards across your organization.',
      category: 'security',
      capabilities: ['DLP monitoring', 'Phishing detection', 'Compliance checks', 'Threat alerts', 'Audit logging', 'Policy enforcement'],
      gradientFrom: '#EF4444',
      gradientTo: '#EC4899',
      iconName: 'Shield',
      isBuiltIn: true,
      isMandatory: false,
      isPopular: false,
      sortOrder: 4,
    },
    {
      slug: 'quickreply',
      name: 'QuickReply',
      role: 'Smart Auto-Responder',
      tagline: 'Reply faster, sound better',
      description: 'QuickReply drafts context-aware reply suggestions to help you respond faster in busy conversations. He learns your communication style and can adjust tone from casual to formal as needed.',
      category: 'communication',
      capabilities: ['Smart suggestions', 'Tone adjustment', 'Template responses', 'Priority detection', 'Style learning', 'Multi-language replies'],
      gradientFrom: '#EAB308',
      gradientTo: '#F97316',
      iconName: 'Zap',
      isBuiltIn: true,
      isMandatory: false,
      isPopular: true,
      sortOrder: 5,
    },
    {
      slug: 'notetaker',
      name: 'NoteTaker',
      role: 'Meeting & Chat Summarizer',
      tagline: 'Never miss a detail',
      description: 'NoteTaker automatically summarizes long conversations, extracts action items, and creates meeting notes. He can identify key decisions, deadlines, and follow-ups from any chat thread.',
      category: 'productivity',
      capabilities: ['Chat summarization', 'Action item extraction', 'Meeting notes', 'Decision tracking', 'Deadline detection', 'Weekly digests'],
      gradientFrom: '#8B5CF6',
      gradientTo: '#A855F7',
      iconName: 'FileText',
      isBuiltIn: true,
      isMandatory: false,
      isPopular: true,
      sortOrder: 6,
    },
  ];

  for (const agentData of presetAgents) {
    await prisma.agent.upsert({
      where: { slug: agentData.slug },
      update: {
        name: agentData.name,
        role: agentData.role,
        tagline: agentData.tagline,
        description: agentData.description,
        category: agentData.category,
        capabilities: agentData.capabilities,
        gradientFrom: agentData.gradientFrom,
        gradientTo: agentData.gradientTo,
        iconName: agentData.iconName,
        isBuiltIn: agentData.isBuiltIn,
        isMandatory: agentData.isMandatory,
        isPopular: agentData.isPopular,
        sortOrder: agentData.sortOrder,
      },
      create: agentData,
    });
  }

  console.log(`[Agents] Seeded ${presetAgents.length} preset agents`);
}
