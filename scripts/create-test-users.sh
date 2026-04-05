#!/bin/bash
# Create 15 test users for Exclusive Messenger

echo "Creating 15 test users..."
echo ""

for i in $(seq 1 15); do
  RESULT=$(curl -s -X POST http://localhost:3001/api/auth/register \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"user${i}@exclusive.com\", \"username\": \"testuser${i}\", \"displayName\": \"Test User ${i}\", \"password\": \"Test1234!\"}")

  if echo "$RESULT" | grep -q "accessToken"; then
    echo "✓ Created: testuser${i} (user${i}@exclusive.com)"
  else
    ERROR=$(echo "$RESULT" | grep -o '"message":"[^"]*"' | head -1)
    if [ -z "$ERROR" ]; then
      ERROR=$(echo "$RESULT" | grep -o '"error":"[^"]*"' | head -1)
    fi
    echo "✗ Failed: testuser${i} - $ERROR"
  fi
done

echo ""
echo "Done! All users have password: Test1234!"
echo "You can log in as any of them (testuser1 through testuser15)"
