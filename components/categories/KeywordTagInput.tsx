'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { createTagAction } from '@/app/admin/tools/tags/actions';
import { Tag, Folder, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface KeywordTagInputProps {
  selectedKeywords: string[];
  onKeywordsChange: (keywords: string[]) => void;
  placeholder?: string;
  type?: 'category' | 'tag' | 'audience' | 'generic' | 'parent-category' | 'parent-tag' | 'blog-category';
  singleSelect?: boolean;
  name?: string;
  hasError?: boolean;
  onClearError?: () => void;
  className?: string;
}

export const DEFAULT_BLOG_CATEGORIES = [
  'AI Agents',
  'AI Engineering',
  'AI for Business',
  'AI Infrastructure',
  'AI News',
  'AI Research',
  'Automation',
  'Comparison',
  'Development',
  'e-commerce',
  'Guides & Tutorials',
  'Models & LLMs',
  'Prompt Engineering',
  'Research & Insights',
  'Tips & Tricks'
];

export const DEFAULT_PARENT_CATEGORIES = [
  '3D & Architecture',
  'Advertising & Marketing',
  'AI Tools & Platforms',
  'Art & Creative',
  'Audio & Music',
  'Avatars & Characters',
  'Business',
  'Business & Enterprise',
  'Career & HR',
  'Chatbots & Assistants',
  'Coding & Development',
  'Customer Support & CRM',
  'Data & Analytics',
  'Design & UI/UX',
  'Detection & Safety',
  'E-commerce & Retail',
  'Ecommerce',
  'Education & Learning',
  'Education & Translation',
  'Email & Communication',
  'Entertainment & Games',
  'Fashion & Beauty',
  'Finance',
  'Finance & Accounting',
  'Gaming & Virtual Worlds',
  'Health & Wellness',
  'HR & Recruitment',
  'Image & Design',
  'Image Analysis',
  'Image Generation & Editing',
  'Interior & Architecture',
  'Legal',
  'Legal & Compliance',
  'Life & Assistant',
  'Marketing & Ads',
  'Medical & Healthcare',
  'Music & Audio',
  'News & Information',
  'Operations & Management',
  'Other',
  'Personal & Relationships',
  'Productivity',
  'Productivity & Workflow',
  'Real Estate & Property',
  'Research & Data',
  'Sales & Outreach',
  'Science & Research',
  'Security & Privacy',
  'SEO & Growth',
  'Social Media',
  'Social Media & Community',
  'Sports & Fitness',
  'Travel & Hospitality',
  'Travel & Navigation',
  'Video & Animation',
  'Voice & Speech',
  'Writing & Copywriting',
  'Writing & Editing'
];

export const DEFAULT_PARENT_TAGS = DEFAULT_PARENT_CATEGORIES;

const getDefaultSuggestions = (inputType: string) => {
  if (inputType === 'parent-category' || inputType === 'category') {
    return DEFAULT_PARENT_CATEGORIES;
  }
  if (inputType === 'parent-tag' || inputType === 'tag') {
    return DEFAULT_PARENT_TAGS;
  }
  if (inputType === 'blog-category') {
    return DEFAULT_BLOG_CATEGORIES;
  }
  return [];
};

export default function KeywordTagInput({
  selectedKeywords,
  onKeywordsChange,
  placeholder = 'Type or select keyword...',
  type = 'generic',
  singleSelect = false,
  name,
  hasError = false,
  onClearError,
  className
}: KeywordTagInputProps) {
  const [inputValue, setInputValue] = useState(() => (singleSelect && selectedKeywords[0] ? selectedKeywords[0] : ''));
  const [dbSuggestions, setDbSuggestions] = useState<string[]>(() => getDefaultSuggestions(type));
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Synchronize inputValue with selectedKeywords for singleSelect mode
  useEffect(() => {
    if (singleSelect) {
      setInputValue(selectedKeywords[0] || '');
    }
  }, [singleSelect, selectedKeywords]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setIsFocused(false);
        setSelectedIndex(-1);
        if (singleSelect) {
          setInputValue(selectedKeywords[0] || '');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [singleSelect, selectedKeywords]);

  // Fetch recommendations freshly from Supabase DB without global cache
  useEffect(() => {
    let isCancelled = false;

    const loadDbSuggestions = async () => {
      const defaultList = getDefaultSuggestions(type);
      
      if (type === 'generic' || type === 'audience') {
        if (!isCancelled) setDbSuggestions(defaultList);
        return;
      }

      if (!isCancelled) setDbSuggestions(defaultList);

      try {
        if (type === 'category' || type === 'parent-category') {
          const fetchedCats: string[] = [...defaultList];

          try {
            const { data: cData } = await supabase
              .from('categories')
              .select('name, parent')
              .limit(1000);

            if (cData) {
              cData.forEach((row: any) => {
                if (row.name) fetchedCats.push(row.name);
                if (row.parent) fetchedCats.push(row.parent);
              });
            }
          } catch (e) {
            console.warn('Error fetching from categories table:', e);
          }

          const uniqueCats = Array.from(new Set(fetchedCats.filter(n => n && n !== 'NULL' && n !== 'EMPTY')));
          if (!isCancelled) setDbSuggestions(uniqueCats);
          return;
        }

        if (type === 'parent-tag' || type === 'tag') {
          const fetchedTags: string[] = [...DEFAULT_PARENT_TAGS];

          // Fetch from dedicated 'tags' table
          try {
            const { data: tData } = await supabase
              .from('tags')
              .select('name, slug, parent_tag')
              .limit(1000);

            if (tData) {
              tData.forEach((row: any) => {
                const rawName = row.name || row.slug;
                if (rawName) {
                  const cleanName = rawName.replace(/^#+/, '').trim();
                  if (cleanName) fetchedTags.push(cleanName);
                }
                if (row.parent_tag) {
                  const cleanParent = row.parent_tag.replace(/^#+/, '').trim();
                  if (cleanParent) fetchedTags.push(cleanParent);
                }
              });
            }
          } catch (e) {
            console.warn('Error fetching from tags table:', e);
          }

          const uniqueTags = Array.from(new Set(fetchedTags.filter(n => n && n !== '#' && n !== 'NULL' && n !== 'EMPTY')));
          if (!isCancelled) setDbSuggestions(uniqueTags);
          return;
        }

        if (type === 'blog-category') {
          const fetchedBlogCats: string[] = [...DEFAULT_BLOG_CATEGORIES];

          try {
            const { data: bData } = await supabase
              .from('blog_posts')
              .select('categories')
              .limit(1000);

            if (bData) {
              bData.forEach((row: any) => {
                if (Array.isArray(row.categories)) {
                  row.categories.forEach((cat: string) => {
                    if (cat && typeof cat === 'string') fetchedBlogCats.push(cat.trim());
                  });
                }
              });
            }
          } catch (e) {
            console.warn('Error fetching from blog_posts table:', e);
          }

          const uniqueBlogCats = Array.from(new Set(fetchedBlogCats.filter(n => n && n !== 'NULL' && n !== 'EMPTY')));
          if (!isCancelled) setDbSuggestions(uniqueBlogCats);
          return;
        }
      } catch (err) {
        console.error('Error fetching suggestions:', err);
      }
    };

    loadDbSuggestions();

    return () => {
      isCancelled = true;
    };
  }, [type]);

  // Compute filtered suggestions whenever inputValue or selectedKeywords changes
  useEffect(() => {
    const selectedLower = selectedKeywords.map(k => k.toLowerCase().replace(/^#+/, ''));
    const available = singleSelect
      ? dbSuggestions
      : dbSuggestions.filter(kw => !selectedLower.includes(kw.toLowerCase().replace(/^#+/, '')));

    const searchVal = inputValue.trim().toLowerCase().replace(/^#+/, '');
    const currentSelected = (selectedKeywords[0] || '').toLowerCase().replace(/^#+/, '');

    if (!searchVal || (singleSelect && searchVal === currentSelected)) {
      setSuggestions(available);
    } else {
      const cleanSearch = searchVal.replace(/[\s#]+/g, '');
      const filtered = available.filter(kw => {
        const cleanKw = kw.toLowerCase().replace(/[\s#]+/g, '');
        return cleanKw.includes(cleanSearch);
      });
      setSuggestions(filtered);
    }
  }, [inputValue, selectedKeywords, dbSuggestions, singleSelect]);

  // Reset selectedIndex whenever suggestions or inputValue changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [inputValue, suggestions.length, showSuggestions]);

  const totalNavigableItems = suggestions.length;

  // Auto-scroll highlighted option into view
  useEffect(() => {
    if (selectedIndex >= 0 && dropdownRef.current) {
      const activeEl = dropdownRef.current.querySelector(`[data-nav-index="${selectedIndex}"]`) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const addKeyword = async (keyword: string) => {
    let trimmed = keyword.trim().replace(/^#+/, '');
    if (!trimmed) return;

    // Categories match existing or default
    const isCategory = type === 'category' || type === 'parent-category' || type === 'blog-category';
    if (isCategory) {
      const match = dbSuggestions.find(db => db.toLowerCase() === trimmed.toLowerCase());
      if (match) {
        trimmed = match; // Use exact default/DB casing
      }
    }

    const isTagType = type === 'parent-tag' || type === 'tag';

    if (onClearError) onClearError();

    if (singleSelect) {
      onKeywordsChange([trimmed]);
      setInputValue(trimmed);
      setShowSuggestions(false);
      setSelectedIndex(-1);
      return;
    } else if (!selectedKeywords.some(k => k.replace(/^#+/, '').toLowerCase() === trimmed.toLowerCase())) {
      onKeywordsChange([...selectedKeywords, trimmed]);
      setInputValue('');
    }

    // Auto-create tag in DB if it's a new custom tag
    if (isTagType && !dbSuggestions.some(db => db.toLowerCase() === trimmed.toLowerCase())) {
      const urlSlug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (token) {
            await createTagAction({
              name: trimmed,
              slug: urlSlug,
              status: 'show'
            }, token);
          }
        } catch {}
      })();

      setDbSuggestions(prev => [...prev, trimmed]);
    }

    // Remember new custom category in suggestions state
    if (isCategory && !dbSuggestions.some(db => db.toLowerCase() === trimmed.toLowerCase())) {
      setDbSuggestions(prev => [...prev, trimmed].sort((a, b) => a.localeCompare(b)));
    }

    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const removeKeyword = (keyword: string) => {
    if (onClearError) onClearError();
    onKeywordsChange(selectedKeywords.filter(k => k !== keyword));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!showSuggestions) {
        setShowSuggestions(true);
        setSelectedIndex(0);
      } else if (totalNavigableItems > 0) {
        setSelectedIndex(prev => (prev + 1 < totalNavigableItems ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!showSuggestions) {
        setShowSuggestions(true);
        setSelectedIndex(totalNavigableItems > 0 ? totalNavigableItems - 1 : 0);
      } else if (totalNavigableItems > 0) {
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : totalNavigableItems - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showSuggestions && selectedIndex >= 0 && selectedIndex < suggestions.length) {
        addKeyword(suggestions[selectedIndex]);
      } else if (inputValue.trim()) {
        addKeyword(inputValue);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSuggestions(false);
      setSelectedIndex(-1);
    } else if (e.key === 'Backspace' && !inputValue && selectedKeywords.length > 0) {
      removeKeyword(selectedKeywords[selectedKeywords.length - 1]);
    }
  };

  const isCategoryType = type === 'category' || type === 'parent-category' || type === 'blog-category';

  return (
    <div className="w-full" ref={containerRef}>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          name={name}
          value={inputValue}
          onChange={(e) => {
            const val = e.target.value;
            setInputValue(val);
            setShowSuggestions(true);
            if (onClearError) {
              onClearError();
            }
            if (singleSelect && !val.trim()) {
              onKeywordsChange([]);
            }
          }}
          onInput={() => {
            if (onClearError) {
              onClearError();
            }
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            setShowSuggestions(true);
          }}
          placeholder={singleSelect && inputValue ? '' : placeholder}
          className={`bg-[var(--bg-elevated)] text-[13px] text-[var(--text-primary)] font-normal ${
            hasError ? 'saas-input-error' : 'border-[var(--border-color)]'
          } ${
            singleSelect && inputValue ? 'pr-9 font-medium text-[var(--text-primary)]' : ''
          } ${className || ''}`}
          suppressHydrationWarning
        />

        {singleSelect && inputValue && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onKeywordsChange([]);
              setInputValue('');
              if (onClearError) onClearError();
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-rose-500 transition-colors p-1 rounded-md cursor-pointer"
            title="Clear selection"
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        )}

        {showSuggestions && isFocused && suggestions.length > 0 && (
          <div ref={dropdownRef} className="absolute z-[100] left-0 right-0 mt-1 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-xl max-h-56 overflow-y-auto animate-in fade-in zoom-in-95 duration-100 p-1">
            {suggestions.map((s, i) => {
              const isSelected = selectedIndex === i;
              return (
                <button
                  key={i}
                  type="button"
                  data-nav-index={i}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => addKeyword(s)}
                  className={`w-full text-left px-3 py-2 text-[13px] font-medium transition-colors rounded-lg flex items-center justify-between group ${
                    isSelected
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold ring-1 ring-zinc-300 dark:ring-zinc-600'
                      : 'text-[var(--text-primary)] hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {isCategoryType ? (
                      <Folder size={13} className={isSelected ? 'text-zinc-900 dark:text-zinc-100' : 'text-[var(--text-muted)] group-hover:text-zinc-900 dark:group-hover:text-zinc-100'} />
                    ) : (
                      <Tag size={13} className={isSelected ? 'text-zinc-900 dark:text-zinc-100' : 'text-[var(--text-muted)] group-hover:text-zinc-900 dark:group-hover:text-zinc-100'} />
                    )}
                    {s}
                  </span>
                  <Plus size={13} className={isSelected ? 'opacity-100 text-zinc-900 dark:text-zinc-100' : 'opacity-0 group-hover:opacity-100 text-zinc-600 dark:text-zinc-400'} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!singleSelect && selectedKeywords.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {selectedKeywords.map((kw, i) => (
            <Badge
              key={i}
              variant="slate"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full normal-case tracking-normal animate-in fade-in zoom-in duration-200 shrink-0"
            >
              <span>{kw}</span>
              <button
                type="button"
                onClick={() => removeKeyword(kw)}
                className="hover:text-rose-500 transition-colors cursor-pointer ml-0.5 text-xs font-bold p-0.5 rounded-full hover:bg-rose-500/10"
                aria-label={`Remove keyword ${kw}`}
              >
                <X size={12} />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
