import { useState, useEffect } from 'react';
import { ExternalLink, Globe } from 'lucide-react';

interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}

interface LinkPreviewProps {
  url: string;
}

// Simple cache for previews
const previewCache = new Map<string, LinkPreviewData | null>();

export default function LinkPreview({ url }: LinkPreviewProps) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(previewCache.get(url) || null);
  const [isLoading, setIsLoading] = useState(!previewCache.has(url));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (previewCache.has(url)) {
      setPreview(previewCache.get(url) || null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchPreview = async () => {
      try {
        // Use a simple approach: extract domain info from the URL
        const urlObj = new URL(url);
        const domain = urlObj.hostname;

        // For now, create a basic preview from the URL itself
        // In production, you'd call a backend endpoint that fetches OG tags
        const basicPreview: LinkPreviewData = {
          url,
          title: urlObj.pathname === '/' ? domain : urlObj.pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || domain,
          description: `Link to ${domain}`,
          siteName: domain.replace('www.', ''),
          favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
        };

        if (!cancelled) {
          previewCache.set(url, basicPreview);
          setPreview(basicPreview);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          previewCache.set(url, null);
          setError(true);
          setIsLoading(false);
        }
      }
    };

    fetchPreview();
    return () => { cancelled = true; };
  }, [url]);

  if (error || (!isLoading && !preview)) return null;

  if (isLoading) {
    return (
      <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 animate-pulse">
        <div className="h-3 w-3/4 bg-slate-200 dark:bg-slate-600 rounded mb-2" />
        <div className="h-2 w-1/2 bg-slate-200 dark:bg-slate-600 rounded" />
      </div>
    );
  }

  if (!preview) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden hover:border-blue-300 dark:hover:border-blue-600 transition group"
    >
      {preview.image && (
        <div className="w-full h-32 bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <img
            src={preview.image}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}
      <div className="p-3 bg-slate-50 dark:bg-slate-700/50">
        <div className="flex items-center gap-1.5 mb-1">
          {preview.favicon ? (
            <img src={preview.favicon} alt="" className="w-4 h-4 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <Globe size={14} className="text-slate-400" />
          )}
          <span className="text-[11px] text-slate-500 truncate">{preview.siteName || new URL(url).hostname}</span>
          <ExternalLink size={10} className="text-slate-400 ml-auto flex-shrink-0" />
        </div>
        {preview.title && (
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{preview.description}</p>
        )}
      </div>
    </a>
  );
}
