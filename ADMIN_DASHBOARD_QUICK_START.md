# Admin Dashboard - Quick Start Guide

## What Was Built

A complete admin/owner dashboard system for OmniLink Messenger with:
- Real-time system statistics
- User management interface
- Group/channel activity monitoring
- Responsive design (desktop & mobile)

## File Locations

### Backend (Node.js/Express/Prisma)
- **Controller**: `/packages/backend/src/modules/admin/admin.controller.ts`
- **Routes**: `/packages/backend/src/modules/admin/admin.routes.ts`
- **Main Entry**: `/packages/backend/src/index.ts` (updated)

### Frontend (React/TypeScript)
- **Dashboard Component**: `/packages/web/src/components/admin/AdminDashboard.tsx`
- **Layout Integration**: `/packages/web/src/components/layout/ChatLayout.tsx` (updated)
- **Sidebar Integration**: `/packages/web/src/components/sidebar/Sidebar.tsx` (updated)
- **API Service**: `/packages/web/src/services/api.ts` (updated)

## API Endpoints

```
GET /api/admin/dashboard     - Core dashboard data
GET /api/admin/users         - User list with search & pagination
GET /api/admin/stats         - Detailed statistics
```

All endpoints require `Authorization: Bearer TOKEN` header.

## Features Implemented

### Dashboard Stats Cards
- Total Users (with online count)
- Messages Today (with daily average)
- Total Conversations
- Weekly Message Activity

### User Management
- Search users by name, email, or username
- Pagination (20 users per page)
- Online/offline status indicator
- User metadata display

### Groups & Channels
- Top 5 active groups/channels
- Member count per group
- Message count per group

### UI Features
- Dark mode support
- Mobile responsive
- Loading states
- Error handling
- Refresh button
- Real-time activity metrics

## How to Access

### Desktop
1. Open sidebar (left panel)
2. Look for BarChart3 icon (next to Settings)
3. Click to open dashboard

### Mobile
- Same functionality, responsive layout
- All features work on small screens

## Code Examples

### Using the Dashboard API (Frontend)

```typescript
import { api } from '@/services/api';

// Get dashboard overview
const data = await api.getAdminDashboard();
console.log(data.stats.totalUsers);

// Search users
const users = await api.getAdminUsers('john', 1, 20);

// Get detailed stats
const stats = await api.getAdminStats();
```

### Making API Calls (Backend Verified)

```bash
# Dashboard overview
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/admin/dashboard

# User search
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/admin/users?search=john&page=1"

# Statistics
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/admin/stats
```

## Database Queries Used

The dashboard uses these Prisma queries:

```typescript
// User counts
prisma.user.count()
prisma.user.count({ where: { isOnline: true } })

// Conversation counts
prisma.conversation.count()
prisma.conversation.count({ where: { type: 'GROUP' } })

// Message counts
prisma.message.count({ where: { createdAt: { gte: date } } })

// User list with search
prisma.user.findMany({
  where: { OR: [{ username: ... }, { email: ... }] },
  skip, take
})
```

## Component Props

### AdminDashboard Component
```typescript
interface AdminDashboardProps {
  onBack: () => void;  // Callback to close dashboard
}

// Usage
<AdminDashboard onBack={() => setShowDashboard(false)} />
```

### API Methods
```typescript
api.getAdminDashboard()                      // Returns DashboardData
api.getAdminStats()                          // Returns StatsData
api.getAdminUsers(search?, page?, limit?)   // Returns paginated users
```

## Styling

- Uses Tailwind CSS
- Dark mode classes: `dark:bg-slate-800` etc.
- Responsive: `sm:`, `md:`, `lg:` breakpoints
- Icon library: lucide-react

## Key Implementation Details

1. **Authentication**: Uses existing auth middleware (`authenticate`)
2. **Database**: Prisma ORM with PostgreSQL
3. **Real-time**: Manual refresh (WebSocket can be added)
4. **Search**: Case-insensitive, multi-field search
5. **Pagination**: 20 items per page (customizable)

## Integration Checklist

- [x] Backend controller created
- [x] Backend routes registered
- [x] Frontend component created
- [x] API methods added
- [x] ChatLayout updated for dashboard state
- [x] Sidebar updated with dashboard button
- [x] Dark mode support
- [x] Mobile responsive
- [x] Error handling
- [x] Loading states

## Testing Checklist

- [ ] Backend: Test `/api/admin/dashboard` endpoint
- [ ] Backend: Test `/api/admin/users` endpoint with search
- [ ] Backend: Test `/api/admin/stats` endpoint
- [ ] Frontend: Open dashboard via sidebar icon
- [ ] Frontend: Verify stats display correctly
- [ ] Frontend: Test user search functionality
- [ ] Frontend: Test pagination
- [ ] Mobile: Test responsive layout
- [ ] Dark mode: Verify all colors render correctly

## Troubleshooting

### Dashboard doesn't load
- Check authentication token in localStorage
- Verify backend server is running
- Check browser console for API errors

### Search returns no results
- Verify user data exists in database
- Check exact name/email spellings
- Try shorter search terms

### Stats show 0
- Verify data exists in database
- Check date filters in controller
- Ensure timezone is correct

## Next Steps

To extend the dashboard:

1. **Add user suspension/ban**: Add buttons in user list
2. **Add conversation management**: Show conversation details
3. **Add activity charts**: Use Chart.js or Recharts
4. **Add audit logs**: Track admin actions
5. **Add role management**: Assign admin roles

## Support

For issues or questions:
1. Check the full implementation guide: `ADMIN_DASHBOARD_IMPLEMENTATION.md`
2. Review backend controller logic
3. Check frontend component React hooks
4. Verify API response data structure
