import { Download, FileText, Image, Film, Music, Archive, FileSpreadsheet, Presentation, Play } from 'lucide-react';

interface FileCardProps {
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
}

export default function FileCard({ fileName, fileSize, mimeType, url }: FileCardProps) {
  const getIcon = () => {
    if (mimeType.startsWith('image/')) return <Image size={24} className="text-green-500" />;
    if (mimeType.startsWith('video/')) return <Film size={24} className="text-purple-500" />;
    if (mimeType.startsWith('audio/')) return <Music size={24} className="text-pink-500" />;
    if (mimeType.includes('pdf')) return <FileText size={24} className="text-red-500" />;
    if (mimeType.includes('zip') || mimeType.includes('compress')) return <Archive size={24} className="text-amber-500" />;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileSpreadsheet size={24} className="text-green-600" />;
    if (mimeType.includes('presentation')) return <Presentation size={24} className="text-orange-500" />;
    return <FileText size={24} className="text-blue-500" />;
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Image preview with thumbnail
  if (mimeType.startsWith('image/')) {
    return (
      <div className="rounded-lg overflow-hidden max-w-sm">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img
            src={url}
            alt={fileName}
            className="max-w-full max-h-96 object-contain rounded-lg cursor-pointer hover:opacity-90 transition"
            loading="lazy"
            onError={(e) => {
              // If image fails to load, show broken image text
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.parentElement!.innerHTML = '<div class="p-4 text-sm text-slate-400">Image failed to load</div>';
            }}
          />
        </a>
        <div className="flex items-center gap-2 mt-1 px-1">
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate flex-1">{fileName}</span>
          <a
            href={url}
            download={fileName}
            className="p-1 hover:bg-slate-100 dark:hover:bg-surface-700 rounded transition"
            title="Download"
          >
            <Download size={14} className="text-slate-400" />
          </a>
        </div>
      </div>
    );
  }

  // Video preview with play overlay
  if (mimeType.startsWith('video/')) {
    return (
      <div className="rounded-lg overflow-hidden max-w-xs">
        <div className="relative">
          <video
            src={url}
            className="max-w-full max-h-48 rounded-lg bg-black"
            preload="metadata"
          />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition rounded-lg"
          >
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
              <Play size={24} className="text-slate-800 ml-1" />
            </div>
          </a>
        </div>
        <div className="flex items-center gap-2 mt-1 px-1">
          <Film size={14} className="text-purple-500 flex-shrink-0" />
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate flex-1">{fileName}</span>
          <span className="text-xs text-slate-400">{formatSize(fileSize)}</span>
          <a
            href={url}
            download={fileName}
            className="p-1 hover:bg-slate-100 dark:hover:bg-surface-700 rounded transition"
            title="Download"
          >
            <Download size={14} className="text-slate-400" />
          </a>
        </div>
      </div>
    );
  }

  // Default file card for documents, archives, etc.
  return (
    <div className="flex items-center gap-3 bg-white/50 dark:bg-slate-700/50 rounded-lg p-3 border border-slate-200 dark:border-slate-600 max-w-xs">
      <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-600 rounded-lg">
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{fileName}</p>
        <p className="text-xs text-slate-500">{formatSize(fileSize)}</p>
      </div>
      <a
        href={url}
        download={fileName}
        className="flex-shrink-0 p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
        title="Download"
      >
        <Download size={16} />
      </a>
    </div>
  );
}
