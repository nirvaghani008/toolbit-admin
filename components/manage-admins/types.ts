export interface AdminUser {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  role: 'admin' | 'subadmin';
  created_at: string;
  last_sign_in_at?: string | null;
  granted_by?: string | null;
  granted_at?: string | null;
  permissions?: Record<string, ModulePermission>;
}

export interface ModulePermission {
  can_view: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
}

export interface ModuleDefinition {
  key: string;
  name: string;
  description: string;
  badge: string;
  category: 'Overview' | 'Catalog' | 'Content' | 'Operations' | 'Audience' | 'Account';
  supportsInsert: boolean;
  supportsUpdate: boolean;
  supportsDelete: boolean;
}

export const ADMIN_MODULES: ModuleDefinition[] = [
  // ── Overview ──────────────────────────────────────────────────────────────
  {
    key: 'dashboard',
    name: 'Dashboard & Analytics',
    description: 'System overview, KPI metric cards, platform statistics and search traffic graphs.',
    badge: '/admin/dashboard',
    category: 'Overview',
    supportsInsert: false,
    supportsUpdate: false,
    supportsDelete: false,
  },

  // ── Catalog & Tools ───────────────────────────────────────────────────────
  {
    key: 'tools',
    name: 'AI Tools Directory',
    description: 'Primary AI tools listing, website links, pricing tags, descriptions, and media assets.',
    badge: '/admin/tools',
    category: 'Catalog',
    supportsInsert: true,
    supportsUpdate: true,
    supportsDelete: true,
  },
  {
    key: 'categories',
    name: 'Tool Categories',
    description: 'Tool classification taxonomy, category hierarchy, slugs, and icon definitions.',
    badge: '/admin/tools/categories',
    category: 'Catalog',
    supportsInsert: true,
    supportsUpdate: true,
    supportsDelete: true,
  },
  {
    key: 'tags',
    name: 'Tags',
    description: 'Directory discovery tags, trending tag keywords, and search filters.',
    badge: '/admin/tools/tags',
    category: 'Catalog',
    supportsInsert: true,
    supportsUpdate: true,
    supportsDelete: true,
  },
  {
    key: 'reviews',
    name: 'User Reviews & Ratings',
    description: 'Moderate community tool reviews, public ratings, approval statuses, and feedback.',
    badge: '/admin/tools/reviews',
    category: 'Catalog',
    supportsInsert: false,
    supportsUpdate: true,
    supportsDelete: true,
  },
  {
    key: 'reports',
    name: 'Tool Issue Reports',
    description: 'Investigate broken URLs, pricing discrepancies, outdated features, and DMCA reports.',
    badge: '/admin/tools/reports',
    category: 'Catalog',
    supportsInsert: false,
    supportsUpdate: true,
    supportsDelete: true,
  },

  // ── Content & Editorial ───────────────────────────────────────────────────
  {
    key: 'blog_posts',
    name: 'Blog Articles',
    description: 'Create, author, draft, and publish MDX blog articles, SEO metadata, and authors.',
    badge: '/admin/content/blog-posts',
    category: 'Content',
    supportsInsert: true,
    supportsUpdate: true,
    supportsDelete: true,
  },
  {
    key: 'models',
    name: 'AI Models Catalog',
    description: 'Foundation LLMs, benchmark evaluations, model architectures, and release bulletins.',
    badge: '/admin/updates/models',
    category: 'Content',
    supportsInsert: true,
    supportsUpdate: true,
    supportsDelete: true,
  },
  {
    key: 'news',
    name: 'News Stream',
    description: 'Curate daily AI industry headlines, source links, summaries, and launch bulletins.',
    badge: '/admin/updates/news',
    category: 'Content',
    supportsInsert: true,
    supportsUpdate: true,
    supportsDelete: true,
  },
  {
    key: 'socials',
    name: 'Social Media Feed',
    description: 'Manage YouTube, Twitter/X, Reddit, and Instagram spotlight embeds.',
    badge: '/admin/updates/socials',
    category: 'Content',
    supportsInsert: true,
    supportsUpdate: true,
    supportsDelete: true,
  },

  // ── Operations & Submissions ──────────────────────────────────────────────
  {
    key: 'submissions',
    name: 'Tool Submissions',
    description: 'Review and approve/reject creator-submitted AI tools for platform indexing.',
    badge: '/admin/submissions/tools',
    category: 'Operations',
    supportsInsert: false,
    supportsUpdate: true,
    supportsDelete: true,
  },
  {
    key: 'advertise',
    name: 'Advertise & Sponsored',
    description: 'Manage sponsored tool promotions, banner placements, billing orders, and scheduling.',
    badge: '/admin/submissions/advertise',
    category: 'Operations',
    supportsInsert: true,
    supportsUpdate: true,
    supportsDelete: true,
  },
  {
    key: 'orders',
    name: 'Orders & Payments',
    description: 'Financial transactions, checkout session logs, customer invoices, and refunds.',
    badge: '/admin/submissions/orders',
    category: 'Operations',
    supportsInsert: false,
    supportsUpdate: true,
    supportsDelete: true,
  },

  // ── Audience & Community ──────────────────────────────────────────────────
  {
    key: 'users',
    name: 'User Accounts',
    description: 'Registered platform users, authentication records, saved tools, and upvotes.',
    badge: '/admin/users',
    category: 'Audience',
    supportsInsert: false,
    supportsUpdate: true,
    supportsDelete: true,
  },
  {
    key: 'newsletter',
    name: 'Newsletter Subscribers',
    description: 'Subscriber mailing list, active/unsubscribed statuses, and broadcast recipients.',
    badge: '/admin/newsletter',
    category: 'Audience',
    supportsInsert: false,
    supportsUpdate: true,
    supportsDelete: true,
  },
  {
    key: 'contacts',
    name: 'Contact Inquiries',
    description: 'Incoming support inquiries, contact form messages, and automated status replies.',
    badge: '/admin/contacts',
    category: 'Audience',
    supportsInsert: false,
    supportsUpdate: true,
    supportsDelete: true,
  },

  // ── Account & Settings ────────────────────────────────────────────────────
  {
    key: 'profiles',
    name: 'My Profile & Security',
    description: 'Administrator personal profile details, display name, avatar, and password changes.',
    badge: '/admin/profiles',
    category: 'Account',
    supportsInsert: false,
    supportsUpdate: true,
    supportsDelete: false,
  },
];
