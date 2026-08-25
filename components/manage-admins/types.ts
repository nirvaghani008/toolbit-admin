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
  category: 'Overview' | 'Content' | 'Catalog' | 'Operations' | 'Audience';
  supportsInsert: boolean;
  supportsUpdate: boolean;
  supportsDelete: boolean;
}

export const ADMIN_MODULES: ModuleDefinition[] = [
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
  {
    key: 'tools',
    name: 'Tool Management',
    description: 'Manage AI tools directory, categories, hashtags, user reviews, and tool issue reports.',
    badge: '/admin/tools',
    category: 'Catalog',
    supportsInsert: true,
    supportsUpdate: true,
    supportsDelete: true,
  },
  {
    key: 'blog_posts',
    name: 'Blog Posts',
    description: 'Create, author, draft, and publish MDX blog articles, SEO tags, and categories.',
    badge: '/admin/content/blog-posts',
    category: 'Content',
    supportsInsert: true,
    supportsUpdate: true,
    supportsDelete: true,
  },
  {
    key: 'models',
    name: 'AI Models Catalog',
    description: 'Maintain LLMs, foundation models, benchmark scores, architectures, and release notes.',
    badge: '/admin/updates/models',
    category: 'Catalog',
    supportsInsert: true,
    supportsUpdate: true,
    supportsDelete: true,
  },
  {
    key: 'news',
    name: 'News Stream',
    description: 'Curate daily AI industry news, source links, summaries, and launch bulletins.',
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
  {
    key: 'submissions',
    name: 'Tool & Ad Submissions',
    description: 'Review, approve, or reject user-submitted tools and paid promotion listings.',
    badge: '/admin/submissions',
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
  {
    key: 'users',
    name: 'Users & Newsletter',
    description: 'Registered platform users, bookmarked tools activity, and newsletter subscribers.',
    badge: '/admin/users',
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
];
