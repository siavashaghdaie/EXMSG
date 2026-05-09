import React from 'react';
import { Text, View, StyleSheet, Linking } from 'react-native';

interface MarkdownTextProps {
  text: string;
  isOwn?: boolean;
}

/** Simple markdown renderer for React Native chat messages.
 *  Supports: **bold**, *italic*, ~~strikethrough~~, `inline code`,
 *  ```code blocks```, > blockquotes, # headers, - lists, [links](url) */
export default function MarkdownText({ text, isOwn = false }: MarkdownTextProps) {
  const textColor = isOwn ? '#FFFFFF' : '#1E293B';
  const mutedColor = isOwn ? 'rgba(255,255,255,0.7)' : '#64748B';
  const codeBackground = isOwn ? 'rgba(255,255,255,0.15)' : '#E2E8F0';

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    // Multi-line code block
    if (lines[i].startsWith('```')) {
      const lang = lines[i].slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      elements.push(
        <View key={`code-${i}`} style={styles.codeBlock}>
          {lang ? <Text style={styles.codeLang}>{lang}</Text> : null}
          <Text style={styles.codeText}>{codeLines.join('\n')}</Text>
        </View>
      );
      continue;
    }

    const line = lines[i];
    i++;

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <View key={`q-${i}`} style={styles.blockquote}>
          <Text style={[styles.blockquoteText, { color: mutedColor }]}>
            {renderInline(line.slice(2), textColor, codeBackground)}
          </Text>
        </View>
      );
      continue;
    }

    // Headers
    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^(#{1,3})\s/)![1].length;
      const content = line.replace(/^#{1,3}\s/, '');
      const fontSize = level === 1 ? 18 : level === 2 ? 16 : 14;
      elements.push(
        <Text key={`h-${i}`} style={[styles.header, { fontSize, color: textColor }]}>
          {renderInline(content, textColor, codeBackground)}
        </Text>
      );
      continue;
    }

    // Unordered list
    if (/^[\-\*]\s/.test(line)) {
      elements.push(
        <View key={`ul-${i}`} style={styles.listItem}>
          <Text style={[styles.listBullet, { color: mutedColor }]}>•</Text>
          <Text style={[styles.listText, { color: textColor }]}>
            {renderInline(line.replace(/^[\-\*]\s/, ''), textColor, codeBackground)}
          </Text>
        </View>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\.\s/)![1];
      elements.push(
        <View key={`ol-${i}`} style={styles.listItem}>
          <Text style={[styles.listBullet, { color: mutedColor }]}>{num}.</Text>
          <Text style={[styles.listText, { color: textColor }]}>
            {renderInline(line.replace(/^\d+\.\s/, ''), textColor, codeBackground)}
          </Text>
        </View>
      );
      continue;
    }

    // Regular line
    if (line.trim() === '') {
      elements.push(<View key={`br-${i}`} style={{ height: 4 }} />);
    } else {
      elements.push(
        <Text key={`l-${i}`} style={{ color: textColor, fontSize: 15, lineHeight: 20 }}>
          {renderInline(line, textColor, codeBackground)}
        </Text>
      );
    }
  }

  return <>{elements}</>;
}

/** Render inline markdown formatting */
function renderInline(text: string, textColor: string, codeBackground: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Tokenize: **bold**, *italic*, ~~strike~~, `code`, [link](url)
  const regex = /(\*\*.*?\*\*|\*.*?\*|~~.*?~~|`.*?`|\[.*?\]\(https?:\/\/.*?\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Plain text before match
    if (match.index > lastIndex) {
      parts.push(<Text key={key++} style={{ color: textColor }}>{text.slice(lastIndex, match.index)}</Text>);
    }

    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<Text key={key++} style={{ fontWeight: 'bold', color: textColor }}>{token.slice(2, -2)}</Text>);
    } else if (token.startsWith('~~')) {
      parts.push(<Text key={key++} style={{ textDecorationLine: 'line-through', color: textColor }}>{token.slice(2, -2)}</Text>);
    } else if (token.startsWith('`')) {
      parts.push(
        <Text key={key++} style={{ fontFamily: 'monospace', fontSize: 13, backgroundColor: codeBackground, color: textColor, paddingHorizontal: 2, borderRadius: 3 }}>
          {token.slice(1, -1)}
        </Text>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/\[(.+?)\]\((https?:\/\/.+?)\)/);
      if (linkMatch) {
        parts.push(
          <Text key={key++} style={{ color: '#60A5FA', textDecorationLine: 'underline' }} onPress={() => Linking.openURL(linkMatch[2])}>
            {linkMatch[1]}
          </Text>
        );
      }
    } else if (token.startsWith('*')) {
      parts.push(<Text key={key++} style={{ fontStyle: 'italic', color: textColor }}>{token.slice(1, -1)}</Text>);
    }

    lastIndex = match.index + token.length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(<Text key={key++} style={{ color: textColor }}>{text.slice(lastIndex)}</Text>);
  }

  return parts.length > 0 ? parts : [<Text key="empty" style={{ color: textColor }}>{text}</Text>];
}

const styles = StyleSheet.create({
  codeBlock: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
  },
  codeLang: {
    fontSize: 10,
    color: '#94A3B8',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#E2E8F0',
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: '#94A3B8',
    paddingLeft: 8,
    marginVertical: 2,
  },
  blockquoteText: {
    fontStyle: 'italic',
    fontSize: 15,
  },
  header: {
    fontWeight: 'bold',
    marginVertical: 2,
  },
  listItem: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 4,
  },
  listBullet: {
    fontSize: 15,
    minWidth: 12,
  },
  listText: {
    fontSize: 15,
    flex: 1,
    lineHeight: 20,
  },
});
