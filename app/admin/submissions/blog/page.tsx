import { redirect } from 'next/navigation';

export default function DeprecatedBlogSubmissionsPage() {
  redirect('/admin/content/blog-posts');
}
