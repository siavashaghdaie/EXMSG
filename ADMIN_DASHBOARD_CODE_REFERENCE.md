# Admin Dashboard - Code Reference

## Backend Code Examples

### AdminController Methods

```typescript
// Get dashboard overview
async getDashboard(req: Request, res: Response): Promise<void> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Parallel queries
  const [
    totalUsers,
    onlineUsers,
    totalConversations,
    messagesToday,
    messagesThisWeek,
    recentUsers,
    topGroups,
  ] = await Promise.all([...]);

  res.json({ stats: {...}, recentUsers, topGroups });
}
```

### Database Query Examples

```typescript
// Count all users
prisma.user.count()

// Count online users
prisma.user.count({ where: { isOnline: true } })

// Search users with pagination
prisma.user.findMany({
  where: {
    OR: [
      { username: { contains: query, mode: 'insensitive' } },
      { displayName: { contains: query, mode: 'insensitive' } },
      { email: { contains: query, mode: 'insensitive' } },
    ],
  },
  skip: (page - 1) * limit,
  take: limit,
  orderBy: { createdAt: 'desc' },
})

// Count messages in time range
prisma.message.count({
  where: { createdAt: { gte: dateStart, lte: dateEnd } }
})

// Get top groups with counts
prisma.conversation.findMany({
  where: { type: { in: ['GROUP', 'CHANNEL'] } },
  orderBy: { updatedAt: 'desc' },
  take: 5,
  select: {
    id: true,
    name: true,
    type: true,
    updatedAt: true,
    _count: { select: { members: true, messages: true } },
  },
})
```

## Frontend Code Examples

### Component Usage

```tsx
import AdminDashboard from '@/components/admin/AdminDashboard';

export default function App() {
  const [showDashboard, setShowDashboard] = useState(false);

  return (
    <div>
      {showDashboard ? (
        <AdminDashboard onBack={() => setShowDashboard(false)} />
      ) : (
        <MainContent />
      )}
    </div>
  );
}
```

### API Usage

```typescript
import { api } from '@/services/api';

// Get dashboard data
async function loadDashboard() {
  try {
    const data = await api.getAdminDashboard();
    console.log(data.stats.totalUsers);
    console.log(data.recentUsers);
    console.log(data.topGroups);
  } catch (error) {
    console.error('Failed to load dashboard:', error);
  }
}

// Search users
async function searchUsers(query: string, page: number = 1) {
  try {
    const result = await api.getAdminUsers(query, page, 20);
    console.log(result.users); // User array
    console.log(result.total); // Total count
    console.log(result.totalPages); // Total pages
  } catch (error) {
    console.error('Search failed:', error);
  }
}

// Get detailed stats
async function getStats() {
  try {
    const stats = await api.getAdminStats();
    console.log(stats.users); // User metrics
    console.log(stats.conversations); // Conversation metrics
    console.log(stats.messages); // Message metrics
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}
```

### Component State Management

```tsx
// Dashboard component state
const [data, setData] = useState<DashboardData | null>(null);
const [isLoading, setIsLoading] = useState(true);
const [searchQuery, setSearchQuery] = useState('');
const [userPage, setUserPage] = useState(1);
const [allUsers, setAllUsers] = useState<any[]>([]);
const [totalUserCount, setTotalUserCount] = useState(0);
const [isSearching, setIsSearching] = useState(false);

// Load dashboard data
useEffect(() => {
  loadDashboard();
}, []);

// Load users with pagination
const loadUsers = async (page: number = 1, search?: string) => {
  setIsSearching(true);
  try {
    const result = await api.getAdminUsers(search, page);
    setAllUsers(result.users);
    setTotalUserCount(result.total);
    setUserPage(page);
  } catch (err) {
    console.error('Load users failed:', err);
  } finally {
    setIsSearching(false);
  }
};
```

## API Response Examples

### Dashboard Response

```json
{
  "stats": {
    "totalUsers": 45321,
    "onlineUsers": 892,
    "totalConversations": 12450,
    "messagesToday": 2104,
    "messagesThisWeek": 54290,
    "avgMessagesPerDay": 7755
  },
  "recentUsers": [
    {
      "id": "user123",
      "username": "john_doe",
      "displayName": "John Doe",
      "email": "john@example.com",
      "avatarUrl": "https://...",
      "isOnline": true,
      "lastSeenAt": "2024-04-04T15:30:00Z",
      "createdAt": "2024-01-15T10:20:00Z"
    }
  ],
  "topGroups": [
    {
      "id": "group123",
      "name": "General",
      "type": "GROUP",
      "updatedAt": "2024-04-04T15:45:00Z",
      "_count": {
        "members": 125,
        "messages": 2450
      }
    }
  ]
}
```

### Users Response

