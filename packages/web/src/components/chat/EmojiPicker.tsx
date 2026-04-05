import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const EMOJI_CATEGORIES = [
  {
    name: 'Smileys',
    icon: '😊',
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','😮‍💨','🤥','🫨','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
  },
  {
    name: 'People',
    icon: '👋',
    emojis: ['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💪','🦾','🦵','🦿','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','🫦','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵'],
  },
  {
    name: 'Nature',
    icon: '🐶',
    emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🌸','🌹','🌺','🌻','🌼','🌷','🪷','💐','🌾','🌿','☘️','🍀','🍁','🍂','🍃','🪹','🪺','🍄','🌰','🦀','🦞','🦐','🦑','🐙','🐚','🪸','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒'],
  },
  {
    name: 'Food',
    icon: '🍔',
    emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🫛','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🫚','🥔','🍠','🫘','🥐','🥖','🍞','🥨','🥯','🧇','🥞','🧈','🍳','🥚','🧀','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🌮','🌯','🫔','🥙','🧆','🥚','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪'],
  },
  {
    name: 'Activities',
    icon: '⚽',
    emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🤺','🏇','⛹️','🏋️','🤸','🏊','🚴','🧘','🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻','🪈','🎲','♟️','🎯','🎳','🎮','🎰','🧩'],
  },
  {
    name: 'Travel',
    icon: '🚗',
    emojis: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛵','🏍️','🛺','🚲','🛴','🛹','🛼','🚏','🛣️','🛤️','🛞','⛽','🛞','🚨','🚥','🚦','🛑','🚧','⚓','🛟','⛵','🚤','🛳️','⛴️','🛥️','🚢','✈️','🛩️','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸','🌍','🌎','🌏','🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🧱','🪨','🪵','🛖','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽'],
  },
  {
    name: 'Objects',
    icon: '💡',
    emojis: ['⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💾','💿','📀','📼','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🪫','🔌','💡','🔦','🕯️','🪔','🧯','🗑️','🛢️','💸','💵','💴','💶','💷','🪙','💰','💳','🪪','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🪤','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','🪬','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','🩻','🩼','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🪠','🧺','🧻','🧼','🫧','🪥','🧽','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🪆','🖼️','🪞','🪟','🛍️','🛒','🎁','🎈','🎏','🎀','🪄','🪅','🎊','🎉','🎎','🎐','🏮','🪩','✉️','📩','📨','📧','💌','📥','📤','📦','🏷️','🪧','📪','📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈','📉','🗒️','🗓️','📆','📅','🗑️','📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇️','📐','📏','🧮','📌','📍','✂️','🖊️','🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓'],
  },
  {
    name: 'Symbols',
    icon: '❤️',
    emojis: ['❤️','🩷','🧡','💛','💚','💙','🩵','💜','🖤','🩶','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🪯','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼','⚧️','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸️','⏯️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕','➖','➗','✖️','🟰','♾️','💲','💱','™️','©️','®️','👁️‍🗨️','🔚','🔙','🔛','🔝','🔜','〰️','➰','➿','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹','🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫','🔈','🔇','🔉','🔊','🔔','🔕','📣','📢','💬','💭','🗯️','♠️','♣️','♥️','♦️','🃏','🎴','🀄','🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚','🕛','🕜','🕝','🕞','🕟','🕠','🕡','🕢','🕣','🕤','🕥','🕦','🕧'],
  },
  {
    name: 'Flags',
    icon: '🏳️',
    emojis: ['🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇦🇪','🇺🇸','🇬🇧','🇫🇷','🇩🇪','🇯🇵','🇰🇷','🇨🇳','🇮🇳','🇧🇷','🇷🇺','🇨🇦','🇦🇺','🇮🇹','🇪🇸','🇲🇽','🇹🇷','🇸🇦','🇪🇬','🇵🇰','🇮🇩','🇳🇬','🇿🇦','🇦🇷','🇨🇴','🇵🇱','🇳🇱','🇧🇪','🇸🇪','🇨🇭','🇦🇹','🇳🇴','🇩🇰','🇫🇮','🇮🇪','🇵🇹','🇬🇷','🇨🇿','🇷🇴','🇭🇺','🇮🇱','🇵🇭','🇹🇭','🇻🇳','🇲🇾','🇸🇬','🇳🇿','🇨🇱','🇵🇪','🇺🇦','🇯🇴','🇱🇧','🇮🇶','🇰🇼','🇶🇦','🇧🇭','🇴🇲','🇾🇪'],
  },
];

// Recently used emojis (stored in memory for the session)
let recentEmojis: string[] = [];

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleEmojiClick = (emoji: string) => {
    onSelect(emoji);
    // Add to recents
    recentEmojis = [emoji, ...recentEmojis.filter(e => e !== emoji)].slice(0, 24);
  };

  const filteredEmojis = useMemo(() => {
    if (!searchQuery) return null;
    const query = searchQuery.toLowerCase();
    const all: string[] = [];
    EMOJI_CATEGORIES.forEach(cat => {
      cat.emojis.forEach(emoji => {
        // Simple search - just include all if query is short
        if (query.length <= 1 || cat.name.toLowerCase().includes(query)) {
          all.push(emoji);
        }
      });
    });
    return all.slice(0, 80);
  }, [searchQuery]);

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full mb-2 right-0 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50"
    >
      {/* Search */}
      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
          <Search size={16} className="text-slate-400 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emoji..."
            className="flex-1 bg-transparent text-sm outline-none text-slate-900 dark:text-white placeholder-slate-400"
            autoFocus
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}>
              <X size={14} className="text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      {!searchQuery && (
        <div className="flex border-b border-slate-200 dark:border-slate-700 px-1">
          {EMOJI_CATEGORIES.map((cat, idx) => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(idx)}
              className={`flex-1 py-2 text-lg hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition ${
                activeCategory === idx ? 'bg-slate-100 dark:bg-slate-700' : ''
              }`}
              title={cat.name}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="h-64 overflow-y-auto p-2">
        {/* Recent emojis */}
        {!searchQuery && recentEmojis.length > 0 && activeCategory === 0 && (
          <div className="mb-2">
            <p className="text-xs text-slate-500 font-medium px-1 mb-1">Recently Used</p>
            <div className="grid grid-cols-8 gap-0.5">
              {recentEmojis.map((emoji, idx) => (
                <button
                  key={`recent-${idx}`}
                  onClick={() => handleEmojiClick(emoji)}
                  className="w-9 h-9 flex items-center justify-center text-xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {searchQuery ? (
          <div className="grid grid-cols-8 gap-0.5">
            {(filteredEmojis || []).map((emoji, idx) => (
              <button
                key={`search-${idx}`}
                onClick={() => handleEmojiClick(emoji)}
                className="w-9 h-9 flex items-center justify-center text-xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <p className="text-xs text-slate-500 font-medium px-1 mb-1">
              {EMOJI_CATEGORIES[activeCategory].name}
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, idx) => (
                <button
                  key={`cat-${idx}`}
                  onClick={() => handleEmojiClick(emoji)}
                  className="w-9 h-9 flex items-center justify-center text-xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