```json
{
  "users": [
    {
      "id": "user123",
      "email": "john@example.com",
      "username": "john_doe",
      "displayName": "John Doe",
      "avatarUrl": "https://...",
      "isOnline": true,
      "lastSeenAt": "2024-04-04T15:30:00Z",
      "createdAt": "2024-01-15T10:20:00Z",
      "bio": "Software engineer",
      "status": "Hey, I'm using OmniLink!",
      "_count": {
        "conversationMembers": 42
      }
    }
  ],
  "total": 45321,
  "page": 1,
  "totalPages": 2267
}
```

### Stats Response

```json
{
  "users": {
    "total": 45321,
    "online": 892,
    "newToday": 145,
    "newThisWeek": 782
  },
  "conversations": {
    "total": 12450,
    "direct": 8923,
    "group": 2145,
    "channel": 1382
  },
  "messages": {
    "today": 2104,
    "thisWeek": 54290,
    "thisMonth": 198432,
    "total": 5234891,
    "avgPerDay": 7755
  }
}
```

## Routing Examples

### Express Route Registration

```typescript
import { Router } from 'express';
import { AdminController } from './admin.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new AdminController();

// All routes require authentication
router.get('/admin/dashboard', authenticate, (req, res) =>
  controller.getDashboard(req, res)
);

router.get('/admin/users', authenticate, (req, res) =>
  controller.getUsers(req, res)
);

router.get('/admin/stats', authenticate, (req, res) =>
  controller.getStats(req, res)
);

export { router as adminRoutes };
```

## TypeScript Interfaces

### Frontend Types

```typescript
interface DashboardStats {
  totalUsers: number;
  onlineUsers: number;
  totalConversations: number;
  messagesToday: number;
  messagesThisWeek: number;
  avgMessagesPerDay: number;
}

interface DashboardData {
  stats: DashboardStats;
  recentUsers: any[];
  topGroups: any[];
}

interface AdminDashboardProps {
  onBack: () => void;
}

interface SidebarProps {
  isMobile?: boolean;
  onNavigateChat?: () => void;
  onSettingsClick?: () => void;
  onDashboardClick?: () => void;
  onClose?: () => void;
  onNavigateToMessage?: (conversationId: string, messageId: string) => void;
}
```

## Styling Examples

### Tailwind Classes Used

```tsx
// Layout
className="flex-1 flex flex-col h-full"

// Dark mode
className="bg-slate-50 dark:bg-slate-900"

// Cards
className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"

// Text
className="text-slate-900 dark:text-white"

// Icons with colors
className="text-blue-600 dark:text-blue-400"

// Buttons
className="px-3 py-1.5 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"

// Badges
className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"

// Animations
className="animate-spin"
className="transition hover:shadow-md"
```

## Error Handling Examples

```typescript
// Backend error handling
try {
  const data = await api.getAdminDashboard();
  setData(data);
} catch (err) {
  console.error('Dashboard load failed:', err);
  // Display error to user
  setError('Failed to load dashboard. Please try again.');
}

// Frontend error handling
async function loadUsers() {
  setIsSearching(true);
  try {
    const result = await api.getAdminUsers(search, page);
    setAllUsers(result.users);
  } catch (error) {
    console.error('Load users failed:', error);
    // Show error message
  } finally {
    setIsSearching(false);
  }
}
```

## Testing Examples

### Unit Tests

```typescript
describe('AdminController', () => {
  describe('getDashboard', () => {
    it('should return dashboard statistics', async () => {
      const controller = new AdminController();
      const req = {} as Request;
      const res = {
        json: jest.fn(),
      } as unknown as Response;

      await controller.getDashboard(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          stats: expect.any(Object),
          recentUsers: expect.any(Array),
          topGroups: expect.any(Array),
        })
      );
    });
  });
});
```

### API Tests

```typescript
// Using fetch or axios
const response = await fetch('/api/admin/dashboard', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});

expect(response.status).toBe(200);
const data = await response.json();
expect(data.stats).toBeDefined();
expect(data.recentUsers).toBeInstanceOf(Array);
expect(data.topGroups).toBeInstanceOf(Array);
```

## Performance Optimization Examples

```typescript
// Parallel queries for performance
const [users, total] = await Promise.all([
  prisma.user.findMany({...}),
  prisma.user.count({...}),
]);

// Debounced search
const [searchQuery, setSearchQuery] = useState('');

const handleSearch = useCallback(
  debounce((query: string) => {
    loadUsers(1, query);
  }, 300),
  []
);

// Lazy loading with pagination
const loadNextPage = async () => {
  const nextPage = userPage + 1;
  await loadUsers(nextPage, searchQuery);
};
```

## Deployment Checklist Code

```bash
#!/bin/bash
# Pre-deployment checks

# 1. Build check
npm run build

# 2. Test check
npm run test

# 3. Lint check
npm run lint

# 4. Type check
npm run type-check

# 5. Security audit
npm audit

# 6. Environment check
echo "Checking environment variables..."
env | grep DATABASE_URL
env | grep JWT_SECRET

# 7. Database migration
npx prisma migrate deploy

# 8. Start server
npm start
```

